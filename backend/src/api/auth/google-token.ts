import { createPublicKey, createVerify } from "node:crypto";
import { ApiError } from "../errors.js";

/* Google Identity Services ID-token verification (no third-party library). The server checks, in this order:
   header (RS256 + known key id) -> RSA signature against Google's published keys -> issuer -> audience (OUR client id) -> expiry/issued-at -> subject -> e-mail.
   The OAuth client SECRET is never used or needed: ID tokens are verified with Google's public keys. Only the public client id is configured. */
export const GOOGLE_PROVIDER = "google";
const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);
const CLOCK_SKEW_SECONDS = 60;
const MAX_TOKEN_LENGTH = 8192;

export interface GoogleClaims { subject: string; email: string; emailVerified: boolean; name?: string; }
type Jwk = { kid: string; kty: string; alg?: string; n: string; e: string };
export type JwksFetcher = () => Promise<{ keys: Jwk[]; maxAgeSeconds: number }>;

const b64url = (s: string) => Buffer.from(s, "base64url");
const bad = () => new ApiError(401, "GOOGLE_TOKEN_INVALID", "Google-ээр баталгаажуулж чадсангүй. Дахин оролдоно уу.");

export async function fetchGoogleJwks(): Promise<{ keys: Jwk[]; maxAgeSeconds: number }> {
  const r = await fetch(JWKS_URL, { signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`jwks ${r.status}`);
  const maxAge = /max-age=(\d+)/.exec(r.headers.get("cache-control") ?? "")?.[1];
  const body = await r.json() as { keys?: Jwk[] };
  return { keys: body.keys ?? [], maxAgeSeconds: Math.min(Number(maxAge ?? 3600), 86_400) };
}

export class GoogleTokenVerifier {
  private cache: { keys: Jwk[]; until: number } | null = null;
  constructor(private readonly clientId: string, private readonly fetchJwks: JwksFetcher = fetchGoogleJwks, private readonly now: () => number = () => Date.now()) {}
  get enabled() { return this.clientId.length > 0; }

  private async keys(force = false): Promise<Jwk[]> {
    if (!force && this.cache && this.cache.until > this.now()) return this.cache.keys;
    const got = await this.fetchJwks();
    this.cache = { keys: got.keys, until: this.now() + got.maxAgeSeconds * 1000 };
    return got.keys;
  }

  async verify(idToken: unknown): Promise<GoogleClaims> {
    if (!this.enabled) throw new ApiError(404, "GOOGLE_SIGNIN_DISABLED", "Google-ээр нэвтрэх тохиргоо идэвхгүй байна.");
    if (typeof idToken !== "string" || idToken.length === 0 || idToken.length > MAX_TOKEN_LENGTH) throw bad();
    const parts = idToken.split(".");
    if (parts.length !== 3) throw bad();
    let header: any, payload: any;
    try { header = JSON.parse(b64url(parts[0]).toString("utf8")); payload = JSON.parse(b64url(parts[1]).toString("utf8")); } catch { throw bad(); }
    if (header?.alg !== "RS256" || typeof header.kid !== "string") throw bad();
    let jwk = (await this.keys().catch(() => { throw new ApiError(503, "GOOGLE_KEYS_UNAVAILABLE", "Google-ийн түлхүүрийг авч чадсангүй. Түр хүлээгээд дахин оролдоно уу."); })).find(k => k.kid === header.kid);
    if (!jwk) jwk = (await this.keys(true).catch(() => [] as Jwk[])).find(k => k.kid === header.kid);
    if (!jwk || jwk.kty !== "RSA") throw bad();
    const verifier = createVerify("RSA-SHA256"); verifier.update(`${parts[0]}.${parts[1]}`);
    let signatureOk = false;
    try { signatureOk = verifier.verify(createPublicKey({ key: jwk as any, format: "jwk" }), b64url(parts[2])); } catch { signatureOk = false; }
    if (!signatureOk) throw bad();
    const nowSec = Math.floor(this.now() / 1000);
    if (!ISSUERS.has(payload?.iss)) throw bad();
    const aud = payload?.aud; if (!(aud === this.clientId || (Array.isArray(aud) && aud.length === 1 && aud[0] === this.clientId))) throw bad();
    if (typeof payload.exp !== "number" || payload.exp + CLOCK_SKEW_SECONDS < nowSec) throw bad();
    if (typeof payload.iat === "number" && payload.iat - CLOCK_SKEW_SECONDS > nowSec) throw bad();
    if (typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 255) throw bad();
    const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw bad();
    const emailVerified = payload.email_verified === true || payload.email_verified === "true";
    return { subject: payload.sub, email, emailVerified, name: typeof payload.name === "string" ? payload.name.trim().slice(0, 120) || undefined : undefined };
  }
}
