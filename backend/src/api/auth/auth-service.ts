import { randomUUID } from "node:crypto";
import { prisma } from "../../db.js";
import type { ApiConfig } from "../config.js";
import { conflict, unauthorized } from "../errors.js";
import { hashAuditValue, hashPassword, hashRefreshToken, newRefreshToken, signAccessToken, verifyPassword } from "./crypto.js";

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
    if (existing) throw conflict("An account with this email already exists");
    const passwordHash = await hashPassword(input.password, this.config.passwordPepper);
    const user = await prisma.user.create({ data: { email, passwordHash, displayName: cleanName(input.displayName) } });
    await this.audit(user.id, "REGISTER", fp);
    const session = await this.issueSession(user, fp);
    return { user: publicUser(user), ...session };
  }

  async login(input: { email: string; password: string }, fp: RequestFingerprint) {
    const email = normalizeEmail(input.email);
    const user = await prisma.user.findUnique({ where: { email } });
    const passwordHash=user?.passwordHash??await this.dummyPasswordHash;
    const valid = await verifyPassword(String(input.password??""), passwordHash, this.config.passwordPepper).catch(()=>false);
    if (!user || !valid || user.status !== "ACTIVE") {
      await this.audit(user?.id ?? null, "LOGIN_FAILURE", fp, { emailHash: hashAuditValue(email, this.config.auditSalt) });
      throw unauthorized("Invalid email or password");
    }
    const updated = await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit(user.id, "LOGIN_SUCCESS", fp);
    const session = await this.issueSession(updated, fp);
    return { user: publicUser(updated), ...session };
  }

  async refresh(refreshToken: string | undefined, fp: RequestFingerprint) {
    if (!refreshToken) throw unauthorized("Refresh session missing");
    const tokenHash = hashRefreshToken(refreshToken);
    const session = await prisma.refreshSession.findUnique({ where: { tokenHash }, include: { user: true } });
    if (!session) throw unauthorized("Refresh session invalid");
    if (session.revokedAt) {
      await prisma.$transaction([
        prisma.refreshSession.updateMany({ where: { familyId: session.familyId, revokedAt: null }, data: { revokedAt: new Date() } }),
        prisma.user.update({ where: { id: session.userId }, data: { tokenVersion: { increment: 1 } } })
      ]);
      await this.audit(session.userId, "REFRESH_REPLAY", fp, { familyId: session.familyId });
      throw unauthorized("Refresh session replay detected");
    }
    if (session.expiresAt <= new Date() || session.user.status !== "ACTIVE") {
      await prisma.refreshSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
      throw unauthorized("Refresh session expired");
    }

    const nextToken = newRefreshToken();
    const nextHash = hashRefreshToken(nextToken);
    const expiresAt = new Date(Date.now() + this.config.refreshTokenTtlSeconds * 1000);
    try {
      await prisma.$transaction(async (tx: any) => {
        const rotated = await tx.refreshSession.updateMany({ where: { id: session.id, revokedAt: null }, data: { revokedAt: new Date(), rotatedAt: new Date() } });
        if (rotated.count !== 1) throw new Error("REFRESH_ROTATION_RACE");
        await tx.refreshSession.create({ data: {
          userId: session.userId, tokenHash: nextHash, familyId: session.familyId, expiresAt,
          ipHash: hashAuditValue(fp.ip, this.config.auditSalt), userAgentHash: hashAuditValue(fp.userAgent, this.config.auditSalt)
        }});
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "REFRESH_ROTATION_RACE") throw error;
      await prisma.$transaction([
        prisma.refreshSession.updateMany({ where: { familyId: session.familyId, revokedAt: null }, data: { revokedAt: new Date() } }),
        prisma.user.update({ where: { id: session.userId }, data: { tokenVersion: { increment: 1 } } })
      ]);
      await this.audit(session.userId, "REFRESH_REPLAY", fp, { familyId: session.familyId, concurrentRotation: true });
      throw unauthorized("Refresh session replay detected");
    }
    await this.audit(session.userId, "REFRESH", fp);
    return {
      user: publicUser(session.user),
      accessToken: signAccessToken({ userId: session.user.id, email: session.user.email, tokenVersion: session.user.tokenVersion }, this.config),
      refreshToken: nextToken,
      accessTokenExpiresIn: this.config.accessTokenTtlSeconds
    };
  }

  async logout(refreshToken: string | undefined, fp: RequestFingerprint): Promise<void> {
    if (!refreshToken) return;
    const tokenHash = hashRefreshToken(refreshToken);
    const session = await prisma.refreshSession.findUnique({ where: { tokenHash } });
    if (!session) return;
    if (!session.revokedAt) await prisma.refreshSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    await this.audit(session.userId, "LOGOUT", fp);
  }

  private async issueSession(user: any, fp: RequestFingerprint) {
    const refreshToken = newRefreshToken();
    const familyId = randomUUID();
    await prisma.refreshSession.create({ data: {
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      familyId,
      expiresAt: new Date(Date.now() + this.config.refreshTokenTtlSeconds * 1000),
      ipHash: hashAuditValue(fp.ip, this.config.auditSalt),
      userAgentHash: hashAuditValue(fp.userAgent, this.config.auditSalt)
    }});
    return {
      accessToken: signAccessToken({ userId: user.id, email: user.email, tokenVersion: user.tokenVersion }, this.config),
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
