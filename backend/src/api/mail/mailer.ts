import fs from "node:fs";
import path from "node:path";
import type { ApiConfig } from "../config.js";

export interface MailMessage { to: string; subject: string; text: string; kind: string; }
export interface MailResult { delivered: boolean; provider: "mock" | "disabled"; }
export interface Mailer { readonly provider: "mock" | "disabled"; send(message: MailMessage): Promise<MailResult>; }

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

export function createMailer(config: Pick<ApiConfig, "mailProvider" | "mockMailDir">): Mailer {
  return config.mailProvider === "mock" ? new MockMailer(config.mockMailDir) : new DisabledMailer();
}
