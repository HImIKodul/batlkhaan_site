import { randomUUID } from "node:crypto";
import { prisma } from "../../db.js";
import type { ApiConfig } from "../config.js";
import { unauthorized } from "../errors.js";
import { hashAuditValue, hashPassword, hashRefreshToken, newRefreshToken, signAccessToken, verifyPassword } from "./crypto.js";

/** MMRI-16: a refresh token that was rotated this recently may be presented once more by a second tab/request that read the same cookie before the rotated one arrived. Beyond this window reuse is treated as theft. */
export const REFRESH_REUSE_GRACE_MS = 10_000;

export interface RequestFingerprint { ip?: string; userAgent?: string; }

function publicUser(user: any) {
  return { id: user.id, email: user.email, displayName: user.displayName, status: user.status };
}

export class AuthService {
  private readonly dummyPasswordHash: Promise<string>;
  constructor(private readonly config: ApiConfig) {
    this.dummyPasswordHash=hashPassword("mmri-dummy-password-never-valid",this.config.passwordPepper);
  }

  async register(input: { email: string; password: string; displayName?: string }, fp: RequestFingerprint) {
    const email = normalizeEmail(input.email);
    const existing = await prisma.user.findUnique({ where: { email } });
    const passwordHash = await hashPassword(input.password, this.config.passwordPepper);
    const displayName = cleanName(input.displayName);
    if (!existing) {
      // A duplicate concurrent registration must have the same public result.
      try {
        const user = await prisma.user.create({ data: { email, passwordHash, displayName, emailVerificationRequired: true } });
        await this.audit(user.id, "REGISTER_PENDING_VERIFICATION", fp);
      } catch (error: any) { if (error?.code !== "P2002") throw error; }
    }
    return { accepted: true };
  }

  async login(input: { email: string; password: string }, fp: RequestFingerprint) {
    const email = normalizeEmail(input.email);
    const user = await prisma.user.findUnique({ where: { email } });
    const passwordHash=user?.passwordHash??await this.dummyPasswordHash;
    const valid = await verifyPassword(String(input.password??""), passwordHash, this.config.passwordPepper).catch(()=>false);
    if (!user || !valid || user.status !== "ACTIVE" || user.erasedAt || (user.emailVerificationRequired && !user.emailVerifiedAt)) {
      // The client always gets the same 401 (no account enumeration); operators get the real reason in the audit trail only.
      const reason = !user ? "UNKNOWN_EMAIL" : !valid ? "BAD_PASSWORD" : user.erasedAt ? "ACCOUNT_ERASED" : user.status !== "ACTIVE" ? "ACCOUNT_NOT_ACTIVE" : "EMAIL_NOT_VERIFIED";
      await this.audit(user?.id ?? null, "LOGIN_FAILURE", fp, { emailHash: hashAuditValue(email, this.config.auditSalt), reason });
      throw unauthorized("Invalid email or password");
    }
    return prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`;
      const current=await tx.user.findUnique({where:{id:user.id}});
      if(!current || current.status!=="ACTIVE" || current.erasedAt || (current.emailVerificationRequired&&!current.emailVerifiedAt) || current.passwordHash!==user.passwordHash || current.tokenVersion!==user.tokenVersion) throw unauthorized("Invalid email or password");
      const updated=await tx.user.update({where:{id:user.id},data:{lastLoginAt:new Date()}});
      const session=await this.issueSession(updated,fp,tx);
      await tx.authAuditEvent.create({data:{userId:user.id,eventType:"LOGIN_SUCCESS",ipHash:hashAuditValue(fp.ip,this.config.auditSalt),userAgentHash:hashAuditValue(fp.userAgent,this.config.auditSalt)}});
      return {user:publicUser(updated),...session};
    });
  }

  async refresh(refreshToken: string | undefined, fp: RequestFingerprint) {
    if (!refreshToken) throw unauthorized("Refresh session missing");
    const tokenHash = hashRefreshToken(refreshToken);
    const session = await prisma.refreshSession.findUnique({ where: { tokenHash }, include: { user: true } });
    if (!session) throw unauthorized("Refresh session invalid");
    if (session.revokedAt) {
      if (this.withinReuseGrace(session)) return this.refreshSibling(session, fp);
      // Revoked by logout/expiry (never rotated): the session is simply dead. Not evidence of theft, so do not sign out the user's other devices.
      if (!session.rotatedAt) throw unauthorized("Refresh session revoked");
      await this.revokeReplayedFamily(session);
      await this.audit(session.userId, "REFRESH_REPLAY", fp, { familyId: session.familyId });
      throw unauthorized("Refresh session replay detected");
    }
    if (session.expiresAt <= new Date() || session.user.status !== "ACTIVE" || session.user.erasedAt || (session.user.emailVerificationRequired && !session.user.emailVerifiedAt)) {
      await prisma.refreshSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
      throw unauthorized("Refresh session expired");
    }

    const nextToken = newRefreshToken();
    const nextHash = hashRefreshToken(nextToken);
    const expiresAt = new Date(Date.now() + this.config.refreshTokenTtlSeconds * 1000);
    try {
      await prisma.$transaction(async (tx: any) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${session.userId} FOR UPDATE`;
        const current=await tx.user.findUnique({where:{id:session.userId}});
        if(!current || current.tokenVersion!==session.user.tokenVersion || current.status!=="ACTIVE" || current.erasedAt || (current.emailVerificationRequired&&!current.emailVerifiedAt)) throw unauthorized("Session is no longer valid");
        const rotated = await tx.refreshSession.updateMany({ where: { id: session.id, revokedAt: null }, data: { revokedAt: new Date(), rotatedAt: new Date() } });
        if (rotated.count !== 1) throw new Error("REFRESH_ROTATION_RACE");
        await tx.refreshSession.create({ data: {
          userId: session.userId, tokenHash: nextHash, familyId: session.familyId, expiresAt,
          ipHash: hashAuditValue(fp.ip, this.config.auditSalt), userAgentHash: hashAuditValue(fp.userAgent, this.config.auditSalt)
        }});
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "REFRESH_ROTATION_RACE") throw error;
      // Lost a simultaneous-rotation race. If the winner rotated just now this is a legitimate second tab, not a replay.
      const winner = await prisma.refreshSession.findUnique({ where: { id: session.id }, include: { user: true } });
      if (winner && this.withinReuseGrace(winner)) return this.refreshSibling(winner, fp);
      await this.revokeReplayedFamily(session);
      await this.audit(session.userId, "REFRESH_REPLAY", fp, { familyId: session.familyId, concurrentRotation: true });
      throw unauthorized("Refresh session replay detected");
    }
    await this.audit(session.userId, "REFRESH", fp);
    return {
      user: publicUser(session.user),
      accessToken: signAccessToken({ userId: session.user.id, email: session.user.email, tokenVersion: session.user.tokenVersion, familyId: session.familyId }, this.config),
      refreshToken: nextToken,
      accessTokenExpiresIn: this.config.accessTokenTtlSeconds
    };
  }

  private async revokeReplayedFamily(session: any) {
    await prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${session.userId} FOR UPDATE`;
      await tx.refreshSession.updateMany({where:{familyId:session.familyId,revokedAt:null},data:{revokedAt:new Date()}});
      await tx.user.update({where:{id:session.userId},data:{tokenVersion:{increment:1}}});
    });
  }

  private withinReuseGrace(session: any): boolean {
    return !!session.rotatedAt && Date.now() - session.rotatedAt.getTime() <= REFRESH_REUSE_GRACE_MS
      && session.expiresAt > new Date() && session.user?.status === "ACTIVE" && !session.user.erasedAt && (!session.user.emailVerificationRequired || !!session.user.emailVerifiedAt);
  }

  /** Concurrent-tab recovery: issue an additional live token in the same family. The family stays valid; real replay after the window still revokes it. */
  private async refreshSibling(session: any, fp: RequestFingerprint) {
    return prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${session.userId} FOR UPDATE`;
      const user=await tx.user.findUnique({where:{id:session.userId}});
      if(!user || user.tokenVersion!==session.user.tokenVersion || user.status!=="ACTIVE" || user.erasedAt || (user.emailVerificationRequired&&!user.emailVerifiedAt)) throw unauthorized("Session revoked");
      const live=await tx.refreshSession.findFirst({where:{familyId:session.familyId,revokedAt:null,expiresAt:{gt:new Date()}},select:{id:true}});
      if(!live)throw unauthorized("Refresh session revoked");
      const nextToken=newRefreshToken();
      await tx.refreshSession.create({data:{userId:user.id,tokenHash:hashRefreshToken(nextToken),familyId:session.familyId,expiresAt:new Date(Date.now()+this.config.refreshTokenTtlSeconds*1000),ipHash:hashAuditValue(fp.ip,this.config.auditSalt),userAgentHash:hashAuditValue(fp.userAgent,this.config.auditSalt)}});
      return {user:publicUser(user),accessToken:signAccessToken({userId:user.id,email:user.email,tokenVersion:user.tokenVersion,familyId:session.familyId},this.config),refreshToken:nextToken,accessTokenExpiresIn:this.config.accessTokenTtlSeconds};
    });
  }

  async logout(refreshToken: string | undefined, fp: RequestFingerprint): Promise<void> {
    if (!refreshToken) return;
    const tokenHash = hashRefreshToken(refreshToken);
    const session = await prisma.refreshSession.findUnique({ where: { tokenHash } });
    if (!session) return;
    // Revoke the whole login family (also a stale rotated cookie ends the live session) and, via authenticate(), every access token bound to it. Other devices are separate families and are unaffected.
    await prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${session.userId} FOR UPDATE`;
      await tx.refreshSession.updateMany({where:{familyId:session.familyId,revokedAt:null},data:{revokedAt:new Date()}});
      await tx.authAuditEvent.create({data:{userId:session.userId,eventType:"LOGOUT",ipHash:hashAuditValue(fp.ip,this.config.auditSalt),userAgentHash:hashAuditValue(fp.userAgent,this.config.auditSalt)}});
    });
  }

  private async issueSession(user: any, fp: RequestFingerprint, tx: any = prisma) {
    const refreshToken = newRefreshToken();
    const familyId = randomUUID();
    await tx.refreshSession.create({ data: {
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      familyId,
      expiresAt: new Date(Date.now() + this.config.refreshTokenTtlSeconds * 1000),
      ipHash: hashAuditValue(fp.ip, this.config.auditSalt),
      userAgentHash: hashAuditValue(fp.userAgent, this.config.auditSalt)
    }});
    return {
      accessToken: signAccessToken({ userId: user.id, email: user.email, tokenVersion: user.tokenVersion, familyId }, this.config),
      refreshToken,
      accessTokenExpiresIn: this.config.accessTokenTtlSeconds
    };
  }

  private audit(userId: string | null, eventType: string, fp: RequestFingerprint, metadata?: unknown) {
    return prisma.authAuditEvent.create({ data: {
      userId, eventType,
      ipHash: hashAuditValue(fp.ip, this.config.auditSalt),
      userAgentHash: hashAuditValue(fp.userAgent, this.config.auditSalt),
      metadata: metadata as any
    }});
  }
}

function normalizeEmail(email: string): string {
  const normalized = String(email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || normalized.length > 254) throw new Error("Valid email is required");
  return normalized;
}
function cleanName(name?: string): string | undefined {
  const value = name?.trim();
  if (!value) return undefined;
  if (value.length > 120) throw new Error("Display name is too long");
  return value;
}
