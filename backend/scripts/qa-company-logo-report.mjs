/* End-to-end QA: logo snapshot in the report and the real PDF. ISOLATED API + QA database. Real diagnosis through the API, real review approval, real PDF renderer. */
import fs from 'node:fs';import crypto from 'node:crypto';import {execFileSync,spawnSync} from 'node:child_process';
const R=new URL('./lib/',import.meta.url).pathname;const {call,sql,freshAdminTotp,customer,B}=await import(R+'admin-qa.mjs');const {journey,http}=await import(R+'qa-journey.mjs');
const cr=Object.fromEntries(fs.readFileSync('/home/kirby/mmri-qa-runtime/credentials.local','utf8').split('\n').filter(l=>/^[A-Z_]+=/.test(l)).map(l=>[l.split('=')[0],l.slice(l.indexOf('=')+1)]));
const OUT=process.env.OUT_DIR||'/tmp/logo-report-e2e';fs.mkdirSync(OUT,{recursive:true});
const sup={email:cr.ADMIN_EMAIL,password:cr.ADMIN_PASSWORD,secret:cr.ADMIN_TOTP_SECRET};let pass=0,fail=0;const rec=(n,ok,d='')=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(d?' | '+d:''))};const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const login=async()=>await call('POST','/admin/auth/login',{body:{email:sup.email,password:sup.password,totpCode:await freshAdminTotp(sup)}});let L=await login();let tok=L.d?.token;
const adm=async(m,p,body)=>{let r=await call(m,'/admin'+p,{tok,body});if(r.s===401&&r.e?.code==='ADMIN_REAUTH_REQUIRED'){await call('POST','/admin/auth/reauth',{tok,body:{password:sup.password,totpCode:await freshAdminTotp(sup)}});r=await call(m,'/admin'+p,{tok,body})}else if(r.s===401){L=await login();tok=L.d.token;r=await call(m,'/admin'+p,{tok,body})}return r};
const bin=async(p,t)=>{const r=await fetch(B+p,{headers:{authorization:'Bearer '+t}});return {s:r.status,buf:Buffer.from(await r.arrayBuffer())}};
const pages=f=>Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo',[f],{encoding:'utf8'}))[1]);
const img=(c)=>spawnSync('python3',['-c',`import sys,io;from PIL import Image,ImageDraw;im=Image.new('RGBA',(480,300),(0,0,0,0));d=ImageDraw.Draw(im);d.rounded_rectangle((10,10,470,290),40,fill=${c});d.ellipse((150,60,330,240),fill=(255,255,255,255));b=io.BytesIO();im.save(b,'PNG');sys.stdout.buffer.write(b.getvalue())`],{maxBuffer:5e6}).stdout;
const logoA=img('(20,90,220,255)'),logoB=img('(220,60,60,255)');
// kept historical QA report: PDF must be byte-identical and have no logo
const keptA=sql(`select id from assessments order by "createdAt" limit 1`);const kc={email:cr.CUSTOMER_EMAIL,password:cr.CUSTOMER_PASSWORD};const kt=(await http(B,'POST','/auth/login',{body:kc})).d.accessToken;const k0=await bin(`/assessments/${keptA}/report/pdf`,kt);
const cu=await customer('logorep');const co=await http(B,'POST','/companies',{tok:cu.tok,body:{name:'Лого тайлан тест ХХК'}});
const up=await http(B,'PUT',`/companies/${co.d.id}/logo`,{tok:cu.tok,body:{dataBase64:logoA.toString('base64')}});const sha1=up.d?.logo?.sha256;rec('logo uploaded before the diagnosis',up.s===200&&!!sha1);
fs.writeFileSync(`${OUT}/fixture-credentials.json`,JSON.stringify({email:cu.email,password:cu.password,companyId:co.d.id}),{mode:0o600});
const j=await journey(B,cu.tok,co.d.id,'finance');rec('diagnosis completed through the API',j.answered>0,`${j.answered} answers`);
let rid=null;for(let i=0;i<120&&!rid;i++){const r=sql(`select id from report_reviews where "assessmentId"='${j.a}'`);if(r&&sql(`select status from report_reviews where id='${r}'`)==='AWAITING_REVIEW')rid=r;else await sleep(2000)}
rec('report generated and queued for review',!!rid);
const snap=JSON.parse(sql(`select coalesce(narrative->'companyLogo','null'::jsonb)::text from report_snapshots where "assessmentId"='${j.a}' limit 1`));
rec('report froze a logo snapshot (asset id + sha256) at generation',snap?.sha256===sha1&&!!snap?.assetId,JSON.stringify(snap||{}).slice(0,120));
const tc=(await http(B,'POST','/auth/login',{body:{email:cu.email,password:cu.password}})).d.accessToken;
await adm('POST',`/reviews/${rid}/claim`);const rv=Number(sql(`select "currentRevision" from report_reviews where id='${rid}'`));const ap=await adm('POST',`/reviews/${rid}/approve`,{baseRevision:rv});rec('administrator approval publishes the report',ap.s===200&&sql(`select status from report_reviews where id='${rid}'`)==='PUBLISHED');
// web report logo
let wl=await bin(`/assessments/${j.a}/report/logo`,tc);rec('browser report logo endpoint returns the snapshot image',wl.s===200&&crypto.createHash('sha256').update(wl.buf).digest('hex')===sha1);
// PDF
const p1=await bin(`/assessments/${j.a}/report/pdf`,tc);fs.writeFileSync(`${OUT}/with-logo.pdf`,p1.buf);
rec('customer PDF downloads and has exactly 3 pages',p1.s===200&&pages(`${OUT}/with-logo.pdf`)===3);
const imgs=execFileSync('pdfimages',['-list',`${OUT}/with-logo.pdf`],{encoding:'utf8'}).split('\n').filter(l=>/^\s*1\s/.test(l));rec('page 1 of the PDF embeds the company logo image',imgs.length>=1,imgs[0]?.trim().slice(0,90));
execFileSync('pdftoppm',['-jpeg','-r','90','-f','1','-l','1',`${OUT}/with-logo.pdf`,`${OUT}/with-logo-p`]);
const t1=execFileSync('pdftotext',['-f','1','-l','1',`${OUT}/with-logo.pdf`,'-'],{encoding:'utf8'});rec('title and company name are still on page 1',/УДИРДЛАГЫН ТАЙЛАН/.test(t1)&&/Лого тайлан тест/.test(t1));
// replace then remove the company logo: the issued report keeps its snapshot
const rep=await http(B,'PUT',`/companies/${co.d.id}/logo`,{tok:cu.tok,body:{dataBase64:logoB.toString('base64')}});rec('company replaces its logo after the report was issued',rep.s===200&&rep.d.logo.sha256!==sha1);
const p2=await bin(`/assessments/${j.a}/report/pdf`,tc);rec('issued PDF is byte-identical after the logo was replaced',p2.s===200&&crypto.createHash('sha256').update(p2.buf).digest('hex')===crypto.createHash('sha256').update(p1.buf).digest('hex'));
wl=await bin(`/assessments/${j.a}/report/logo`,tc);rec('report logo endpoint still serves the ORIGINAL snapshot',wl.s===200&&crypto.createHash('sha256').update(wl.buf).digest('hex')===sha1);
await http(B,'DELETE',`/companies/${co.d.id}/logo`,{tok:cu.tok});
const p3=await bin(`/assessments/${j.a}/report/pdf`,tc);wl=await bin(`/assessments/${j.a}/report/logo`,tc);rec('after the logo is removed the issued report still has it (PDF identical, endpoint 200)',crypto.createHash('sha256').update(p3.buf).digest('hex')===crypto.createHash('sha256').update(p1.buf).digest('hex')&&wl.s===200);
// other company cannot read this report's logo
const other=await customer('logoother');rec('another customer cannot read the report logo',(await bin(`/assessments/${j.a}/report/logo`,other.tok)).s===404);
// historical report (no logo)
const k1=await bin(`/assessments/${keptA}/report/pdf`,kt);const kl=await bin(`/assessments/${keptA}/report/logo`,kt);
rec('historical published QA report: PDF byte-identical and no logo',k0.s===200&&k1.s===200&&crypto.createHash('sha256').update(k0.buf).digest('hex')===crypto.createHash('sha256').update(k1.buf).digest('hex')&&kl.s===404);
console.log(`CASE assessment=${j.a} company=${co.d.id} email=${cu.email} OUT=${OUT}`);console.log(`RESULT pass=${pass} fail=${fail}`);process.exit(fail?1:0);
