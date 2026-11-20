import type { Router } from "../http/router.js";
import { ok } from "../http/respond.js";
import { badRequest } from "../errors.js";
import { requireCompanyRole, type CompanyRole } from "../auth/access.js";
import { customerNotifications } from "./notification-service.js";

const MEMBER_ROLES: CompanyRole[] = ["OWNER", "ADMIN", "ASSESSOR", "CONSULTANT", "VIEWER"];
const ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Customer notification API. Every handler is scoped to the authenticated user; an optional `companyId` narrows the view to one
 * company and requires membership in it. Ids belonging to another user are indistinguishable from missing ids (404).
 */
export function registerNotificationRoutes(router: Router, limiter: { check(key: string): void }) {
  const scope = async (userId: string, raw: string | null) => {
    if (raw === null || raw === "") return null;
    if (!ID.test(raw)) throw badRequest("companyId буруу байна.");
    await requireCompanyRole(userId, raw, MEMBER_ROLES);
    return raw;
  };

  router.add("GET", "/api/v1/notifications", async ({ res, principal, query }) => {
    const companyId = await scope(principal!.userId, query.get("companyId"));
    const rawLimit = query.get("limit");
    const limit = rawLimit === null ? 20 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw badRequest("limit 1-50 байх ёстой.");
    const cursor = query.get("cursor");
    if (cursor !== null && (cursor.length > 200 || !/^[A-Za-z0-9_-]+$/.test(cursor))) throw badRequest("Cursor буруу байна.");
    ok(res, await customerNotifications.list(principal!.userId, { companyId, limit, cursor, unreadOnly: query.get("unread") === "true" }));
  });

  router.add("GET", "/api/v1/notifications/unread-count", async ({ res, principal, query }) => {
    ok(res, await customerNotifications.unreadCount(principal!.userId, await scope(principal!.userId, query.get("companyId"))));
  });

  router.add("POST", "/api/v1/notifications/read-all", async ({ res, principal, query }) => {
    limiter.check(`notifications:user:${principal!.userId}`);
    ok(res, await customerNotifications.markAllRead(principal!.userId, await scope(principal!.userId, query.get("companyId"))));
  });

  router.add("POST", "/api/v1/notifications/:id/read", async ({ res, principal, params, query }) => {
    limiter.check(`notifications:user:${principal!.userId}`);
    ok(res, await customerNotifications.markRead(principal!.userId, params.id, await scope(principal!.userId, query.get("companyId"))));
  });
  router.add("POST", "/api/v1/notifications/:id/unread", async ({ res, principal, params, query }) => {
    limiter.check(`notifications:user:${principal!.userId}`);
    ok(res, await customerNotifications.markUnread(principal!.userId, params.id, await scope(principal!.userId, query.get("companyId"))));
  });
  router.add("POST", "/api/v1/notifications/:id/dismiss", async ({ res, principal, params, query }) => {
    limiter.check(`notifications:user:${principal!.userId}`);
    ok(res, await customerNotifications.dismiss(principal!.userId, params.id, await scope(principal!.userId, query.get("companyId"))));
  });
}
