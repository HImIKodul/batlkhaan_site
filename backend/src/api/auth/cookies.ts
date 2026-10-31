import type { ApiConfig } from "../config.js";

export function parseCookies(header: string | undefined): Record<string,string> {
  const out: Record<string,string> = {};
  for (const part of (header ?? "").split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const name=part.slice(0,idx).trim();
    try{out[name] = decodeURIComponent(part.slice(idx+1).trim());}catch{continue;}
  }
  return out;
}

export function refreshCookie(value: string, config: ApiConfig): string {
  const attrs = [
    `${config.refreshCookieName}=${encodeURIComponent(value)}`,
    "HttpOnly",
    "SameSite=Strict",
    "Path=/api/v1/auth",
    `Max-Age=${config.refreshTokenTtlSeconds}`
  ];
  if (config.cookieSecure) attrs.push("Secure");
  return attrs.join("; ");
}

export function clearRefreshCookie(config: ApiConfig): string {
  const attrs = [
    `${config.refreshCookieName}=`, "HttpOnly", "SameSite=Strict", "Path=/api/v1/auth", "Max-Age=0"
  ];
  if (config.cookieSecure) attrs.push("Secure");
  return attrs.join("; ");
}
