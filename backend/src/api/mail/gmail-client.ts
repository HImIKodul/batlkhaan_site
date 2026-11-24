/* Minimal Gmail API client (OAuth 2.0 refresh-token flow). No Google SDK: two fixed HTTPS hosts, bounded requests, no redirects.
   Scopes the owner grants once: gmail.readonly (read the support inbox) and gmail.send (send mail and replies). It never modifies, labels or deletes Gmail messages.
   Provider errors can echo addresses, bodies and tokens, so only fixed error codes and messages leave this module. Nothing here logs a credential. */
import { randomBytes } from "node:crypto";
export interface GmailCredentials { clientId: string; clientSecret: string; refreshToken: string; user: string; }
export type GmailErrorCode = "AUTH" | "RATE_LIMIT" | "PROVIDER" | "NETWORK" | "BAD_INPUT";
export class GmailError extends Error {
  constructor(readonly code: GmailErrorCode, message: string) { super(message); this.name = "GmailError"; }
}
export interface GmailParsedMessage {
  id: string; threadId: string; from: string; fromName: string | null; to: string; subject: string; text: string; sentAt: Date; rfcMessageId: string | null; references: string | null; attachments: number; labels: string[];
}
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://gmail.googleapis.com/gmail/v1/users/me";
export const MAX_BODY_CHARS = 20_000;
const oneLine = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u001F\u007F]+/g, " ").trim().slice(0, max);
const b64urlDecode = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
export const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Plain-text view of an e-mail body. HTML is never passed on: tags, scripts and styles are dropped and entities decoded, so message content cannot reach the admin UI as markup. */
export function htmlToText(html: string): string {
  return html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n").replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}
const mimeWord = (s: string) => /^[\x20-\x7E]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`;
/** RFC 5322 plain-text message. Every header value is validated against CR/LF (header injection) before use. */
export function buildRawMessage(m: { from: string; fromName?: string; to: string; subject: string; text: string; html?: string; inReplyTo?: string | null; references?: string | null }): string {
  const hv = (v: string, what: string) => { if (/[\r\n\u0000]/.test(v)) throw new GmailError("BAD_INPUT", `Invalid ${what}`); return v; };
  const addr = (v: string, what: string) => { if (!/^[^\s<>@,;"]+@[^\s<>@,;"]+\.[^\s<>@,;"]+$/.test(v)) throw new GmailError("BAD_INPUT", `Invalid ${what}`); return v; };
  const from = addr(m.from, "sender"), to = addr(m.to, "recipient");
  const headers = [
    `From: ${m.fromName ? `${mimeWord(hv(m.fromName.replace(/[<>"]/g, ""), "sender name"))} <${from}>` : from}`,
    `To: ${to}`, `Subject: ${mimeWord(hv(m.subject, "subject"))}`, "MIME-Version: 1.0"
  ];
  if (m.inReplyTo) headers.push(`In-Reply-To: ${hv(m.inReplyTo, "reference")}`);
  if (m.references) headers.push(`References: ${hv(m.references, "reference")}`);
  const part = (type: string, v: string) => `Content-Type: ${type}; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from(v.replace(/\r?\n/g, "\r\n"), "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n")}`;
  if (m.html === undefined) return b64url(Buffer.from(`${headers.join("\r\n")}\r\n${part("text/plain", m.text)}`, "utf8"));
  // Automatic message: RFC 3834 marker, then multipart/alternative with the plain text first.
  const boundary = `mmri-${randomBytes(12).toString("hex")}`;
  headers.push("Auto-Submitted: auto-generated", `Content-Type: multipart/alternative; boundary="${boundary}"`);
  return b64url(Buffer.from(`${headers.join("\r\n")}\r\n\r\n--${boundary}\r\n${part("text/plain", m.text)}\r\n--${boundary}\r\n${part("text/html", m.html)}\r\n--${boundary}--\r\n`, "utf8"));
}
function header(payload: any, name: string): string { const h = (payload?.headers ?? []).find((x: any) => String(x.name).toLowerCase() === name.toLowerCase()); return h ? String(h.value ?? "") : ""; }
function collect(part: any, out: { plain: string[]; html: string[]; attachments: number }) {
  if (!part) return;
  const mt = String(part.mimeType ?? "");
  if (part.filename && String(part.filename).length) { out.attachments++; return; }
  if (part.body?.data && mt === "text/plain") out.plain.push(b64urlDecode(part.body.data).toString("utf8"));
  else if (part.body?.data && mt === "text/html") out.html.push(b64urlDecode(part.body.data).toString("utf8"));
  else if (part.body?.attachmentId) out.attachments++;
  for (const p of part.parts ?? []) collect(p, out);
}
export function parseGmailMessage(raw: any): GmailParsedMessage {
  const p = raw?.payload, out = { plain: [] as string[], html: [] as string[], attachments: 0 };
  collect(p, out);
  const text = (out.plain.length ? out.plain.join("\n") : htmlToText(out.html.join("\n"))).replace(/\u0000/g, "").slice(0, MAX_BODY_CHARS);
  const fromRaw = header(p, "From"), m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(fromRaw);
  const from = (m ? m[2] : fromRaw).trim().toLowerCase();
  const ts = Number(raw?.internalDate); 
  return { id: String(raw.id), threadId: String(raw.threadId), from: oneLine(from, 200), fromName: m && m[1].trim() ? oneLine(m[1], 120) : null, to: oneLine(header(p, "To"), 300), subject: oneLine(header(p, "Subject"), 200) || "(гарчиггүй)",
    text, sentAt: Number.isFinite(ts) && ts > 0 ? new Date(ts) : new Date(), rfcMessageId: oneLine(header(p, "Message-ID") || header(p, "Message-Id"), 300) || null, references: oneLine(header(p, "References"), 1000) || null, attachments: out.attachments, labels: Array.isArray(raw.labelIds) ? raw.labelIds.map(String) : [] };
}

export class GmailApi {
  private token: { value: string; exp: number } | null = null;
  constructor(private readonly creds: GmailCredentials, private readonly transport: typeof fetch = fetch, private readonly timeoutMs = 8000) {}
  get user() { return this.creds.user; }
  private async fetchJson(url: string, init: RequestInit): Promise<any> {
    let r: Response;
    try { r = await this.transport(url, { ...init, redirect: "error", signal: AbortSignal.timeout(this.timeoutMs) }); } catch { throw new GmailError("NETWORK", "Gmail холболт амжилтгүй."); }
    /* Google answers 403 both for a bad grant and for per-user quota bursts (reason rateLimitExceeded / userRateLimitExceeded); only the former means "reconnect". */
    if (r.status === 403) { let reason = ""; try { const j: any = await r.clone().json(); reason = String(j?.error?.errors?.[0]?.reason ?? j?.error?.status ?? ""); } catch { /* body unreadable: treat as auth */ } if (/ratelimit|quota/i.test(reason)) throw new GmailError("RATE_LIMIT", "Gmail түр хязгаарласан. Дахин оролдоно уу."); }
    if (r.status === 401 || r.status === 403) { this.token = null; throw new GmailError("AUTH", "Gmail эрх дууссан эсвэл хүчингүй. Дахин холбоно уу."); }
    if (r.status === 429) throw new GmailError("RATE_LIMIT", "Gmail түр хязгаарласан. Дахин оролдоно уу.");
    if (!r.ok) throw new GmailError("PROVIDER", "Gmail хүсэлтийг хүлээн авсангүй.");
    try { return await r.json(); } catch { throw new GmailError("PROVIDER", "Gmail буруу хариу өглөө."); }
  }
  private async accessToken(): Promise<string> {
    if (this.token && this.token.exp > Date.now() + 60_000) return this.token.value;
    let r: Response;
    try {
      r = await this.transport(TOKEN_URL, { method: "POST", redirect: "error", signal: AbortSignal.timeout(this.timeoutMs), headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: this.creds.clientId, client_secret: this.creds.clientSecret, refresh_token: this.creds.refreshToken, grant_type: "refresh_token" }).toString() });
    } catch { throw new GmailError("NETWORK", "Gmail холболт амжилтгүй."); }
    if (r.status === 400 || r.status === 401) throw new GmailError("AUTH", "Gmail эрх дууссан эсвэл хүчингүй. Дахин холбоно уу.");
    if (!r.ok) throw new GmailError("PROVIDER", "Gmail хүсэлтийг хүлээн авсангүй.");
    const j: any = await r.json().catch(() => null);
    if (!j || typeof j.access_token !== "string") throw new GmailError("PROVIDER", "Gmail буруу хариу өглөө.");
    this.token = { value: j.access_token, exp: Date.now() + Math.max(60, Number(j.expires_in) || 3000) * 1000 };
    return this.token.value;
  }
  private async authed(path: string, init: RequestInit = {}) {
    const t = await this.accessToken();
    return this.fetchJson(`${API}${path}`, { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${t}`, ...(init.body ? { "content-type": "application/json" } : {}) } });
  }
  async send(raw: string, threadId?: string): Promise<{ id: string; threadId: string }> {
    const j = await this.authed("/messages/send", { method: "POST", body: JSON.stringify(threadId ? { raw, threadId } : { raw }) });
    if (typeof j?.id !== "string") throw new GmailError("PROVIDER", "Gmail буруу хариу өглөө.");
    return { id: j.id, threadId: String(j.threadId ?? "") };
  }
  async list(query: string, max = 50): Promise<{ id: string; threadId: string }[]> {
    const j = await this.authed(`/messages?${new URLSearchParams({ q: query, maxResults: String(Math.min(100, Math.max(1, max))) })}`);
    return (j?.messages ?? []).map((m: any) => ({ id: String(m.id), threadId: String(m.threadId) }));
  }
  async get(id: string): Promise<GmailParsedMessage> {
    if (!/^[A-Za-z0-9_-]{6,64}$/.test(id)) throw new GmailError("BAD_INPUT", "Invalid message id");
    return parseGmailMessage(await this.authed(`/messages/${id}?format=full`));
  }
}
