import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../../db.js";
import type { ApiConfig } from "../config.js";

/* TRUSTED DEVICES ("remember this device"). The browser keeps a random 256-bit secret in an HttpOnly, SameSite=Strict cookie; the database keeps only its SHA-256 hash, the owner and an expiry (30 days).
   It is a revocable credential, never a browser fingerprint: it is bound to ONE user, can be revoked, and dies with a password change, a password reset or an account deletion. An unknown, expired,
   revoked or other-user token simply means "not trusted", and the e-mail code is asked again. */
export const TRUSTED_DEVICE_COOKIE = "mmri_td";
export const TRUSTED_DEVICE_DAYS = 30;
const hash = (t: string) => createHash("sha256").update(`mmri-trusted-device:${t}`).digest("hex");
const attrs = (config: ApiConfig, maxAge: number) => ["HttpOnly", "SameSite=Strict", "Path=/api/v1", `Max-Age=${maxAge}`, ...(config.cookieSecure ? ["Secure"] : [])].join("; ");
export const trustedCookie = (token: string, config: ApiConfig) => `${TRUSTED_DEVICE_COOKIE}=${encodeURIComponent(token)}; ${attrs(config, TRUSTED_DEVICE_DAYS * 86400)}`;
export const clearTrustedCookie = (config: ApiConfig) => `${TRUSTED_DEVICE_COOKIE}=; ${attrs(config, 0)}`;

export function loginDeviceVerificationOn(): boolean { return (process.env.MMRI_LOGIN_DEVICE_VERIFICATION ?? "on").trim().toLowerCase() !== "off"; }

export async function isTrustedDevice(userId: string, token: string | undefined): Promise<boolean> {
  if (!token || token.length < 20 || token.length > 200) return false;
  const row = await prisma.trustedDevice.findUnique({ where: { tokenHash: hash(token) } });
  if (!row || row.userId !== userId || row.revokedAt || row.expiresAt <= new Date()) return false;
  await prisma.trustedDevice.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  return true;
}
export async function createTrustedDevice(userId: string, userAgentHash: string | null): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await prisma.trustedDevice.create({ data: { userId, tokenHash: hash(token), userAgentHash, expiresAt: new Date(Date.now() + TRUSTED_DEVICE_DAYS * 86_400_000) } });
  return token;
}
export async function revokeTrustedDevices(userId: string, tx: any = prisma): Promise<void> {
  await tx.trustedDevice.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}
