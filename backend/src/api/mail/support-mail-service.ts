/* Support inbox: imports customer e-mails from the business Gmail mailbox (or, in QA, a file-based mock mailbox), shows them as conversations and sends replies.
   Rules: read + send only (nothing in Gmail is changed or deleted); bodies are stored as plain text; attachments are counted, never stored; a message id is imported once
   (UNIQUE gmailMessageId); a reply goes only to the sender of the conversation, never to an address typed by an administrator; QA allow-list is honoured; email content
   is data and is never interpreted as a command. */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { prisma } from "../../db.js";
import type { ApiConfig } from "../config.js";
import { ApiError, badRequest, notFound } from "../errors.js";
import { GmailApi, GmailError, buildRawMessage, htmlToText, MAX_BODY_CHARS, type GmailParsedMessage } from "./gmail-client.js";
import { recipientAllowed } from "./mailer.js";

export interface SupportSource {
  readonly kind: "gmail" | "mock"; readonly user: string;
  listInbound(knownIds: Set<string>, max: number): Promise<GmailParsedMessage[]>;
  send(m: { to: string; subject: string; text: string; inReplyTo: string | null; references: string | null; threadId: string }): Promise<{ id: string; threadId: string }>;
}

class GmailSource implements SupportSource {
  readonly kind = "gmail" as const;
  constructor(private readonly api: GmailApi) {}
  get user() { return this.api.user; }
  async listInbound(known: Set<string>, max: number) {
    const ids = await this.api.list("in:inbox newer_than:30d -in:chats", max);
    const out: GmailParsedMessage[] = [];
    for (const m of ids) { if (known.has(m.id)) continue; out.push(await this.api.get(m.id)); }
    return out;
  }
  async send(m: { to: string; subject: string; text: string; inReplyTo: string | null; references: string | null; threadId: string }) {
    return this.api.send(buildRawMessage({ from: this.api.user, fromName: "BusinessMRI.mn", to: m.to, subject: m.subject, text: m.text, inReplyTo: m.inReplyTo, references: m.references }), m.threadId);
  }
}
/** QA source: `support-inbox.jsonl` in the mock mailbox directory is the "inbox"; replies are appended to `outbox.jsonl` (kind SUPPORT_REPLY). Never leaves the machine. */
class MockSource implements SupportSource {
  readonly kind = "mock" as const; readonly user = "support@mock.local";
  constructor(private readonly dir: string) {}
  async listInbound(known: Set<string>, max: number) {
    const f = path.join(this.dir, "support-inbox.jsonl");
    if (!fs.existsSync(f)) return [];
    const rows = fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    return rows.filter((r: any) => typeof r.id === "string" && !known.has(r.id)).slice(0, max).map((r: any): GmailParsedMessage => ({
      id: r.id, threadId: String(r.threadId ?? r.id), from: String(r.from ?? "").toLowerCase().slice(0, 200), fromName: r.fromName ? String(r.fromName).slice(0, 120) : null, to: String(r.to ?? this.user).slice(0, 300),
      subject: String(r.subject ?? "(гарчиггүй)").replace(/[\r\n]+/g, " ").slice(0, 200), text: String(r.text ?? htmlToText(String(r.html ?? ""))).slice(0, MAX_BODY_CHARS), sentAt: new Date(r.date ?? Date.now()),
      rfcMessageId: r.messageId ? String(r.messageId).slice(0, 300) : null, references: null, attachments: Number(r.attachments) || 0, labels: ["INBOX"] }));
  }
  async send(m: { to: string; subject: string; text: string; inReplyTo: string | null; references: string | null; threadId: string }) {
    fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    fs.appendFileSync(path.join(this.dir, "outbox.jsonl"), JSON.stringify({ at: new Date().toISOString(), to: m.to, subject: m.subject, text: m.text, kind: "SUPPORT_REPLY", inReplyTo: m.inReplyTo }) + "\n", { mode: 0o600 });
    return { id: `mock-out-${randomUUID()}`, threadId: m.threadId };
  }
}

const oneLine = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u001F\u007F]+/g, " ").trim().slice(0, max);
const SYNC_MIN_INTERVAL_MS = 30_000;
export type SyncResult = { imported: number; threads: number; skipped?: string; error?: string };

export class SupportMailService {
  private source: SupportSource | null = null;
  private syncing = false;
  private lastSyncAt = 0;
  private lastResult: SyncResult | null = null;
  constructor(private readonly config: ApiConfig) {
    if (config.supportMailProvider === "gmail" && config.gmail) this.source = new GmailSource(new GmailApi(config.gmail, fetch, 10_000));
    else if (config.supportMailProvider === "mock") this.source = new MockSource(config.mockMailDir);
  }
  status() { return { provider: this.config.supportMailProvider, connected: Boolean(this.source), mailbox: this.source?.kind === "gmail" ? this.source.user : null, lastSyncAt: this.lastSyncAt ? new Date(this.lastSyncAt).toISOString() : null, lastResult: this.lastResult }; }

  async sync(force = false): Promise<SyncResult> {
    if (!this.source) return { imported: 0, threads: 0, skipped: "support mailbox is not connected" };
    if (this.syncing) return { imported: 0, threads: 0, skipped: "sync already running" };
    if (!force && Date.now() - this.lastSyncAt < SYNC_MIN_INTERVAL_MS) return this.lastResult ?? { imported: 0, threads: 0, skipped: "recent sync" };
    this.syncing = true;
    try {
      const known = new Set((await prisma.$queryRaw<{ g: string }[]>`SELECT "gmailMessageId" AS g FROM support_mail_messages ORDER BY "createdAt" DESC LIMIT 2000`).map(r => r.g));
      const msgs = await this.source.listInbound(known, 50);
      let imported = 0; const touched = new Set<string>();
      for (const m of msgs.sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime())) {
        if (!m.from || m.from === this.source.user.toLowerCase()) continue; // our own sent copy
        const tid = await this.upsertThread(m);
        const ins = await prisma.$executeRaw`INSERT INTO support_mail_messages (id, "threadId", "gmailMessageId", direction, "fromAddress", "toAddress", subject, "bodyText", "rfcMessageId", "sentAt", attachments)
          VALUES (${randomUUID()}, ${tid}, ${m.id}, 'INBOUND', ${m.from}, ${oneLine(m.to, 300)}, ${m.subject}, ${m.text}, ${m.rfcMessageId}, ${m.sentAt}, ${m.attachments}) ON CONFLICT ("gmailMessageId") DO NOTHING`;
        if (ins === 1) {
          imported++; touched.add(tid);
          // A new customer message re-opens a conversation that had been marked handled.
          await prisma.$executeRaw`UPDATE support_mail_threads SET "lastMessageAt" = GREATEST("lastMessageAt", ${m.sentAt}), "lastInboundAt" = GREATEST(COALESCE("lastInboundAt", ${m.sentAt}), ${m.sentAt}), status = 'OPEN', "handledAt" = NULL, "handledByAdminId" = NULL, "updatedAt" = now() WHERE id = ${tid}`;
        }
      }
      this.lastSyncAt = Date.now(); this.lastResult = { imported, threads: touched.size };
      return this.lastResult;
    } catch (e: any) {
      this.lastSyncAt = Date.now();
      const code = e instanceof GmailError ? e.code : "PROVIDER";
      this.lastResult = { imported: 0, threads: 0, error: e instanceof GmailError ? e.message : "Имэйл татаж чадсангүй." };
      console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", event: "support_mail_sync_failed", code }));
      return this.lastResult;
    } finally { this.syncing = false; }
  }

  private async upsertThread(m: GmailParsedMessage): Promise<string> {
    const user = await prisma.user.findFirst({ where: { email: m.from, erasedAt: null }, select: { id: true } });
    const id = randomUUID();
    const rows = await prisma.$queryRaw<{ id: string }[]>`INSERT INTO support_mail_threads (id, "gmailThreadId", subject, "fromAddress", "fromName", "userId", "lastMessageAt", "lastInboundAt")
      VALUES (${id}, ${m.threadId}, ${m.subject}, ${m.from}, ${m.fromName}, ${user?.id ?? null}, ${m.sentAt}, ${m.sentAt})
      ON CONFLICT ("gmailThreadId") DO UPDATE SET "updatedAt" = support_mail_threads."updatedAt" RETURNING id`;
    return rows[0].id;
  }

  async list(q: { status?: string; search?: string; unanswered?: boolean; page: number; pageSize: number }) {
    const status = q.status === "OPEN" || q.status === "HANDLED" ? q.status : null;
    const like = q.search ? `%${q.search.replace(/[%_\\]/g, m => "\\" + m).slice(0, 80)}%` : null;
    const off = (q.page - 1) * q.pageSize;
    const where = prismaSql(status, like, q.unanswered === true);
    const total = Number((await prisma.$queryRawUnsafe<{ c: bigint }[]>(`SELECT count(*) AS c FROM support_mail_threads t WHERE ${where.sql}`, ...where.args))[0].c);
    const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT t.id, t.subject, t."fromAddress", t."fromName", t.status, t."lastMessageAt", t."lastInboundAt", t."lastOutboundAt", t."handledAt", t."userId",
        (t.status = 'OPEN' AND (t."lastOutboundAt" IS NULL OR t."lastInboundAt" > t."lastOutboundAt")) AS unanswered,
        (SELECT left("bodyText", 160) FROM support_mail_messages m WHERE m."threadId" = t.id ORDER BY m."sentAt" DESC LIMIT 1) AS preview,
        (SELECT count(*) FROM support_mail_messages m WHERE m."threadId" = t.id) AS messages
      FROM support_mail_threads t WHERE ${where.sql} ORDER BY (t.status = 'OPEN') DESC, t."lastMessageAt" DESC LIMIT ${q.pageSize} OFFSET ${off}`, ...where.args);
    return { total, items: rows.map(r => ({ ...r, messages: Number(r.messages) })) };
  }
  async openCount(): Promise<{ open: number; unanswered: number }> {
    const r = (await prisma.$queryRaw<{ o: bigint; u: bigint }[]>`SELECT count(*) FILTER (WHERE status = 'OPEN') AS o, count(*) FILTER (WHERE status = 'OPEN' AND ("lastOutboundAt" IS NULL OR "lastInboundAt" > "lastOutboundAt")) AS u FROM support_mail_threads`)[0];
    return { open: Number(r.o), unanswered: Number(r.u) };
  }
  async get(id: string) {
    const t = (await prisma.$queryRaw<any[]>`SELECT * FROM support_mail_threads WHERE id = ${id}`)[0];
    if (!t) throw notFound("Харилцан яриа олдсонгүй.");
    const messages = await prisma.$queryRaw<any[]>`SELECT id, direction, "fromAddress", "toAddress", subject, "bodyText", "sentAt", attachments, "adminId" FROM support_mail_messages WHERE "threadId" = ${id} ORDER BY "sentAt" ASC`;
    let customer: any = null;
    if (t.userId) {
      const u = await prisma.user.findUnique({ where: { id: t.userId }, select: { id: true, email: true, displayName: true, status: true, memberships: { select: { role: true, company: { select: { id: true, name: true } } } } } as any });
      if (u) customer = { id: (u as any).id, email: (u as any).email, name: (u as any).displayName, status: (u as any).status, companies: ((u as any).memberships ?? []).map((m: any) => ({ id: m.company.id, name: m.company.name, role: m.role })) };
    }
    return { thread: t, messages, customer };
  }
  async reply(id: string, adminId: string, text: string) {
    if (!this.source) throw new ApiError(409, "SUPPORT_MAIL_NOT_CONNECTED", "Дэмжлэгийн имэйл холбогдоогүй байна.");
    const body = String(text ?? "").replace(/\u0000/g, "").trim();
    if (body.length < 2 || body.length > 5000) throw badRequest("Хариу 2-5000 тэмдэгт байх ёстой.");
    const t = (await prisma.$queryRaw<any[]>`SELECT * FROM support_mail_threads WHERE id = ${id}`)[0];
    if (!t) throw notFound("Харилцан яриа олдсонгүй.");
    if (!recipientAllowed(t.fromAddress)) throw new ApiError(409, "RECIPIENT_NOT_ALLOWLISTED", "QA горимд зөвхөн зөвшөөрөгдсөн хаяг руу илгээнэ.");
    // Double-click / retry guard: the same text from the same administrator within 60 s is not sent twice.
    const dup = (await prisma.$queryRaw<{ c: bigint }[]>`SELECT count(*) AS c FROM support_mail_messages WHERE "threadId" = ${id} AND direction = 'OUTBOUND' AND "adminId" = ${adminId} AND "bodyText" = ${body} AND "createdAt" > now() - interval '60 seconds'`)[0];
    if (Number(dup.c) > 0) throw new ApiError(409, "DUPLICATE_REPLY", "Энэ хариу дөнгөж сая илгээгдсэн байна.");
    const last = (await prisma.$queryRaw<any[]>`SELECT "rfcMessageId" FROM support_mail_messages WHERE "threadId" = ${id} AND direction = 'INBOUND' ORDER BY "sentAt" DESC LIMIT 1`)[0];
    const subject = /^re:/i.test(t.subject) ? oneLine(t.subject, 200) : `Re: ${oneLine(t.subject, 190)}`;
    let sent: { id: string; threadId: string };
    try { sent = await this.source.send({ to: t.fromAddress, subject, text: body, inReplyTo: last?.rfcMessageId ?? null, references: last?.rfcMessageId ?? null, threadId: t.gmailThreadId }); }
    catch (e: any) { throw new ApiError(502, "SUPPORT_MAIL_SEND_FAILED", e instanceof GmailError ? e.message : "Имэйл илгээж чадсангүй."); }
    const now = new Date();
    await prisma.$executeRaw`INSERT INTO support_mail_messages (id, "threadId", "gmailMessageId", direction, "fromAddress", "toAddress", subject, "bodyText", "sentAt", "adminId")
      VALUES (${randomUUID()}, ${id}, ${sent.id}, 'OUTBOUND', ${this.source.user}, ${t.fromAddress}, ${subject}, ${body}, ${now}, ${adminId}) ON CONFLICT ("gmailMessageId") DO NOTHING`;
    await prisma.$executeRaw`UPDATE support_mail_threads SET "lastOutboundAt" = ${now}, "lastMessageAt" = ${now}, "updatedAt" = now() WHERE id = ${id}`;
    return { sent: true };
  }
  async setHandled(id: string, adminId: string, handled: boolean) {
    const n = handled
      ? await prisma.$executeRaw`UPDATE support_mail_threads SET status = 'HANDLED', "handledAt" = now(), "handledByAdminId" = ${adminId}, "updatedAt" = now() WHERE id = ${id}`
      : await prisma.$executeRaw`UPDATE support_mail_threads SET status = 'OPEN', "handledAt" = NULL, "handledByAdminId" = NULL, "updatedAt" = now() WHERE id = ${id}`;
    if (n !== 1) throw notFound("Харилцан яриа олдсонгүй.");
  }
}

/** Parameterised WHERE builder for the thread list ($1.. placeholders; user text only ever travels as a bound parameter). */
function prismaSql(status: string | null, like: string | null, unanswered: boolean) {
  const parts: string[] = ["true"], args: unknown[] = [];
  if (status) { args.push(status); parts.push(`t.status = $${args.length}`); }
  if (unanswered) parts.push(`(t.status = 'OPEN' AND (t."lastOutboundAt" IS NULL OR t."lastInboundAt" > t."lastOutboundAt"))`);
  if (like) { args.push(like); const n = args.length; parts.push(`(t.subject ILIKE $${n} ESCAPE '\\' OR t."fromAddress" ILIKE $${n} ESCAPE '\\' OR COALESCE(t."fromName", '') ILIKE $${n} ESCAPE '\\' OR EXISTS (SELECT 1 FROM support_mail_messages m WHERE m."threadId" = t.id AND m."bodyText" ILIKE $${n} ESCAPE '\\'))`); }
  return { sql: parts.join(" AND "), args };
}
