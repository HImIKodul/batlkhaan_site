import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const errors=[]; const warnings=[];
const repoRoot=process.cwd();
const migrationDir=path.join(repoRoot,'backend','prisma','migrations');
try{
  const migrationNames=fs.readdirSync(migrationDir,{withFileTypes:true}).filter(x=>x.isDirectory()).map(x=>x.name).sort();
  const h=crypto.createHash('sha256');
  for(const name of migrationNames){const rel=`backend/prisma/migrations/${name}/migration.sql`;const full=path.join(repoRoot,rel);h.update(rel);h.update('\0');h.update(fs.readFileSync(full));h.update('\0');}
  const actual=h.digest('hex');
  const expectedPath=path.join(repoRoot,'deploy','MIGRATION_CHAIN_SHA256.txt');
  const expected=fs.readFileSync(expectedPath,'utf8').trim().split(/\s+/)[0];
  if(actual!==expected)errors.push(`Committed migration chain fingerprint mismatch: expected ${expected}, got ${actual}`);
}catch(error){errors.push(`Migration-chain preflight failed: ${error instanceof Error?error.message:String(error)}`);}

const placeholder=(value)=>/replace|change[-_ ]?me|example|your[-_ ]?|development[-_ ]/i.test(value);
const need=(name)=>{const v=(process.env[name]??'').trim(); if(!v)errors.push(`${name} is required`); return v;};
const secret=(name,min=48)=>{const v=need(name); if(v.length<min)errors.push(`${name} must be at least ${min} characters`); if(placeholder(v))errors.push(`${name} contains a placeholder`); return v;};
const parseUrl=(name,value)=>{try{return new URL(value)}catch{errors.push(`${name} must be a valid URL`);return null;}};
const httpsOrigin=(name,value,{allowPath=false}={})=>{const u=parseUrl(name,value);if(!u)return null;if(u.protocol!=='https:')errors.push(`${name} must use HTTPS`);if(u.username||u.password||u.search||u.hash||(!allowPath&&u.pathname!=='/'))errors.push(`${name} must be a ${allowPath?'safe HTTPS URL':'bare HTTPS origin'}`);if(['localhost','127.0.0.1','::1'].includes(u.hostname))errors.push(`${name} must not use a local hostname`);return u;};
const postgres=(name,{runtime=false}={})=>{const raw=need(name);const u=parseUrl(name,raw);if(!u)return null;if(!['postgres:','postgresql:'].includes(u.protocol))errors.push(`${name} must be PostgreSQL`);if(!u.hostname||['localhost','127.0.0.1','::1'].includes(u.hostname))errors.push(`${name} must not point to a local database`);const ssl=(u.searchParams.get('sslmode')??'').toLowerCase();if(!['require','verify-ca','verify-full'].includes(ssl))errors.push(`${name} must use sslmode=require, verify-ca or verify-full`);const user=decodeURIComponent(u.username||'').toLowerCase();if(!user)errors.push(`${name} must include a database user`);if(!u.password)errors.push(`${name} must include a database password`);if(runtime&&['postgres','root','admin','administrator'].includes(user))errors.push(`${name} must use a least-privilege runtime database user`);if(placeholder(raw))errors.push(`${name} contains a placeholder`);return u;};

const database=postgres('DATABASE_URL',{runtime:true});
const migrationDatabase=postgres('MIGRATION_DATABASE_URL');
if(database&&migrationDatabase&&database.toString()===migrationDatabase.toString())errors.push('DATABASE_URL and MIGRATION_DATABASE_URL must use separate credentials');

const access=secret('ACCESS_TOKEN_SECRET'); const pepper=secret('PASSWORD_PEPPER'); const audit=secret('AUDIT_HASH_SALT'); const metrics=secret('METRICS_TOKEN');
if(new Set([access,pepper,audit,metrics]).size!==4)errors.push('Security secrets must be distinct');
const origins=need('ALLOWED_ORIGINS').split(',').map(x=>x.trim()).filter(Boolean); if(!origins.length)errors.push('ALLOWED_ORIGINS is empty'); origins.forEach(x=>httpsOrigin('ALLOWED_ORIGINS',x));
if((process.env.COOKIE_SECURE??'').toLowerCase()!=='true')errors.push('COOKIE_SECURE=true is required');
const release=need('RELEASE_SHA'); if(release && !/^[A-Za-z0-9._:-]{7,128}$/.test(release))errors.push('RELEASE_SHA format is invalid');
const instance=need('INSTANCE_ID'); if(instance&&placeholder(instance))errors.push('INSTANCE_ID contains a placeholder');
if((process.env.TRUST_PROXY??'').toLowerCase()!=='true')errors.push('TRUST_PROXY=true is required for the production same-origin proxy topology');
const proxyHops=Number(process.env.TRUST_PROXY_HOPS??'1');if(!Number.isSafeInteger(proxyHops)||proxyHops<1||proxyHops>8)errors.push('TRUST_PROXY_HOPS must be an integer from 1 to 8');
const replicas=Number(process.env.MMRI_API_REPLICA_COUNT??'1');if(!Number.isSafeInteger(replicas)||replicas!==1)errors.push('MMRI_API_REPLICA_COUNT must be 1 until a shared distributed rate limiter is configured');
const shutdownDrain=Number(process.env.SHUTDOWN_DRAIN_MS??'5000');if(!Number.isSafeInteger(shutdownDrain)||shutdownDrain<0||shutdownDrain>30000)errors.push('SHUTDOWN_DRAIN_MS must be an integer from 0 to 30000');
const shutdownForce=Number(process.env.SHUTDOWN_FORCE_TIMEOUT_MS??'45000');if(!Number.isSafeInteger(shutdownForce)||shutdownForce<30000||shutdownForce>120000||shutdownForce<=shutdownDrain)errors.push('SHUTDOWN_FORCE_TIMEOUT_MS must be 30000..120000 and greater than SHUTDOWN_DRAIN_MS');
for(const name of ['MMRI_API_IMAGE','MMRI_WEB_IMAGE','MMRI_MIGRATE_IMAGE']){const ref=need(name); if(ref && !/@sha256:[a-f0-9]{64}$/i.test(ref))errors.push(`${name} must end with an immutable @sha256:<64-hex> digest`);}

const mailProvider=(process.env.MMRI_MAIL_PROVIDER??'disabled').trim().toLowerCase();
if(mailProvider==='mock')errors.push('MMRI_MAIL_PROVIDER=mock is forbidden in production');
else if(mailProvider!=='disabled')errors.push('MMRI_MAIL_PROVIDER must be disabled: no real mail provider is implemented yet');
else warnings.push('Password recovery e-mail is NOT delivered (MMRI_MAIL_PROVIDER=disabled). Implement and test a real mail provider before launch.');
if(!/^https:\/\//.test((process.env.MMRI_PUBLIC_APP_URL??'').trim()))warnings.push('MMRI_PUBLIC_APP_URL should be the public https URL used in password reset links (falls back to the first ALLOWED_ORIGINS entry)');
const billingProvider=(process.env.MMRI_BILLING_PROVIDER??'').trim().toLowerCase();
if(!['qpay','manual'].includes(billingProvider))errors.push('MMRI_BILLING_PROVIDER must be qpay or manual in production; mock is forbidden');
if((process.env.MMRI_BILLING_ENFORCEMENT??'').toLowerCase()!=='true')errors.push('MMRI_BILLING_ENFORCEMENT=true is required in production');
for(const name of ['MMRI_DIAGNOSTIC_PRICE_MNT','MMRI_RETAKE_PRICE_MNT']){const v=need(name); if(v&&!/^[1-9][0-9]*$/.test(v))errors.push(`${name} must be a positive whole-number MNT amount`);}
if(billingProvider==='qpay'){
  for(const name of ['QPAY_CLIENT_ID','QPAY_CLIENT_SECRET','QPAY_INVOICE_CODE']){const v=need(name); if(v&&placeholder(v))errors.push(`${name} contains a placeholder`);}
  const qpay=httpsOrigin('QPAY_BASE_URL',need('QPAY_BASE_URL')); if(qpay&&qpay.hostname.toLowerCase().includes('sandbox'))errors.push('QPAY_BASE_URL must not use sandbox in production');
  httpsOrigin('MMRI_BILLING_CALLBACK_BASE_URL',need('MMRI_BILLING_CALLBACK_BASE_URL'));
}
if((process.env.MMRI_OPERATOR_EMAILS??'').trim())errors.push('MMRI_OPERATOR_EMAILS is not honoured in production (e-mail ownership is not verified); use MMRI_OPERATOR_USER_IDS');
if(billingProvider==='manual'){
  if(!need('MMRI_OPERATOR_USER_IDS'))errors.push('MMRI_OPERATOR_USER_IDS is required for manual payment mode');
  if(![(process.env.MMRI_MANUAL_PAYMENT_QR_TEXT??'').trim(),(process.env.MMRI_MANUAL_PAYMENT_QR_IMAGE??'').trim(),(process.env.MMRI_MANUAL_PAYMENT_SHORT_URL??'').trim()].some(Boolean))errors.push('Manual payment mode requires at least one QR field');
}

const aiProvider=(process.env.MMRI_AI_REPORT_PROVIDER??'').trim().toLowerCase();
if(aiProvider!=='openai')errors.push('MMRI_AI_REPORT_PROVIDER=openai is required for this production release');
if((process.env.MMRI_AI_REPORT_REQUIRED??'').toLowerCase()!=='true')errors.push('MMRI_AI_REPORT_REQUIRED=true is required for this production release');
const aiModel=need('MMRI_AI_REPORT_MODEL');if(aiModel&&placeholder(aiModel))errors.push('MMRI_AI_REPORT_MODEL contains a placeholder');
const aiEndpoint=httpsOrigin('MMRI_AI_REPORT_ENDPOINT',need('MMRI_AI_REPORT_ENDPOINT'),{allowPath:true});if(aiEndpoint&&(aiEndpoint.hostname!=='api.openai.com'||aiEndpoint.pathname.replace(/\/+$/,'')!=='/v1/responses'))errors.push('MMRI_AI_REPORT_ENDPOINT must be https://api.openai.com/v1/responses');
secret('OPENAI_API_KEY',20);

const storage=need('MMRI_REPORT_STORAGE_DIR');if(storage){if(!path.isAbsolute(storage))errors.push('MMRI_REPORT_STORAGE_DIR must be absolute');const r=path.resolve(storage);if(r==='/'||r==='/tmp'||r.startsWith('/tmp/')||r==='/var/tmp'||r.startsWith('/var/tmp/'))errors.push('MMRI_REPORT_STORAGE_DIR must use durable non-temporary storage');}

if(!fs.existsSync('backend/package-lock.json'))errors.push('backend/package-lock.json is required for a reproducible production release');
if(!fs.existsSync('frontend/package-lock.json'))errors.push('frontend/package-lock.json is required for a reproducible production release');
for(const file of ['frontend/.env.production','frontend/.env.example']){
  if(!fs.existsSync(file))continue;const text=fs.readFileSync(file,'utf8');
  if(/OPENAI_API_KEY|QPAY_CLIENT_SECRET|DATABASE_URL|ACCESS_TOKEN_SECRET|PASSWORD_PEPPER|AUDIT_HASH_SALT|METRICS_TOKEN/i.test(text))errors.push(`${file} must not contain backend secret variable names`);
  if(/sk-(?:svcacct-)?[A-Za-z0-9_-]{20,}/.test(text))errors.push(`${file} contains an OpenAI-like secret token`);
}
const result={status:errors.length?'FAIL':'PASS',errors,warnings,releaseSha:release||null}; console.log(JSON.stringify(result,null,2)); if(errors.length)process.exit(1);
