/* Static guards for the Codex audit repairs that are not covered by a live API test: Dockerfile (H04), terminal-completion hooks (H01), payment-check wiring (M01),
   revision visibility, and the frozen migration fingerprint. Usage: node scripts/qa-codex-static-regression.mjs (from backend/) */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const root=path.resolve(new URL('..',import.meta.url).pathname);const repo=path.resolve(root,'..');const rd=p=>fs.readFileSync(path.join(root,p),'utf8');const rdr=p=>fs.readFileSync(path.join(repo,p),'utf8');
let fail=0;const rec=(n,ok,d='')=>{if(!ok)fail++;console.log((ok?'PASS ':'FAIL ')+n+(d?' | '+d:''))};
const df=rd('Dockerfile.production'),dm=rd('Dockerfile.migrate'),di=fs.existsSync(path.join(root,'.dockerignore'))?rd('.dockerignore'):'';
const copyOk=txt=>txt.split('\n').filter(l=>/^COPY\s/.test(l)).every(l=>{const a=l.trim().split(/\s+/).slice(1).filter(x=>!x.startsWith('--'));const dest=a[a.length-1];return a.length-1<=1||dest==='.'||dest.endsWith('/')});
rec('H04-1 every COPY with more than one source has a directory destination (the malformed "package.json package-lock.json ./package.json" is gone)',!/COPY\s+\S+\s+\S+\s+\.\/package\.json/.test(df)&&copyOk(df)&&copyOk(dm));
// the rule itself must reject the original defect
rec('H04-1b the rule rejects the original malformed line',copyOk('COPY package.json package-lock.json ./package.json')===false&&copyOk('COPY package.json package-lock.json ./')===true);
rec('H04-2 the runtime image installs poppler-utils (pdfinfo is used by report publication to prove 3 pages) and the PDF toolchain',/poppler-utils/.test(df)&&/python3-reportlab/.test(df)&&/fonts-noto-core/.test(df));
rec('H04-3 OpenSSL is installed in the build, runtime and migrate stages and the Prisma binary target is pinned (the slim image has none, so the client could not load its engine)',(df.match(/\bopenssl\b/g)||[]).length>=2&&/\bopenssl\b/.test(dm)&&/debian-openssl-3\.0\.x/.test(rd('prisma/schema.prisma')));
rec('H04-4 a .dockerignore keeps .env, the QA credentials file, node_modules and report storage out of the build context',/^\.env$/m.test(di)&&/\.qa-credentials\.local/.test(di)&&/^node_modules$/m.test(di)&&/report-storage/.test(di)&&!/^methodology/m.test(di)&&!/^pdf_renderer/m.test(di)&&!/^prisma/m.test(di));
const eng=rd('src/services/prisma-assessment-engine.ts');
rec('H01-S1 all three production terminal write paths (answer, explicit completion, lifecycle auto-finalize) enqueue the review inside their transaction',(eng.match(/await enqueueReviewInTx\(tx,/g)||[]).length>=3);
const app=rd('src/api/app.ts');
rec('H01-S2 the /complete endpoint no longer creates the review after the fact or swallows a creation failure',!/review_task_create_failed/.test(app)&&!/try\{reviewTask=await reviews\.createForAssessment/.test(app));
rec('H01-S3 the action-plan milestone write is behind the review gate',/action-plan\/milestones\/:milestoneId[\s\S]{0,400}await reviewGate\(/.test(app));
const rs=rd('src/api/admin/review-service.ts');
rec('H03-S1 publication uses an exclusive PUBLISHING state, binds to approvedRevision/approvedNarrativeHash and the final update is guarded',/PUBLISHING/.test(rs)&&/approvedNarrativeHash/.test(rs)&&/status: "PUBLISHING", currentRevision/.test(rs));
rec('H03-S2 edits are only accepted from editable states at the database update itself (not just in a prior read)',/currentRevision: baseRevision, status: \{ in: \["IN_REVIEW", "READY_FOR_APPROVAL", "APPROVED"\] \}/.test(rs));
rec('M02-S1 approval and publication both require validation.state === "PASS" (the customer report page requires the same)',(rs.match(/v\.state !== "PASS"/g)||[]).length>=2&&/validation\?\.state!=='PASS'/.test(rdr('frontend/src/pages/Report.tsx')));
const bill=rdr('frontend/src/pages/Billing.tsx'),cl=rdr('frontend/src/api/client.ts');
rec('M01-S1 the "confirm payment" button calls the reconcile API (not only the cached status read)',/const check=async\(\)=>\{[\s\S]{0,600}api\.reconcileBillingInvoice\(/.test(bill)&&/reconcileBillingInvoice:\(invoiceId:string\)=>request<BillingInvoice>\(`\/billing\/invoices\/\$\{invoiceId\}\/reconcile`,\{method:'POST'\}\)/.test(cl));
rec('M01-S2 the reconcile route is authorised and throttled, the button shows a pending state and a 429 gets its own message',/reconcileLimiter\.check\(/.test(app)&&/<Button loading=\{busy\} onClick=\{check\}>/.test(bill)&&/e\.status===429/.test(bill));
rec('H06-S1 the password reset revokes administrator sessions inside the same transaction as the password change',/tx\.adminSession\.updateMany/.test(rd('src/api/auth/password-reset-service.ts')));
rec('H02-S1 the company export does not select derived report content directly in the main query',!/assessment\.findMany\(\{ where: \{ companyId \}[\s\S]{0,900}reportSnapshots:/.test(rd('src/api/account/data-lifecycle-service.ts')));
rec('H05-S1 erasure transaction has an explicit timeout and the foreign keys on its cascade path are indexed',/timeout: 120_000/.test(rd('src/api/account/data-lifecycle-service.ts'))&&/recommendations_rootFindingId_idx/.test(rd('prisma/migrations/20261106120000_review_hardening/migration.sql')));
const dirs=fs.readdirSync(path.join(root,'prisma/migrations'),{withFileTypes:true}).filter(x=>x.isDirectory()).map(x=>x.name).sort();const h=crypto.createHash('sha256');for(const n of dirs){const rel=`backend/prisma/migrations/${n}/migration.sql`;h.update(rel);h.update('\0');h.update(fs.readFileSync(path.join(repo,rel)));h.update('\0')}
const chain=h.digest('hex');rec('REL-1 the frozen migration fingerprint (deploy + backend) matches the committed migration chain',rdr('deploy/MIGRATION_CHAIN_SHA256.txt').trim().split(/\s+/)[0]===chain&&rd('prisma/MIGRATION_CHAIN_SHA256.txt').trim().split(/\s+/)[0]===chain);
rec('REL-2 the release id is exposed outside production so a browser/test can prove which backend answered',/x-mmri-release/.test(app)&&/environment!=="production"\)res\.setHeader\("x-mmri-release"/.test(app));
console.log(fail?`FAILED ${fail}`:'ALL PASS');process.exit(fail?1:0);
