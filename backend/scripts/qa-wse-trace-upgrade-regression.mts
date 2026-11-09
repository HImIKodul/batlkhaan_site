/* WS-E MMRI-31: a valid later narrative (fallback -> AI upgrade) with a different claim structure must be freezable as a new provenance revision,
   while the first revision stays byte-identical and a change of the underlying provenance still fails as immutable.
   Needs DATABASE_URL pointing at the private clone: DATABASE_URL=$(cat harness/dburl.base)mmri_ws_e?schema=public npx tsx scripts/qa-wse-trace-upgrade-regression.mts <assessmentId> */
import { prisma } from "../src/db.js";
const { TraceabilityService } = await import(process.env.TRACE_IMPL ?? "../src/services/traceability-service.js");
import { withDeterministicClaimIds } from "../src/report/coordinator.js";
import { sha256Json } from "../src/lib/hash.js";
if (!/mmri_ws_e/.test(process.env.DATABASE_URL ?? "")) { console.log("REFUSING: DATABASE_URL must be mmri_ws_e"); process.exit(2); }
const aid = process.argv[2]; if (!aid) { console.log("assessment id required"); process.exit(2); }
let fail = 0; const rec = (n: string, ok: boolean, d = "") => { if (!ok) fail++; console.log((ok ? "PASS " : "FAIL ") + n + (d ? " | " + d : "")); };
const svc = new TraceabilityService();
const snap: any = await prisma.reportSnapshot.findFirst({ where: { assessmentId: aid } });
const payload = snap.payload; const base = withDeterministicClaimIds(snap.narrative);
const family = async () => (await prisma.traceSnapshot.findMany({ where: { assessmentId: aid, externalId: { startsWith: `TRACE-${payload.reportId}` } }, orderBy: { createdAt: "asc" } }));
const before = await family();
rec("T31-00 setup: a first provenance revision exists for the fallback report", before.length >= 1, `rows=${before.length}`);
const first = before[0];
// a valid upgrade: same facts, different claim structure (an extra S09-style claim bound to existing traces, and a changed claim type mix)
const upgraded = JSON.parse(JSON.stringify(base)); const s10 = upgraded.sections.find((s: any) => s.id === "S10");
const extra = JSON.parse(JSON.stringify(s10.claims[0])); extra.textMn = extra.textMn + " Нэмэлт өгүүлбэр."; s10.claims.push(extra);
const upgradedIds = withDeterministicClaimIds(upgraded);
let threw: any = null; let res: any = null;
try { res = await svc.freezePublicationTrace(aid, payload, upgradedIds, prisma as any, snap.id); } catch (e: any) { threw = e; }
rec("T31-01 an eligible narrative upgrade with a different claim graph is frozen without an immutability error", !threw, threw ? String(threw.message).slice(0, 120) : "");
const after = await family();
rec("T31-02 the new revision is appended, the first revision is untouched", !threw && after.length === before.length + 1 && after[0].id === first.id && sha256Json(after[0].graph) === first.graphHash && after[0].graphHash === first.graphHash, `rows=${after.length}`);
const latest = await svc.getFrozenTrace(aid);
rec("T31-03 the frozen trace served to the customer is the newest verified revision", !threw && latest?.graphHash === after.at(-1)?.graphHash && latest?.graphHash !== first.graphHash);
let again: any = null; try { again = await svc.freezePublicationTrace(aid, payload, upgradedIds, prisma as any, snap.id); } catch { /* */ }
rec("T31-04 freezing the same upgraded narrative again is idempotent (no extra row)", Boolean(again) && (await family()).length === after.length);
// provenance core changed (evidence binding of a strength) must still be refused
const tampered = JSON.parse(JSON.stringify(payload)); const other = tampered.weaknesses[0]?.sourceTraceIds?.[0];
tampered.strengths[0].sourceTraceIds = [...tampered.strengths[0].sourceTraceIds.slice(0, -1), other];
let tamperThrew = false; try { await svc.freezePublicationTrace(aid, tampered, base, prisma as any, snap.id); } catch { tamperThrew = true; }
rec("T31-05 changed underlying provenance is still refused and appends nothing", tamperThrew && (await family()).length === after.length);
console.log(fail ? `FAILED ${fail}` : "ALL PASS"); await prisma.$disconnect(); process.exit(fail ? 1 : 0);
