import { prisma } from "../../db.js";
import { ApiError, badRequest, notFound } from "../errors.js";

/**
 * Server-side customer notifications.
 *
 * - One row per recipient and event; read / dismissed state is stored here, so it follows the account across browsers and devices.
 * - Event generation is idempotent: (userId, dedupeKey) is unique and every insert is `skipDuplicates`.
 * - The feature is active only when MMRI_CUSTOMER_NOTIFICATIONS=on AND the table exists. With the flag off (the default) or before the
 *   migration is applied, nothing is written, the API answers 404 NOTIFICATIONS_DISABLED and the client keeps its previous behaviour.
 * - Company notifications are visible only to the recipient and only while that recipient is still a member of the company.
 */

export const NOTIFICATION_TYPES = [
  "PAYMENT_CONFIRMED", "ASSESSMENT_COMPLETED", "REPORT_UNDER_REVIEW", "REPORT_APPROVED", "REPORT_RELEASED",
  "ACCOUNT_EMAIL_VERIFIED", "ACCOUNT_PASSWORD_CHANGED"
] as const;
export type NotificationType = typeof NOTIFICATION_TYPES[number];
export const NOTIFICATION_DESTINATIONS = ["home", "analysis", "results", "report", "billing", "profile", "settings"] as const;
export type NotificationDestination = typeof NOTIFICATION_DESTINATIONS[number];

export interface NotificationEvent {
  type: NotificationType;
  title: string;
  message: string;
  destination: NotificationDestination;
  payload?: Record<string, string | number | boolean | null>;
  eventRef: string;
  dedupeKey: string;
}

const DOMAIN_LABEL: Record<string, string> = {
  marketing: "Маркетинг", it: "Мэдээллийн технологи", finance: "Санхүү", people: "Хүний нөөц", operations: "Үйлдвэрлэл ба үйл ажиллагаа"
};
export const domainLabel = (code: string | null | undefined) => DOMAIN_LABEL[String(code ?? "").toLowerCase()] ?? "Оношилгооны";

/** Roles that may see report content (mirrors REPORT_READ in app.ts) and roles that manage billing. */
const ALL_MEMBER_ROLES = ["OWNER", "ADMIN", "ASSESSOR", "CONSULTANT", "VIEWER"];
const REPORT_READ_ROLES = ["OWNER", "ADMIN", "CONSULTANT", "VIEWER"];
const BILLING_ROLES = ["OWNER", "ADMIN"];

let tableChecked: { at: number; present: boolean } | null = null;
const TABLE_RECHECK_MS = 60_000;
export const customerNotificationsFlag = () => (process.env.MMRI_CUSTOMER_NOTIFICATIONS ?? "off").trim().toLowerCase() === "on";
/** True when the customer_notifications table exists (independent of the feature flag, so erasure still works after the flag is switched off). */
export async function customerNotificationsTablePresent(db: any = prisma): Promise<boolean> {
  if (tableChecked && (tableChecked.present || Date.now() - tableChecked.at < TABLE_RECHECK_MS)) return tableChecked.present;
  try {
    const rows = await db.$queryRaw`SELECT to_regclass('public.customer_notifications') IS NOT NULL AS present`;
    tableChecked = { at: Date.now(), present: Boolean(rows?.[0]?.present) };
  } catch { tableChecked = { at: Date.now(), present: false }; }
  return tableChecked.present;
}
export async function customerNotificationsActive(db: any = prisma): Promise<boolean> {
  if (!customerNotificationsFlag()) return false;
  const present = await customerNotificationsTablePresent(db);
  if (!present) console.log(JSON.stringify({ ts: new Date().toISOString(), level: "error", event: "customer_notifications_table_missing", note: "MMRI_CUSTOMER_NOTIFICATIONS=on but the customer_notifications table does not exist; apply the migration. Notifications stay off." }));
  return present;
}
/** Test hook: forget the cached table probe. */
export function resetNotificationProbe() { tableChecked = null; }

const log = (event: string, extra: Record<string, unknown>) => console.log(JSON.stringify({ ts: new Date().toISOString(), level: "warn", event, ...extra }));

export type NotificationView = { id: string; type: string; title: string; message: string; destination: string; payload: unknown; companyId: string | null; createdAt: string; readAt: string | null };
const view = (r: any): NotificationView => ({ id: r.id, type: r.type, title: r.title, message: r.message, destination: r.destination, payload: r.payload ?? null, companyId: r.companyId ?? null, createdAt: r.createdAt.toISOString(), readAt: r.readAt ? r.readAt.toISOString() : null });

/** Rows visible to `userId`: their own, not dismissed, and (for company rows) only while still a member of that company. */
function visibleWhere(userId: string, companyId?: string | null): any {
  const and: any[] = [{ OR: [{ companyId: null }, { company: { memberships: { some: { userId } } } }] }];
  if (companyId) and.push({ OR: [{ companyId }, { companyId: null }] });
  return { userId, dismissedAt: null, AND: and };
}

function encodeCursor(createdAt: Date, id: string) { return Buffer.from(`${createdAt.toISOString()}|${id}`).toString("base64url"); }
function decodeCursor(raw: string): { createdAt: Date; id: string } {
  try {
    const [iso, id] = Buffer.from(raw, "base64url").toString("utf8").split("|");
    const createdAt = new Date(iso);
    if (!id || Number.isNaN(createdAt.getTime()) || id.length > 64) throw new Error("bad");
    return { createdAt, id };
  } catch { throw badRequest("Cursor буруу байна."); }
}
const validId = (id: string) => /^[A-Za-z0-9_-]{8,64}$/.test(id);

export class CustomerNotificationService {
  // ---------------------------------------------------------------- event generation (never throws)

  /** Notify every member of `companyId` whose role is in `roles`. Returns the number of new rows. */
  async emitToCompany(companyId: string, roles: readonly string[], ev: NotificationEvent, db: any = prisma): Promise<number> {
    try {
      if (!(await customerNotificationsActive(db))) return 0;
      const members = await db.companyMembership.findMany({ where: { companyId, role: { in: [...roles] }, user: { status: "ACTIVE", erasedAt: null } }, select: { userId: true } });
      if (!members.length) return 0;
      const r = await db.customerNotification.createMany({ skipDuplicates: true, data: members.map((m: { userId: string }) => this.row(m.userId, companyId, ev)) });
      return r.count;
    } catch (e: any) { log("customer_notification_emit_failed", { type: ev.type, reason: String(e?.message ?? e).slice(0, 160) }); return 0; }
  }

  /** Notify one user (account events carry no company). */
  async emitToUser(userId: string, companyId: string | null, ev: NotificationEvent, db: any = prisma): Promise<number> {
    try {
      if (!(await customerNotificationsActive(db))) return 0;
      const r = await db.customerNotification.createMany({ skipDuplicates: true, data: [this.row(userId, companyId, ev)] });
      return r.count;
    } catch (e: any) { log("customer_notification_emit_failed", { type: ev.type, reason: String(e?.message ?? e).slice(0, 160) }); return 0; }
  }

  private row(userId: string, companyId: string | null, ev: NotificationEvent) {
    return { userId, companyId, type: ev.type, title: ev.title, message: ev.message, destination: ev.destination, payload: ev.payload ?? undefined, eventRef: ev.eventRef, dedupeKey: ev.dedupeKey };
  }

  // Event builders. Each one is tied to a real state transition performed by the caller.
  paymentConfirmed(companyId: string, invoiceId: string, domainCode: string) {
    return this.emitToCompany(companyId, BILLING_ROLES, {
      type: "PAYMENT_CONFIRMED", title: "Төлбөр баталгаажлаа", message: `${domainLabel(domainCode)} чиглэлийн оношилгооны төлбөр баталгаажиж, эрх нээгдлээ.`,
      destination: "analysis", payload: { invoiceId, domainCode }, eventRef: `invoice:${invoiceId}`, dedupeKey: `PAYMENT_CONFIRMED:${invoiceId}`
    });
  }
  /** Called inside the transaction that finishes an assessment (so the event is atomic with the transition). */
  async assessmentTerminalInTx(tx: any, assessmentId: string): Promise<void> {
    if (!(await customerNotificationsActive(tx))) return;
    const a = await tx.assessment.findUnique({ where: { id: assessmentId }, select: { companyId: true, domainCode: true } });
    if (!a) return;
    const d = domainLabel(a.domainCode), payload = { assessmentId, domainCode: a.domainCode };
    await this.emitToCompany(a.companyId, ALL_MEMBER_ROLES, { type: "ASSESSMENT_COMPLETED", title: "Оношилгоо дууслаа", message: `${d} чиглэлийн оношилгоо амжилттай дууслаа.`, destination: "results", payload, eventRef: `assessment:${assessmentId}`, dedupeKey: `ASSESSMENT_COMPLETED:${assessmentId}` }, tx);
    const review = await tx.reportReview.findUnique({ where: { assessmentId }, select: { id: true } });
    if (review) {
      await this.emitToCompany(a.companyId, ALL_MEMBER_ROLES, { type: "REPORT_UNDER_REVIEW", title: "Тайлан хянагдаж байна", message: `${d} чиглэлийн тайлан шинжээчийн хяналтад орлоо. Баталгаажсан тайлан бэлэн болмогц мэдэгдэнэ.`, destination: "report", payload, eventRef: `assessment:${assessmentId}`, dedupeKey: `REPORT_UNDER_REVIEW:${assessmentId}` }, tx);
    } else {
      // Review workflow off: the report is available as soon as the assessment is complete.
      await this.reportReleased(a.companyId, assessmentId, a.domainCode, tx);
    }
  }
  reportApproved(companyId: string, assessmentId: string, domainCode: string, reviewId: string) {
    return this.emitToCompany(companyId, REPORT_READ_ROLES, { type: "REPORT_APPROVED", title: "Тайлан батлагдлаа", message: `${domainLabel(domainCode)} чиглэлийн тайлан батлагдлаа. Нээгдэх үед дахин мэдэгдэнэ.`, destination: "report", payload: { assessmentId, domainCode }, eventRef: `review:${reviewId}`, dedupeKey: `REPORT_APPROVED:${reviewId}` });
  }
  reportReleased(companyId: string, assessmentId: string, domainCode: string, db: any = prisma) {
    return this.emitToCompany(companyId, REPORT_READ_ROLES, { type: "REPORT_RELEASED", title: "Тайлан бэлэн боллоо", message: `${domainLabel(domainCode)} чиглэлийн тайланг үзэх, татах боломжтой.`, destination: "report", payload: { assessmentId, domainCode }, eventRef: `assessment:${assessmentId}`, dedupeKey: `REPORT_RELEASED:${assessmentId}` }, db);
  }
  emailVerified(userId: string) {
    return this.emitToUser(userId, null, { type: "ACCOUNT_EMAIL_VERIFIED", title: "Имэйл баталгаажлаа", message: "Таны имэйл хаяг амжилттай баталгаажлаа.", destination: "settings", eventRef: `user:${userId}`, dedupeKey: `ACCOUNT_EMAIL_VERIFIED:${userId}` });
  }
  passwordChanged(userId: string, tokenRowId: string) {
    return this.emitToUser(userId, null, { type: "ACCOUNT_PASSWORD_CHANGED", title: "Нууц үг солигдлоо", message: "Таны нууц үг шинэчлэгдлээ. Энэ таны үйлдэл биш бол тусламжийн багтай яаралтай холбогдоно уу.", destination: "settings", eventRef: `reset:${tokenRowId}`, dedupeKey: `ACCOUNT_PASSWORD_CHANGED:${tokenRowId}` });
  }

  // ---------------------------------------------------------------- customer API

  private async requireActive() {
    if (!(await customerNotificationsActive())) throw new ApiError(404, "NOTIFICATIONS_DISABLED", "Мэдэгдлийн үйлчилгээ идэвхгүй байна.");
  }

  async list(userId: string, opts: { companyId?: string | null; limit?: number; cursor?: string | null; unreadOnly?: boolean }) {
    await this.requireActive();
    const limit = Math.min(50, Math.max(1, Math.trunc(opts.limit ?? 20)));
    const where = visibleWhere(userId, opts.companyId);
    const filter: any = { ...where, AND: [...where.AND] };
    if (opts.unreadOnly) filter.readAt = null;
    if (opts.cursor) {
      const c = decodeCursor(opts.cursor);
      filter.AND.push({ OR: [{ createdAt: { lt: c.createdAt } }, { createdAt: c.createdAt, id: { lt: c.id } }] });
    }
    // Ordered by creation only, never by read state, so marking an item read does not move it.
    const rows = await prisma.customerNotification.findMany({ where: filter, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit + 1 });
    const page = rows.slice(0, limit);
    const unreadCount = await prisma.customerNotification.count({ where: { ...where, readAt: null } });
    return { items: page.map(view), unreadCount, nextCursor: rows.length > limit ? encodeCursor(page[page.length - 1].createdAt, page[page.length - 1].id) : null };
  }

  async unreadCount(userId: string, companyId?: string | null) {
    await this.requireActive();
    return { unreadCount: await prisma.customerNotification.count({ where: { ...visibleWhere(userId, companyId), readAt: null } }) };
  }

  /** Looks the row up through the visibility rules, so another user's id (or a company the user left) is indistinguishable from a missing id. */
  private async own(userId: string, id: string, includeDismissed = false) {
    if (!validId(id)) throw notFound("Мэдэгдэл олдсонгүй.");
    const where: any = { id, ...visibleWhere(userId) };
    if (includeDismissed) where.dismissedAt = undefined;
    const row = await prisma.customerNotification.findFirst({ where });
    if (!row) throw notFound("Мэдэгдэл олдсонгүй.");
    return row;
  }

  async markRead(userId: string, id: string, companyId?: string | null) {
    await this.requireActive(); const row = await this.own(userId, id);
    if (!row.readAt) await prisma.customerNotification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
    return this.after(userId, id, companyId);
  }
  async markUnread(userId: string, id: string, companyId?: string | null) {
    await this.requireActive(); await this.own(userId, id);
    await prisma.customerNotification.updateMany({ where: { id, userId }, data: { readAt: null } });
    return this.after(userId, id, companyId);
  }
  async dismiss(userId: string, id: string, companyId?: string | null) {
    await this.requireActive(); await this.own(userId, id, true);
    const now = new Date();
    await prisma.customerNotification.updateMany({ where: { id, userId, dismissedAt: null }, data: { dismissedAt: now } });
    await prisma.customerNotification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: now } });
    return { dismissed: true, unreadCount: (await this.unreadCount(userId, companyId)).unreadCount };
  }
  async markAllRead(userId: string, companyId?: string | null) {
    await this.requireActive();
    const r = await prisma.customerNotification.updateMany({ where: { ...visibleWhere(userId, companyId), readAt: null }, data: { readAt: new Date() } });
    return { updated: r.count, unreadCount: (await this.unreadCount(userId, companyId)).unreadCount };
  }
  private async after(userId: string, id: string, companyId?: string | null) {
    const row = await prisma.customerNotification.findFirst({ where: { id, userId } });
    return { notification: view(row), unreadCount: (await this.unreadCount(userId, companyId)).unreadCount };
  }
}

export const customerNotifications = new CustomerNotificationService();
