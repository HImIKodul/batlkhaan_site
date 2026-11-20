import { createHash } from "node:crypto";
import { prisma } from "../../db.js";
import type { ApiConfig } from "../config.js";
import type { Mailer } from "./mailer.js";

/**
 * Lifecycle e-mails: assessment-completed acknowledgement, report-under-review, report-released (customers) and the new-review / overdue alert (administrators).
 *
 * Exactly-once bookkeeping without an outbox of message bodies: a row in `mail_dispatch_marks` is the claim on one message (dedupeKey = scope:source id).
 * A claim is taken with INSERT ... ON CONFLICT DO NOTHING (or re-taken after its retry time), the message is built from the source row at send time, and
 * `sentAt` is written only after the provider accepted the message. Failures are retried with a growing delay up to MAX_ATTEMPTS and then left alone.
 * Nothing is sent unless MMRI_CUSTOMER_EMAILS=on (customers) / MMRI_ADMIN_ALERT_EMAILS is set (administrators) AND the mail provider is real or mock (not "disabled").
 * "Delivered" always means accepted by the provider, never confirmed arrival.
 */
export const MAX_ATTEMPTS = 5;
const WINDOW_HOURS = 48, BATCH = 40;
const CUSTOMER_MAIL_TYPES = ["ASSESSMENT_COMPLETED", "REPORT_UNDER_REVIEW", "REPORT_RELEASED"] as const;
const ADMIN_MAIL_TYPES = ["NEW_ASSESSMENT", "REVIEW_OVERDUE"] as const;
type MailKind = "ASSESSMENT_COMPLETED" | "REPORT_UNDER_REVIEW" | "REPORT_RELEASED" | "ADMIN_REVIEW_ALERT";

export const customerEmailsEnabled = () => (process.env.MMRI_CUSTOMER_EMAILS ?? "off").trim().toLowerCase() === "on";
export function adminAlertRecipients(): string[] {
  return (process.env.MMRI_ADMIN_ALERT_EMAILS ?? "").split(",").map(x => x.trim().toLowerCase()).filter(x => /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(x)).slice(0, 10);
}
const oneLine = (v: unknown, max = 120) => String(v ?? "").replace(/[\r\n\t\u0000-\u001F\u007F]+/g, " ").trim().slice(0, max);

/** Plain-text templates. Every interpolated value is single-line text; there is no HTML, so there is nothing to escape into markup and no way to inject headers. */
export function buildCustomerMail(type: string, ctx: { company: string; domainLabel: string; appUrl: string; contact?: string }): { subject: string; text: string; kind: MailKind } | null {
  const c = oneLine(ctx.company, 80), d = oneLine(ctx.domainLabel, 60), base = ctx.appUrl.replace(/\/+$/, "");
  const sign = "\n\nBusinessMRI.mn\nЭнэ мэйл автоматаар илгээгдсэн. Хариу бичих шаардлагагүй.";
  if (type === "ASSESSMENT_COMPLETED") return { kind: "ASSESSMENT_COMPLETED", subject: "BusinessMRI.mn: оношилгоо дууслаа", text: `Сайн байна уу.\n\n«${c}» байгууллагын ${d} чиглэлийн оношилгоо амжилттай дууслаа. Хариулт бүрэн хадгалагдсан.\n\nҮр дүнг эндээс харна уу: ${base}/#/results${sign}` };
  if (type === "REPORT_UNDER_REVIEW") return { kind: "REPORT_UNDER_REVIEW", subject: "BusinessMRI.mn: тайлан хянагдаж байна", text: `Сайн байна уу.\n\n«${c}» байгууллагын ${d} чиглэлийн тайлан шинжээчийн хяналтад орлоо. Баталгаажсан тайлан бэлэн болмогц танд дахин мэдэгдэнэ. Хяналтын явцад тайланд нэвтрэх боломжгүй.${sign}` };
  if (type === "REPORT_RELEASED") return { kind: "REPORT_RELEASED", subject: "BusinessMRI.mn: тайлан бэлэн боллоо", text: `Сайн байна уу.\n\n«${c}» байгууллагын ${d} чиглэлийн тайлан бэлэн боллоо. Тайланг үзэх, PDF хэлбэрээр татах боломжтой (нэвтэрсний дараа нээгдэнэ):\n\n${base}/#/report${ctx.contact && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(ctx.contact) ? `\n\nАсуулт байвал ${ctx.contact} хаягаар бидэнтэй холбогдоно уу.` : ""}${sign}` };
  return null;
}
export function buildAdminMail(type: string, title: string, body: string, appUrl: string): { subject: string; text: string; kind: MailKind } {
  const base = appUrl.replace(/\/+$/, "");
  return { kind: "ADMIN_REVIEW_ALERT", subject: `BusinessMRI.mn админ: ${oneLine(title, 100)}`, text: `${oneLine(title, 160)}\n\n${oneLine(body, 400)}\n\nТөрөл: ${oneLine(type, 40)}\nХяналтын жагсаалт: ${base}/admin/#/reports\n\nЭнэ мэйл автоматаар илгээгдсэн.` };
}

const DOMAIN_LABEL: Record<string, string> = { marketing: "Маркетинг", it: "Мэдээллийн технологи", finance: "Санхүү", people: "Хүний нөөц", operations: "Үйлдвэрлэл ба үйл ажиллагаа" };

export class LifecycleMailService {
  constructor(private readonly config: ApiConfig, private readonly mailer: Mailer) {}

  /** Take (or re-take after its retry time) the claim for one message. Returns false when someone else owns it, it is already sent, or attempts are exhausted. */
  async claim(key: string, kind: MailKind): Promise<boolean> {
    const fresh = await prisma.mailDispatchMark.createMany({ data: [{ dedupeKey: key, kind }], skipDuplicates: true });
    if (fresh.count === 1) return true;
    const now = new Date();
    // Lease: while this attempt runs nobody else may take it; the result below replaces the lease with the real next time.
    const leased = await prisma.mailDispatchMark.updateMany({ where: { dedupeKey: key, sentAt: null, attempts: { lt: MAX_ATTEMPTS }, nextAttemptAt: { lte: now } }, data: { nextAttemptAt: new Date(now.getTime() + 5 * 60_000) } });
    return leased.count === 1;
  }
  private async sent(key: string) { await prisma.mailDispatchMark.update({ where: { dedupeKey: key }, data: { sentAt: new Date(), lastError: null } }); }
  private async failed(key: string, reason: string) {
    const row = await prisma.mailDispatchMark.findUnique({ where: { dedupeKey: key }, select: { attempts: true } });
    const attempts = (row?.attempts ?? 0) + 1;
    await prisma.mailDispatchMark.update({ where: { dedupeKey: key }, data: { attempts, nextAttemptAt: new Date(Date.now() + attempts * 10 * 60_000), lastError: reason.slice(0, 120) } });
  }

  private enabled(): boolean { return this.mailer.provider !== "disabled"; }
  private async tablePresent(): Promise<boolean> {
    try { const r: any = await prisma.$queryRaw`SELECT to_regclass('public.mail_dispatch_marks') IS NOT NULL AS present`; return Boolean(r?.[0]?.present); } catch { return false; }
  }

  /** One pass: send what is due. Safe to run concurrently in several processes (claims are atomic). */
  async dispatchPending(): Promise<{ customer: number; admin: number; failed: number; skipped: string | null }> {
    const out = { customer: 0, admin: 0, failed: 0, skipped: null as string | null };
    if (!this.enabled()) { out.skipped = "mail provider disabled"; return out; }
    const wantCustomer = customerEmailsEnabled(), admins = adminAlertRecipients();
    if (!wantCustomer && admins.length === 0) { out.skipped = "lifecycle e-mails are off"; return out; }
    if (!(await this.tablePresent())) { out.skipped = "mail_dispatch_marks table missing"; return out; }
    const since = new Date(Date.now() - WINDOW_HOURS * 3_600_000), now = new Date();
    const dueMark = { dedupeKey: "", OR: [{ sentAt: { not: null } }, { attempts: { gte: MAX_ATTEMPTS } }, { nextAttemptAt: { gt: now } }] };
    const done = async (keys: string[]) => new Set((await prisma.mailDispatchMark.findMany({ where: { dedupeKey: { in: keys }, OR: dueMark.OR as any }, select: { dedupeKey: true } })).map(r => r.dedupeKey));

    if (wantCustomer) {
      let rows: any[] = [];
      // Select only notifications that still need a mail: finished (sent / out of attempts / waiting for retry) ones are excluded IN SQL, so a backlog of already-sent rows can never
      // fill the batch and starve newer notifications (the batch used to be taken oldest-first before sent rows were skipped).
      let pendingIds: string[] = [];
      try { pendingIds = (await prisma.$queryRaw<{ id: string }[]>`SELECT n.id FROM customer_notifications n WHERE n.type = ANY(${[...CUSTOMER_MAIL_TYPES]}) AND n."createdAt" >= ${since}
        AND NOT EXISTS (SELECT 1 FROM mail_dispatch_marks m WHERE m."dedupeKey" = 'CN:' || n.id AND (m."sentAt" IS NOT NULL OR m.attempts >= ${MAX_ATTEMPTS} OR m."nextAttemptAt" > now()))
        ORDER BY n."createdAt" ASC LIMIT ${BATCH * 3}`).map(r => r.id); } catch { pendingIds = []; }
      try { rows = await prisma.customerNotification.findMany({ where: { id: { in: pendingIds }, user: { status: "ACTIVE", erasedAt: null } }, orderBy: { createdAt: "asc" }, include: { user: { select: { email: true } }, company: { select: { name: true, erasedAt: true } } } }); } catch { rows = []; }
      const skip = await done(rows.map(r => `CN:${r.id}`));
      for (const n of rows.filter(r => !skip.has(`CN:${r.id}`)).slice(0, BATCH)) {
        const key = `CN:${n.id}`;
        const msg = buildCustomerMail(n.type, { company: n.company?.name ?? "Таны", domainLabel: DOMAIN_LABEL[String((n.payload as any)?.domainCode ?? "").toLowerCase()] ?? "Оношилгооны", appUrl: this.config.publicAppUrl, contact: this.config.gmail?.user ?? this.config.mailFrom });
        if (!msg || n.company?.erasedAt) continue;
        if (!(await this.claim(key, msg.kind))) continue;
        try { const r = await this.mailer.send({ to: n.user.email, subject: msg.subject, text: msg.text, kind: msg.kind }); if (r.delivered) { await this.sent(key); out.customer++; } else { await this.failed(key, "provider did not accept the message"); out.failed++; } }
        catch { await this.failed(key, "mail provider request failed"); out.failed++; }
      }
    }
    if (admins.length) {
      // Recipients that belong to a DISABLED administrator account receive nothing (the address list is configuration, the account status is authority).
      let recipients = admins;
      try { const off = new Set((await prisma.$queryRaw<{ e: string }[]>`SELECT lower(u.email) AS e FROM admin_accounts a JOIN users u ON u.id = a."userId" WHERE a.status <> 'ACTIVE' AND lower(u.email) = ANY(${admins})`).map(r => r.e)); recipients = admins.filter(x => !off.has(x)); } catch { /* keep the configured list if the lookup fails */ }
      const hashOf = (to: string) => createHash("sha256").update(to).digest("hex").slice(0, 12);
      const hashes = recipients.map(hashOf);
      // Same rule as the customer path: only alerts that still need a mail for at least one recipient are selected IN SQL (finished / exhausted / waiting-for-retry marks are excluded),
      // so processed alerts can never fill the batch and hide newer pending ones. Oldest pending first, bounded by LIMIT.
      let ids: string[] = [];
      if (hashes.length) {
        try { ids = (await prisma.$queryRaw<{ id: string }[]>`SELECT a.id FROM admin_notifications a WHERE a.type = ANY(${[...ADMIN_MAIL_TYPES]}) AND a."createdAt" >= ${since}
          AND EXISTS (SELECT 1 FROM unnest(${hashes}::text[]) h WHERE NOT EXISTS (SELECT 1 FROM mail_dispatch_marks m WHERE m."dedupeKey" = 'AN:' || a.id || ':' || h AND (m."sentAt" IS NOT NULL OR m.attempts >= ${MAX_ATTEMPTS} OR m."nextAttemptAt" > now())))
          ORDER BY a."createdAt" ASC LIMIT ${BATCH * 3}`).map(r => r.id); } catch { ids = []; }
      }
      let rows: any[] = [];
      try { rows = await prisma.adminNotification.findMany({ where: { id: { in: ids } }, orderBy: { createdAt: "asc" } }); } catch { rows = []; }
      let budget = BATCH;
      for (const a of rows) {
        // One claim per alert and recipient so a bounced address never blocks the others.
        for (const to of recipients) {
          if (budget <= 0) break;
          // The recipient is hashed so the claim table never holds an address.
          const key = `AN:${a.id}:${hashOf(to)}`;
          if ((await done([key])).has(key)) continue;
          if (!(await this.claim(key, "ADMIN_REVIEW_ALERT"))) continue;
          budget--;
          const msg = buildAdminMail(a.type, a.title, a.body, this.config.publicAppUrl);
          try { const r = await this.mailer.send({ to, subject: msg.subject, text: msg.text, kind: msg.kind }); if (r.delivered) { await this.sent(key); out.admin++; } else { await this.failed(key, "provider did not accept the message"); out.failed++; } }
          catch { await this.failed(key, "mail provider request failed"); out.failed++; }
        }
      }
    }
    return out;
  }
}
