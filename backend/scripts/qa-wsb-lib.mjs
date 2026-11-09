/* WS-B helpers: private clone only (mmri_ws_b, API :4112). Run through qa-wsb-run.sh. */
import crypto from 'crypto';import {spawnSync,execFileSync} from 'child_process';
if(!/mmri_ws_b\?schema=public$/.test(process.env.DATABASE_URL||'')||!/:4112\//.test(process.env.WSB_API||''))throw new Error('run through qa-wsb-run.sh (private clone only)');
export const B=process.env.WSB_API;
const A32='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const dec=t=>{let bits=0,v=0;const o=[];for(const ch of t){v=(v<<5)|A32.indexOf(ch);bits+=5;if(bits>=8){o.push((v>>>(bits-8))&255);bits-=8}}return Buffer.from(o)};
export const totp=(secret,off=0)=>{const c=Buffer.alloc(8);c.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)+off));const h=crypto.createHmac('sha1',dec(secret)).update(c).digest();const o=h[h.length-1]&15;const b=((h[o]&0x7f)<<24)|(h[o+1]<<16)|(h[o+2]<<8)|h[o+3];return String(b%1000000).padStart(6,'0')};
export const sql=q=>execFileSync('docker',['exec','mmri-v3-local-postgres-1','psql','-U','mmri','-At','-d','mmri_ws_b','-c',q],{encoding:'utf8'}).trim();
export const call=async(m,p,{tok,body,h={}}={})=>{const r=await fetch(B+p,{method:m,headers:{'content-type':'application/json',origin:'http://127.0.0.1:4212',...(tok?{authorization:'Bearer '+tok}:{}),...h},body:body===undefined?undefined:JSON.stringify(body)});const txt=await r.text();let j=null;try{j=JSON.parse(txt)}catch{}return {s:r.status,d:j?.data,e:j?.error,raw:txt}};
export function provision(role,label){const email=`wsb.${label}.${Date.now()}.${crypto.randomBytes(2).toString('hex')}@mmri.test`;const password=crypto.randomBytes(12).toString('base64url')+'Aa1!xyz';
 const r=spawnSync('npx',['tsx','src/admin-cli.ts','bootstrap','--email',email,'--role',role,'--password-stdin','--allow-additional-super'],{cwd:new URL('../',import.meta.url).pathname,input:password,encoding:'utf8',env:process.env});
 const secret=(r.stdout.match(/Secret : ([A-Z2-7]+)/)||[])[1];if(!secret)throw new Error('bootstrap failed: '+(r.stderr||r.stdout).slice(0,300));
 const id=sql(`select a.id from admin_accounts a join users u on u.id=a."userId" where u.email='${email}'`);return {email,password,secret,role,id}}
export const login=(a,off=0)=>call('POST','/admin/auth/login',{body:{email:a.email,password:a.password,totpCode:totp(a.secret,off)}});
export const activeSupers=()=>Number(sql(`select count(*) from admin_accounts where role='SUPER_ADMIN' and status<>'DISABLED'`));
