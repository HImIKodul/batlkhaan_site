/* Shared helpers for admin regression tests: TOTP, API calls, throw-away admin provisioning through the REAL CLI (password via stdin). */
import crypto from 'crypto';import {spawnSync,execFileSync} from 'child_process';
/* SAFETY GUARD (functional-repair phase): these helpers send real requests and run raw SQL. They used to default to the shared dev service (:4000) and the shared
   `mmri` database, which a run without explicit settings would silently hit. They now refuse to target either unless the caller opts in explicitly. */
const SHARED_OK=process.env.MMRI_QA_ALLOW_SHARED==='YES';
export const B=process.env.API||(SHARED_OK?'http://localhost:4000/api/v1':(()=>{throw new Error('admin-qa: set API=<isolated api base> explicitly (default :4000 is the shared service; opt in with MMRI_QA_ALLOW_SHARED=YES)')})());
if(!SHARED_OK&&/(localhost|127\.0\.0\.1):4000(\/|$)/.test(B))throw new Error('admin-qa: refusing to target the shared service on :4000 (opt in with MMRI_QA_ALLOW_SHARED=YES)');
const PGDB=process.env.PGDATABASE||(SHARED_OK?'mmri':(()=>{throw new Error('admin-qa: set PGDATABASE=<isolated database> explicitly (default `mmri` is the shared database; opt in with MMRI_QA_ALLOW_SHARED=YES)')})());
if(!SHARED_OK&&PGDB==='mmri')throw new Error('admin-qa: refusing to use the shared `mmri` database (opt in with MMRI_QA_ALLOW_SHARED=YES)');
const A32='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const dec=t=>{let bits=0,v=0;const o=[];for(const ch of t){v=(v<<5)|A32.indexOf(ch);bits+=5;if(bits>=8){o.push((v>>>(bits-8))&255);bits-=8}}return Buffer.from(o)};
export const totp=(secret,offsetSteps=0)=>{const c=Buffer.alloc(8);c.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)+offsetSteps));const h=crypto.createHmac('sha1',dec(secret)).update(c).digest();const o=h[h.length-1]&15;const b=((h[o]&0x7f)<<24)|(h[o+1]<<16)|(h[o+2]<<8)|h[o+3];return String(b%1000000).padStart(6,'0')};
export const sql=q=>execFileSync('docker',['exec','mmri-v3-local-postgres-1','psql','-U','mmri','-d',PGDB,'-At','-c',q],{encoding:'utf8'}).trim();
export const call=async(m,p,{tok,body,h={}}={})=>{const t=Date.now();const r=await fetch(B+p,{method:m,headers:{'content-type':'application/json',...(tok?{authorization:'Bearer '+tok}:{}),...h},body:body===undefined?undefined:JSON.stringify(body)});const txt=await r.text();let j=null;try{j=JSON.parse(txt)}catch{}return {s:r.status,d:j?.data,e:j?.error,raw:txt,h:r.headers,ms:Date.now()-t}};
export const rndPw=()=>crypto.randomBytes(12).toString('base64url')+'Aa1!xyz';
export function provision(role,label){const email=`admin.qa.${label}.${Date.now()}.${crypto.randomBytes(2).toString('hex')}@mmri.test`;const password=rndPw();
 const r=spawnSync('npx',['tsx','src/admin-cli.ts','bootstrap','--email',email,'--role',role,'--password-stdin','--allow-additional-super'],{cwd:new URL('../..',import.meta.url).pathname,input:password,encoding:'utf8'});
 const secret=(r.stdout.match(/Secret : ([A-Z2-7]+)/)||[])[1];if(!secret)throw new Error('bootstrap failed: '+(r.stderr||r.stdout).slice(0,200));return {email,password,secret,role,out:r.stdout,err:r.stderr}}
export async function adminLogin(a,offset=0){const r=await call('POST','/admin/auth/login',{body:{email:a.email,password:a.password,totpCode:totp(a.secret,offset)}});return r}
export async function customer(label){const email=`cu.${label}.${Date.now()}.${crypto.randomBytes(2).toString('hex')}@mmri.test`,password=rndPw();const r=await call('POST','/auth/register',{body:{email,password,displayName:'QA '+label}});return {email,password,tok:r.d.accessToken,id:r.d.user.id}}
