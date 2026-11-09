/* WS-D MMRI-24: company members can be listed and individually revoked; the last OWNER can never be removed; role checks.
   Creates its own throw-away company. Usage: DATABASE_URL=<mmri_ws_d url> API=http://127.0.0.1:4114 npx tsx scripts/qa-wsd-members.ts */
import { rec, http, registerUser, prisma, fail } from "./qa-wsd-lib.js";
const owner = await registerUser("wsd-own"), owner2 = await registerUser("wsd-own2"), admin = await registerUser("wsd-adm"), viewer = await registerUser("wsd-vw"), assessor = await registerUser("wsd-as"), outsider = await registerUser("wsd-out");
const c = await http("POST", "/companies", owner.token, { name: "WSD-MEMBERS-" + Date.now() });
const cid = c.data.id as string;
const add = (u: any, role: string) => prisma.companyMembership.upsert({ where: { companyId_userId: { companyId: cid, userId: u.id } }, create: { companyId: cid, userId: u.id, role: role as any }, update: { role: role as any } });
try {
  await add(admin, "ADMIN"); await add(viewer, "VIEWER"); await add(assessor, "ASSESSOR");
  const list = await http("GET", `/companies/${cid}/members`, owner.token);
  rec("M1 owner lists members (email, role, isSelf)", list.status === 200 && list.data.length === 4 && list.data.some((x: any) => x.email === owner.email && x.role === "OWNER" && x.isSelf === true), `status=${list.status}`);
  rec("M2 admin may list; viewer/assessor/outsider may not", (await http("GET", `/companies/${cid}/members`, admin.token)).status === 200 && (await http("GET", `/companies/${cid}/members`, viewer.token)).status === 403 && (await http("GET", `/companies/${cid}/members`, assessor.token)).status === 403 && [403, 404].includes((await http("GET", `/companies/${cid}/members`, outsider.token)).status));
  rec("M3 viewer cannot revoke another member", (await http("DELETE", `/companies/${cid}/members/${assessor.id}`, viewer.token)).status === 403);
  rec("M4 outsider cannot revoke", [403, 404].includes((await http("DELETE", `/companies/${cid}/members/${assessor.id}`, outsider.token)).status));
  const r5 = await http("DELETE", `/companies/${cid}/members/${assessor.id}`, admin.token);
  rec("M5 admin revokes an assessor (204) and the row is gone", r5.status === 204 && !(await prisma.companyMembership.findFirst({ where: { companyId: cid, userId: assessor.id } })), `status=${r5.status}`);
  rec("M5b revoked user loses access to the company", [403, 404].includes((await http("GET", `/companies/${cid}`, assessor.token)).status));
  rec("M6 revoking a non-member is 404", (await http("DELETE", `/companies/${cid}/members/${assessor.id}`, owner.token)).status === 404);
  rec("M7 admin cannot remove the owner", (await http("DELETE", `/companies/${cid}/members/${owner.id}`, admin.token)).status === 403);
  const r8 = await http("DELETE", `/companies/${cid}/members/${owner.id}`, owner.token);
  rec("M8 the last owner cannot remove themselves (409) and stays a member", r8.status === 409 && !!(await prisma.companyMembership.findFirst({ where: { companyId: cid, userId: owner.id } })), `status=${r8.status}`);
  const r9 = await http("DELETE", `/companies/${cid}/members/${viewer.id}`, viewer.token);
  rec("M9 a member may leave the company themselves", r9.status === 204, `status=${r9.status}`);
  await add(owner2, "OWNER");
  const r10 = await http("DELETE", `/companies/${cid}/members/${owner.id}`, owner2.token);
  rec("M10 with two owners one owner can be removed by the other", r10.status === 204, `status=${r10.status}`);
  const r11 = await http("DELETE", `/companies/${cid}/members/${owner2.id}`, owner2.token);
  rec("M11 the remaining sole owner cannot leave (ownership guard)", r11.status === 409, `status=${r11.status}`);
  // concurrent mutual removal of the two owners must leave exactly one owner
  await add(owner, "OWNER");
  const [a, b] = await Promise.all([http("DELETE", `/companies/${cid}/members/${owner2.id}`, owner.token), http("DELETE", `/companies/${cid}/members/${owner.id}`, owner2.token)]);
  const owners = await prisma.companyMembership.count({ where: { companyId: cid, role: "OWNER" } });
  rec("M12 concurrent mutual owner removal leaves exactly one owner", owners === 1 && [a.status, b.status].filter(s => s === 204).length === 1, `statuses=${a.status},${b.status} owners=${owners}`);
  const audit = await prisma.authAuditEvent.count({ where: { eventType: "MEMBERSHIP_CHANGED", metadata: { path: ["companyId"], equals: cid } } as any });
  rec("M13 revocations are audited", audit >= 4, `events=${audit}`);
} finally {
  await prisma.companyMembership.deleteMany({ where: { companyId: cid } }).catch(() => {});
  await prisma.company.delete({ where: { id: cid } }).catch(() => {});
  await prisma.$disconnect();
}
console.log(fail ? `\n${fail} FAILED` : "\nALL PASSED"); process.exit(fail ? 1 : 0);
