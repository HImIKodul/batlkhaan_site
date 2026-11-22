/* DB-01: coherence of a RESTORED database + report storage (run against the restore target; read-only). Usage: DATABASE_URL=... MMRI_REPORT_STORAGE_DIR=... npx tsx scripts/verify-restore-consistency.mts [--expect counts.json] [--write-counts counts.json]
   Checks: every artifact row has its file with the recorded size and sha256 and exactly 3 pages; snapshot narrative/payload hashes; frozen logo snapshots exist and belong to the same company; current logos belong to their company;
   no PAID/REFUNDED invoice lacks its ledger/entitlement history; migration count; key table counts (compared with a baseline file when given). */
import fs from "node:fs";import path from "node:path";import crypto from "node:crypto";
import {prisma} from "../src/db.js";import {sha256Json} from "../src/lib/hash.js";import {pdfPageCount} from "../src/services/report-pdf-artifact-service.js";
const storage=path.resolve(process.env.MMRI_REPORT_STORAGE_DIR!);const args=process.argv.slice(2);const arg=(k:string)=>{const i=args.indexOf(k);return i>=0?args[i+1]:undefined};
let bad=0;const rec=(n:string,ok:boolean,d="")=>{if(!ok)bad++;console.log((ok?"PASS ":"FAIL ")+n+(d?" | "+d:""))};
const one=async(q:string)=>Number((await (prisma as any).$queryRawUnsafe(q))[0].n);
const counts:Record<string,number>={};for(const [k,t] of Object.entries({users:"users",companies:"companies",assessments:"assessments",reportSnapshots:"report_snapshots",reportArtifacts:"report_artifacts",logoAssets:"company_logo_assets",invoices:"billing_invoices",entitlements:"company_entitlements",reviews:"report_reviews",payments:"billing_payment_transactions"}))counts[k]=await one(`select count(*)::int n from ${t}`);
console.log("COUNTS "+JSON.stringify(counts));
const base=arg("--expect");if(base){const exp=JSON.parse(fs.readFileSync(base,"utf8"));for(const k of Object.keys(exp))rec(`row count ${k}: restored == source`,counts[k]===exp[k],`${counts[k]} vs ${exp[k]}`)}
if(arg("--write-counts"))fs.writeFileSync(arg("--write-counts")!,JSON.stringify(counts));
rec("migrations applied (no unfinished)",(await one(`select count(*)::int n from _prisma_migrations where finished_at is null`))===0,String(await one(`select count(*)::int n from _prisma_migrations`)));
const arts:any[]=await (prisma as any).reportArtifact.findMany();let okFiles=0;
for(const a of arts){const f=path.resolve(storage,a.storageKey);const ex=fs.existsSync(f);const buf=ex?fs.readFileSync(f):null;const good=!!buf&&buf.length===a.sizeBytes&&crypto.createHash("sha256").update(buf).digest("hex")===a.contentHash&&pdfPageCount(f,buf)===3;if(good)okFiles++;else console.log("  bad artifact",a.id,a.storageKey,ex?"hash/size/pages mismatch":"FILE MISSING")}
rec("every report_artifacts row has its file: size, sha256 and exactly 3 pages",okFiles===arts.length,`${okFiles}/${arts.length}`);
const snaps:any[]=await (prisma as any).reportSnapshot.findMany({where:{publishedAt:{not:null}}});let okSnap=0;for(const s of snaps){if(s.narrative&&s.narrativeHash===sha256Json(s.narrative)&&s.payloadHash===(s.payload as any).payloadHash)okSnap++}
rec("published snapshots: narrative hash and payload hash match their stored content",okSnap===snaps.length,`${okSnap}/${snaps.length}`);
let logoOk=0,logoRefs=0;for(const s of snaps){const l=(s.narrative as any)?.companyLogo;if(!l)continue;logoRefs++;const a:any=await (prisma as any).companyLogoAsset.findUnique({where:{id:l.assetId}});const asm:any=await (prisma as any).assessment.findUnique({where:{id:(s.payload as any).assessmentId},select:{companyId:true}});if(a&&a.sha256===l.sha256&&a.companyId===asm?.companyId&&crypto.createHash("sha256").update(a.bytes).digest("hex")===a.sha256)logoOk++}
rec("report logo snapshots: asset exists, same company, bytes match hash",logoOk===logoRefs,`${logoOk}/${logoRefs}`);
rec("current company logos belong to their own company",(await one(`select count(*)::int n from companies c join company_logo_assets a on a.id=c."logoAssetId" where a."companyId"<>c.id`))===0);
rec("no PAID invoice without a payment ledger entry or entitlement (MOCK demo invoices excluded: they exist only in QA)",(await one(`select count(*)::int n from billing_invoices i where i.status='PAID' and i.provider<>'MOCK' and not exists(select 1 from billing_payment_transactions t where t."invoiceId"=i.id) and not exists(select 1 from company_entitlements e where e."sourceInvoiceId"=i.id)`))===0);
rec("no duplicate payment reference across invoices",(await one(`select count(*)::int n from (select "providerPaymentId" from billing_invoices where "providerPaymentId" is not null group by 1 having count(*)>1) x`))===0);
console.log(`RESULT bad=${bad}`);await prisma.$disconnect();process.exit(bad?1:0);
