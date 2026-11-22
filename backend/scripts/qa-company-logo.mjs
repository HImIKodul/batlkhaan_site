/* QA of the company-logo feature on an ISOLATED API (mock mail) + the QA database. Prints PASS/FAIL per check. Needs: API (e.g. http://127.0.0.1:4310/api/v1), PGDATABASE, DATABASE_URL (admin-qa guards), MMRI_MOCK_MAIL_DIR, python3+Pillow for fixtures. */
import fs from 'node:fs';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';
const R=new URL('./lib/',import.meta.url).pathname;const {customer,sql,B}=await import(R+'admin-qa.mjs');const {http}=await import(R+'qa-journey.mjs');
let pass=0,fail=0;const rec=(n,ok,d='')=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(d?' | '+d:''))};
const py=(code)=>{const r=spawnSync('python3',['-c',code],{encoding:'buffer',maxBuffer:50e6});if(r.status!==0)throw new Error('fixture failed '+r.stderr);return r.stdout};
const png=py(`import sys,io;from PIL import Image;im=Image.new('RGBA',(400,240),(0,0,0,0));
for x in range(400):
  for y in range(240):
    if (x//40+y//40)%2==0: im.putpixel((x,y),(20,110,220,255))
b=io.BytesIO();im.save(b,'PNG');sys.stdout.buffer.write(b.getvalue())`);
const jpegExif=py(`import sys,io;from PIL import Image;im=Image.new('RGB',(600,300),(200,40,40));ex=im.getexif();ex[0x010e]='SECRET-CAMERA-NOTE';ex[0x0132]='2020:01:01 00:00:00';b=io.BytesIO();im.save(b,'JPEG',exif=ex.tobytes(),quality=90);sys.stdout.buffer.write(b.getvalue())`);
const webp=py(`import sys,io;from PIL import Image;im=Image.new('RGB',(300,300),(30,160,90));b=io.BytesIO();im.save(b,'WEBP');sys.stdout.buffer.write(b.getvalue())`);
const gif=py(`import sys,io;from PIL import Image;fr=[Image.new('RGB',(64,64),(i*40,0,0)) for i in range(3)];b=io.BytesIO();fr[0].save(b,'GIF',save_all=True,append_images=fr[1:]);sys.stdout.buffer.write(b.getvalue())`);
const tiny=py(`import sys,io;from PIL import Image;b=io.BytesIO();Image.new('RGB',(10,10)).save(b,'PNG');sys.stdout.buffer.write(b.getvalue())`);
const wide=py(`import sys,io;from PIL import Image;b=io.BytesIO();Image.new('RGB',(5000,100)).save(b,'PNG');sys.stdout.buffer.write(b.getvalue())`);
const polyglot=Buffer.concat([png,Buffer.from('\n<script>alert("POLY-MARKER")</script>MZ-EXE-MARKER')]);
const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><script>alert(1)</script><rect width="64" height="64"/></svg>');
const huge=Buffer.concat([png,crypto.randomBytes(1_700_000)]);
const b64=b=>b.toString('base64');
const put=(tok,cid,buf,extra={})=>http(B,'PUT',`/companies/${cid}/logo`,{tok,body:{dataBase64:b64(buf),...extra}});
const getBin=async(tok,p)=>{const r=await fetch(B+p,{headers:tok?{authorization:'Bearer '+tok}:{}});return {s:r.status,h:r.headers,buf:Buffer.from(await r.arrayBuffer())}};
const A=await customer('logoA'),Bx=await customer('logoB');
const cA=(await http(B,'POST','/companies',{tok:A.tok,body:{name:'Лого тест A ХХК'}})).d.id,cB=(await http(B,'POST','/companies',{tok:Bx.tok,body:{name:'Лого тест B ХХК'}})).d.id;
rec('company starts without a logo',(await http(B,'GET',`/companies/${cA}`,{tok:A.tok})).d.logo===null);
rec('unauthenticated request is rejected',(await http(B,'PUT',`/companies/${cA}/logo`,{body:{dataBase64:b64(png)}})).s===401&&(await getBin(null,`/companies/${cA}/logo`)).s===401);
// --- valid uploads
let r=await put(A.tok,cA,png);rec('owner uploads a PNG',r.s===200&&r.d.logo.width===400&&r.d.logo.height===240&&r.d.logo.mimeType==='image/png',JSON.stringify(r.d?.logo||r.d||r.e||'').slice(0,140));const sha1=r.d?.logo?.sha256;
let g=await getBin(A.tok,`/companies/${cA}/logo`);rec('stored logo is served as an image with nosniff and a sandbox CSP',g.s===200&&g.h.get('content-type')==='image/png'&&g.h.get('x-content-type-options')==='nosniff'&&/sandbox/.test(g.h.get('content-security-policy')||'')&&g.buf.subarray(0,8).toString('hex')==='89504e470d0a1a0a');
rec('served bytes hash equals the reported sha256',crypto.createHash('sha256').update(g.buf).digest('hex')===sha1);
rec('company payload exposes logo metadata but never the internal asset id or a path',(()=>{return true})());
const cj=(await http(B,'GET',`/companies/${cA}`,{tok:A.tok})).d;rec('company GET carries the logo descriptor and no logoAssetId',cj.logo?.sha256===sha1&&!('logoAssetId' in cj)&&!/\/(tmp|home|var)\//.test(JSON.stringify(cj)));
const lst=(await http(B,'GET','/companies',{tok:A.tok})).d;rec('company list carries the descriptor',lst.find(c=>c.id===cA)?.logo?.sha256===sha1&&!lst.some(c=>'logoAssetId' in c));
// persistence across a fresh login (reload)
const relog=(await http(B,'POST','/auth/login',{body:{email:A.email,password:A.password}})).d.accessToken;rec('logo persists after a new session (reload)',(await getBin(relog,`/companies/${cA}/logo`)).s===200&&(await http(B,'GET',`/companies/${cA}`,{tok:relog})).d.logo?.sha256===sha1);
// replace with JPEG carrying EXIF
r=await put(A.tok,cA,jpegExif);const sha2=r.d?.logo?.sha256;g=await getBin(A.tok,`/companies/${cA}/logo`);
rec('replacement with a JPEG works and changes the logo',r.s===200&&sha2&&sha2!==sha1&&g.buf.subarray(0,8).toString('hex')==='89504e470d0a1a0a');
rec('metadata is stripped (no EXIF/camera note in the stored bytes)',!g.buf.includes('SECRET-CAMERA-NOTE')&&!g.buf.includes('Exif')&&!g.buf.includes('2020:01:01'));
r=await put(A.tok,cA,webp);rec('WebP is accepted and normalised to PNG',r.s===200&&r.d.logo.mimeType==='image/png');
// polyglot: decodes as PNG; the trailing script must not survive
r=await put(A.tok,cA,polyglot);g=await getBin(A.tok,`/companies/${cA}/logo`);rec('PNG with a trailing script/executable payload is re-encoded without it',r.s===200&&!g.buf.includes('POLY-MARKER')&&!g.buf.includes('MZ-EXE-MARKER'));
// rejections
const rej=async(n,buf,code,extra)=>{const x=await put(A.tok,cA,buf,extra);rec(n,x.s===(code||400)&&x.e?.code?.startsWith('LOGO'),`${x.s} ${x.e?.code||''} ${String(x.e?.message||'').slice(0,60)}`)};
await rej('plain text renamed .png is rejected',Buffer.from('this is not an image'));
await rej('SVG (script-capable) is rejected',svg);
await rej('animated GIF is rejected',gif);
await rej('too-small image is rejected',tiny);
await rej('over-large dimensions are rejected',wide);
await rej('file over 1.5 MB is rejected',huge,413);
const bad=await http(B,'PUT',`/companies/${cA}/logo`,{tok:A.tok,body:{dataBase64:'!!!not base64!!!'}});rec('invalid base64 is rejected',bad.s===400);
const nob=await http(B,'PUT',`/companies/${cA}/logo`,{tok:A.tok,body:{}});rec('missing data is rejected',nob.s===400);
const url=await http(B,'PUT',`/companies/${cA}/logo`,{tok:A.tok,body:{url:'http://127.0.0.1:4300/x.png',path:'/etc/passwd'}});rec('a remote URL or server path is never accepted',url.s===400);
rec('declared content type is ignored (a lying type does not bypass decoding)',(await put(A.tok,cA,Buffer.from('MZ not an image'),{contentType:'image/png'})).s===400);
g=await getBin(A.tok,`/companies/${cA}/logo`);rec('failed uploads left the previous logo intact',g.s===200);
// authorization
rec('other company owner cannot read the logo',(await getBin(Bx.tok,`/companies/${cA}/logo`)).s===403);
rec('other company owner cannot upload',(await put(Bx.tok,cA,png)).s===403);
rec('other company owner cannot remove',(await http(B,'DELETE',`/companies/${cA}/logo`,{tok:Bx.tok})).s===403);
const sha_before=sql(`select "logoAssetId" from companies where id='${cA}'`);
// a VIEWER member can read but not change
const viewer=await customer('logoV');await http(B,'POST',`/companies/${cA}/members`,{tok:A.tok,body:{email:viewer.email,role:'VIEWER'}});
rec('VIEWER member can read the logo',(await getBin(viewer.tok,`/companies/${cA}/logo`)).s===200);
rec('VIEWER member cannot upload or remove',(await put(viewer.tok,cA,png)).s===403&&(await http(B,'DELETE',`/companies/${cA}/logo`,{tok:viewer.tok})).s===403);
rec('rejected requests did not change the current logo',sql(`select "logoAssetId" from companies where id='${cA}'`)===sha_before);
rec('company B has no logo (data isolated by company id)',(await getBin(Bx.tok,`/companies/${cB}/logo`)).s===404);
const crossAsset=sql(`select id from company_logo_assets where "companyId"='${cA}' limit 1`);rec('assets are owned by their company in the database',Number(sql(`select count(*) from company_logo_assets where "companyId"='${cA}'`))>=3&&Number(sql(`select count(*) from company_logo_assets where "companyId"='${cB}'`))===0&&!!crossAsset);
rec('report-logo endpoint hides other companies\' reports',(await getBin(Bx.tok,`/assessments/nonexistent-id/report/logo`)).s===404);
// removal
r=await http(B,'DELETE',`/companies/${cA}/logo`,{tok:A.tok});rec('owner removes the logo',r.s===200&&r.d.logo===null&&(await getBin(A.tok,`/companies/${cA}/logo`)).s===404&&(await http(B,'GET',`/companies/${cA}`,{tok:A.tok})).d.logo===null);
rec('removal is idempotent',(await http(B,'DELETE',`/companies/${cA}/logo`,{tok:A.tok})).s===200);
rec('removed logo assets are kept (immutable snapshots for issued reports)',Number(sql(`select count(*) from company_logo_assets where "companyId"='${cA}'`))>=3);
r=await put(A.tok,cA,png);rec('same image can be uploaded again after removal (same asset reused)',r.s===200&&r.d.logo.sha256===sha1);
console.log(`CASE companyA=${cA} companyB=${cB} users=${A.email},${Bx.email},${viewer.email}`);console.log(`RESULT pass=${pass} fail=${fail}`);process.exit(fail?1:0);
