/* WS-D MMRI-07 (+ MMRI-23 totals over the HTTP API): billing status must load for every company role; invoice history stays admin-only; totals cover ALL invoices.
   Usage: DATABASE_URL=<mmri_ws_d url> API=http://127.0.0.1:4114 npx tsx scripts/qa-wsd-billing-roles.ts */
import { API, rec, http, registerUser, loginQa, prisma, randomUUID, fail } from "./qa-wsd-lib.js";
const qa = await loginQa();
const m = await prisma.companyMembership.findFirstOrThrow({ where: { userId: qa.id, role: "OWNER" } });
const companyId = m.companyId;
const created: string[] = []; const createdInv: string[] = [];
try {
  const baseline = await http("GET", `/companies/${companyId}/billing/status`, qa.token);
  rec("R0 owner can load billing status", baseline.status === 200 && Array.isArray(baseline.data.invoices) && baseline.data.invoices.length > 0, `status=${baseline.status}`);
  for (const role of ["ADMIN", "ASSESSOR", "CONSULTANT", "VIEWER"] as const) {
    const u = await registerUser("wsd-" + role.toLowerCase()); created.push(u.id);
    await prisma.companyMembership.create({ data: { companyId, userId: u.id, role } });
    const r = await http("GET", `/companies/${companyId}/billing/status`, u.token);
    const admin = role === "ADMIN";
    rec(`R1 ${role} loads billing status (200)`, r.status === 200, `status=${r.status}`);
    if (r.status === 200) {
      rec(`R2 ${role} receives entitlement state`, Array.isArray(r.data.entitlements) && r.data.entitlements.length > 0 && typeof r.data.enforcement === "boolean");
      rec(`R3 ${role} ${admin ? "receives" : "does NOT receive"} invoice history`, admin ? r.data.invoices.length > 0 : Array.isArray(r.data.invoices) && r.data.invoices.length === 0);
      rec(`R4 ${role} receives paid summary`, r.data.summary && typeof r.data.summary.paidCount === "number" && r.data.summary.paidCount > 0);
    }
    const inv = await prisma.billingInvoice.findFirstOrThrow({ where: { companyId, status: "PAID" } });
    const direct = await http("GET", `/billing/invoices/${inv.id}`, u.token);
    rec(`R5 ${role} ${admin ? "can" : "cannot"} read an individual invoice`, admin ? direct.status === 200 : direct.status === 404 || direct.status === 403, `status=${direct.status}`);
  }
  const outsider = await registerUser("wsd-outsider"); created.push(outsider.id);
  const o = await http("GET", `/companies/${companyId}/billing/status`, outsider.token);
  rec("R6 a non-member is still denied", o.status === 403 || o.status === 404, `status=${o.status}`);

  // MMRI-23: totals must cover every invoice, not the newest 50
  const before = await http("GET", `/companies/${companyId}/billing/status`, qa.token);
  const b = before.data.summary;
  const rows = Array.from({ length: 60 }, (_, i) => ({ id: "wsdinv" + randomUUID().replace(/-/g, "").slice(0, 18), companyId, domainCode: "marketing" as any, createdByUserId: qa.id, planCode: "RETAKE" as any, amountMnt: 300000, provider: "MOCK" as any, senderInvoiceNo: "WSD-" + randomUUID(), callbackTokenHash: randomUUID(), status: "PAID" as any, paidAt: new Date(Date.now() - 1000 * (i + 1)), providerPaymentId: "wsdpay-" + randomUUID(), createdAt: new Date(Date.now() - 86400000 * 30 - 1000 * i) }));
  await prisma.billingInvoice.createMany({ data: rows }); createdInv.push(...rows.map(r => r.id));
  const after = await http("GET", `/companies/${companyId}/billing/status`, qa.token);
  const a = after.data.summary;
  rec("T1 paidCount covers all invoices (+60)", a.paidCount === b.paidCount + 60, `before=${b.paidCount} after=${a.paidCount}`);
  rec("T2 totalPaidMnt covers all invoices (+18,000,000)", a.totalPaidMnt === b.totalPaidMnt + 60 * 300000, `before=${b.totalPaidMnt} after=${a.totalPaidMnt}`);
  rec("T3 history reports truncation / total / hasMore instead of silently truncating", after.data.history && after.data.history.total === after.data.summary.paidCount + (await prisma.billingInvoice.count({ where: { companyId, status: { not: "PAID" } } })) && typeof after.data.history.hasMore === "boolean", JSON.stringify(after.data.history ?? null));
  const page2 = await http("GET", `/companies/${companyId}/billing/invoices?offset=50&limit=50`, qa.token);
  rec("T4 older invoices reachable by pagination", page2.status === 200 && Array.isArray(page2.data.invoices) && page2.data.invoices.length > 0 && page2.data.total === after.data.history?.total, `status=${page2.status} n=${page2.data?.invoices?.length}`);
} finally {
  if (createdInv.length) await prisma.billingInvoice.deleteMany({ where: { id: { in: createdInv } } });
  if (created.length) { await prisma.companyMembership.deleteMany({ where: { userId: { in: created } } }); }
  await prisma.$disconnect();
}
console.log(fail ? `\n${fail} FAILED` : "\nALL PASSED"); process.exit(fail ? 1 : 0);
