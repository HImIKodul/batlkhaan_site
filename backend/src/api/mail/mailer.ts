import fs from "node:fs";
import path from "node:path";
import type { ApiConfig } from "../config.js";
import { renderMailHtml } from "./mail-template.js";
import { GmailApi, GmailError, buildRawMessage, type GmailCredentials } from "./gmail-client.js";

export interface MailMessage { to: string; subject: string; text: string; kind: string; }
export type MailProvider = "mock" | "disabled" | "resend" | "gmail";
/** delivered means accepted by the provider, not confirmed arrival in the inbox. */
export interface MailResult { delivered: boolean; provider: MailProvider; }
export interface Mailer { readonly provider: MailProvider; send(message: MailMessage): Promise<MailResult>; }

/** Development and test mailer: appends the message to a local JSON-lines file. It never leaves the machine and is rejected in production. */
class MockMailer implements Mailer {
  readonly provider = "mock" as const;
  constructor(private readonly dir: string) {}
  async send(message: MailMessage): Promise<MailResult> {
    fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    const file = path.join(this.dir, "outbox.jsonl");
    fs.appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), ...message }) + "\n", { mode: 0o600 });
    return { delivered: true, provider: "mock" };
  }
}

/** Sends nothing. Used when no real mail provider is configured, so callers must never claim a message was delivered. */
class DisabledMailer implements Mailer {
  readonly provider = "disabled" as const;
  async send(message: MailMessage): Promise<MailResult> {
    console.log(JSON.stringify({ ts: new Date().toISOString(), level: "warn", event: "mail_not_delivered", reason: "MMRI_MAIL_PROVIDER=disabled", kind: message.kind }));
    return { delivered: false, provider: "disabled" };
  }
}

/** Sends through the owner's existing Gmail mailbox (Gmail API, OAuth 2.0). Accepted by Gmail = delivered=true (never confirmed arrival). */
export class GmailMailer implements Mailer {
  readonly provider = "gmail" as const;
  constructor(private readonly api: GmailApi, private readonly fromName = "BusinessMRI.mn") {}
  async send(message: MailMessage): Promise<MailResult> {
    try { await this.api.send(buildRawMessage({ from: this.api.user, fromName: this.fromName, to: message.to, subject: message.subject, text: message.text, html: renderMailHtml(message) })); return { delivered: true, provider: "gmail" }; }
    catch (e) { throw new Error(e instanceof GmailError ? `Mail provider request failed (${e.code})` : "Mail provider request failed"); }
  }
}

/** Fixed HTTPS endpoint, bounded request, no redirects, no provider payloads or credentials in logs. */
export class ResendMailer implements Mailer {
  readonly provider = "resend" as const;
  constructor(private readonly apiKey: string, private readonly from: string, private readonly timeoutMs = 5000, private readonly transport: typeof fetch = fetch) {}
  async send(message: MailMessage): Promise<MailResult> {
    if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(message.to) || /[\r\n]/.test(message.subject)) throw new Error("Invalid mail envelope");
    try {
      const response = await this.transport("https://api.resend.com/emails", {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(this.timeoutMs),
        headers: { "authorization": `Bearer ${this.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ from: `BusinessMRI.mn <${this.from}>`, to: [message.to], subject: message.subject, text: message.text, html: renderMailHtml(message), headers: { "Auto-Submitted": "auto-generated" } })
      });
      if (!response.ok) throw new Error("Mail provider rejected request");
      const body = await response.json() as { id?: unknown };
      if (typeof body.id !== "string" || !body.id) throw new Error("Mail provider returned an invalid response");
      return { delivered: true, provider: this.provider };
    } catch {
      // Provider errors can echo addresses, message bodies and credentials: expose only a fixed error.
      throw new Error("Mail provider request failed");
    }
  }
}

/** QA / pilot safety net: when MMRI_MAIL_RECIPIENT_ALLOWLIST is set (comma list of full addresses or @domains), any other recipient is dropped before it reaches the provider.
    Unset (the production default) means no restriction. The dropped address is never logged. */
export function recipientAllowlist(): string[] { return (process.env.MMRI_MAIL_RECIPIENT_ALLOWLIST ?? "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean); }
export function recipientAllowed(to: string, list = recipientAllowlist()): boolean {
  if (list.length === 0) return true;
  const addr = to.trim().toLowerCase();
  return list.some(rule => rule.startsWith("@") ? addr.endsWith(rule) : addr === rule);
}
/** Invitation-only pilot: MMRI_REGISTRATION_ALLOWLIST (comma list of full addresses or @domains) limits who can REGISTER. Unset = open registration. */
export function registrationAllowed(email: string): boolean { return recipientAllowed(email, (process.env.MMRI_REGISTRATION_ALLOWLIST ?? "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean)); }
class AllowlistMailer implements Mailer {
  constructor(private readonly inner: Mailer, private readonly list: string[]) {}
  get provider() { return this.inner.provider; }
  async send(message: MailMessage): Promise<MailResult> {
    if (!recipientAllowed(message.to, this.list)) {
      console.log(JSON.stringify({ ts: new Date().toISOString(), level: "warn", event: "mail_recipient_not_allowlisted", kind: message.kind }));
      return { delivered: false, provider: this.inner.provider };
    }
    return this.inner.send(message);
  }
}

export function createMailer(config: Pick<ApiConfig, "mailProvider" | "mockMailDir" | "resendApiKey" | "mailFrom" | "mailRequestTimeoutMs"> & { gmail?: GmailCredentials }): Mailer {
  let base: Mailer;
  if (config.mailProvider === "gmail") {
    if (!config.gmail) throw new Error("Mail provider configuration missing");
    base = new GmailMailer(new GmailApi(config.gmail, fetch, config.mailRequestTimeoutMs));
  } else
  if (config.mailProvider === "resend") {
    if (!config.resendApiKey || !config.mailFrom) throw new Error("Mail provider configuration missing");
    base = new ResendMailer(config.resendApiKey, config.mailFrom, config.mailRequestTimeoutMs);
  } else base = config.mailProvider === "mock" ? new MockMailer(config.mockMailDir) : new DisabledMailer();
  const list = recipientAllowlist();
  return list.length ? new AllowlistMailer(base, list) : base;
}
