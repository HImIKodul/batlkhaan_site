import { createHash, createHmac, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import type { ApiConfig } from "../config.js";
import { unauthorized } from "../errors.js";

const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;

function b64url(input: Buffer | string): string {
  return typeof input === "string"
    ? Buffer.from(input, "utf8").toString("base64url")
    : input.toString("base64url");
}

function fromB64url(input: string): Buffer {
  return Buffer.from(input, "base64url");
}

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: 64 * 1024 * 1024 }, (err, key) => {
      if (err) reject(err); else resolve(key as Buffer);
    });
  });
}

export function validatePasswordPolicy(password: string): void {
  if (typeof password !== "string" || password.length < 10 || password.length > 128) {
    throw new Error("Password must contain 10–128 characters");
  }
}

export async function hashPassword(password: string, pepper: string): Promise<string> {
  validatePasswordPolicy(password);
  const salt = randomBytes(16);
  const key = await scryptAsync(password + pepper, salt);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${b64url(salt)}$${b64url(key)}`;
}

export async function verifyPassword(password: string, encoded: string, pepper: string): Promise<boolean> {
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltText, expectedText] = parts;
  if (Number(n) !== SCRYPT_N || Number(r) !== SCRYPT_R || Number(p) !== SCRYPT_P) return false;
  const salt = fromB64url(saltText);
  const expected = fromB64url(expectedText);
  const actual = await scryptAsync(password + pepper, salt);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export interface AccessTokenClaims {
  sub: string;
  email: string;
  tv: number;
  /** Refresh-session family this access token is bound to (absent on tokens issued before MMRI-19). */
  fid?: string;
  jti: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}

export function signAccessToken(input: { userId: string; email: string; tokenVersion: number; familyId?: string }, config: ApiConfig): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const claims: AccessTokenClaims = {
    sub: input.userId,
    email: input.email,
    tv: input.tokenVersion,
    ...(input.familyId ? { fid: input.familyId } : {}),
    jti: randomUUID(),
    iss: config.issuer,
    aud: config.audience,
    iat: now,
    exp: now + config.accessTokenTtlSeconds
  };
  const payload = b64url(JSON.stringify(claims));
  const body = `${header}.${payload}`;
  const signature = createHmac("sha256", config.accessTokenSecret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyAccessToken(token: string, config: ApiConfig): AccessTokenClaims {
  const parts = token.split(".");
  if (parts.length !== 3) throw unauthorized("Invalid access token");
  const [header, payload, signature] = parts;
  const expected = createHmac("sha256", config.accessTokenSecret).update(`${header}.${payload}`).digest();
  let actual: Buffer;
  try { actual = Buffer.from(signature, "base64url"); } catch { throw unauthorized("Invalid access token"); }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw unauthorized("Invalid access token");
  let parsedHeader: {alg?:string;typ?:string};
  let claims: AccessTokenClaims;
  try {
    parsedHeader = JSON.parse(Buffer.from(header, "base64url").toString("utf8"));
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch { throw unauthorized("Invalid access token"); }
  if(parsedHeader.alg!=="HS256"||parsedHeader.typ!=="JWT")throw unauthorized("Invalid access token");
  const now = Math.floor(Date.now() / 1000);
  if (
    claims.iss !== config.issuer || claims.aud !== config.audience ||
    typeof claims.sub!=="string" || !claims.sub || typeof claims.email!=="string" || !claims.email ||
    !Number.isSafeInteger(claims.tv) || claims.tv<0 || (claims.fid!==undefined&&(typeof claims.fid!=="string"||!claims.fid)) || typeof claims.jti!=="string" || !claims.jti ||
    !Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp) ||
    claims.iat > now + 60 || claims.exp <= now || claims.exp <= claims.iat ||
    claims.exp - claims.iat > config.accessTokenTtlSeconds + 5
  ) throw unauthorized("Access token expired or invalid");
  return claims;
}

export function newRefreshToken(): string { return randomBytes(48).toString("base64url"); }
export function hashRefreshToken(token: string): string { return createHash("sha256").update(token).digest("hex"); }
export function hashAuditValue(value: string | undefined, salt: string): string | null {
  if (!value) return null;
  return createHash("sha256").update(`${salt}:${value}`).digest("hex");
}
