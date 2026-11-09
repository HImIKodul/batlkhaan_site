import { createCipheriv, createDecipheriv, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/* RFC 6238 TOTP (SHA-1, 6 digits, 30 s) with base32 secrets, plus AES-256-GCM encryption of the secret at rest. No third-party code. */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}
export function base32Decode(text: string): Buffer {
  let bits = 0, value = 0; const out: number[] = [];
  for (const ch of text.replace(/=+$/, "").toUpperCase()) { const i = ALPHABET.indexOf(ch); if (i < 0) throw new Error("invalid base32"); value = (value << 5) | i; bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}
export function newTotpSecret(): string { return base32Encode(randomBytes(20)); }
export function hotp(secret: Buffer, counter: number): string {
  const c = Buffer.alloc(8); c.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", secret).update(c).digest();
  const o = h[h.length - 1] & 15;
  const bin = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(bin % 1_000_000).padStart(6, "0");
}
export const totpStep = (nowMs = Date.now()) => Math.floor(nowMs / 30_000);
/** Returns the matched time step (so the caller can refuse a replay of the same code) or null. Accepts the previous and next step for clock drift. */
export function verifyTotp(secretBase32: string, code: string, nowMs = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const secret = base32Decode(secretBase32); const step = totpStep(nowMs);
  for (const s of [step, step - 1, step + 1]) { const expected = Buffer.from(hotp(secret, s)); if (timingSafeEqual(expected, Buffer.from(code))) return s; }
  return null;
}
export function otpauthUri(email: string, secretBase32: string, issuer = "BusinessMMRI Admin"): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
const key = (master: string) => scryptSync(master, "mmri-admin-mfa-v1", 32);
export function encryptSecret(plain: string, master: string): string {
  const iv = randomBytes(12); const c = createCipheriv("aes-256-gcm", key(master), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), enc.toString("base64url")].join(".");
}
export function decryptSecret(token: string, master: string): string {
  const [v, iv, tag, enc] = token.split(".");
  if (v !== "v1") throw new Error("unsupported secret format");
  const d = createDecipheriv("aes-256-gcm", key(master), Buffer.from(iv, "base64url")); d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(enc, "base64url")), d.final()]).toString("utf8");
}
