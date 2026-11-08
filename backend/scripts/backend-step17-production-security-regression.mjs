import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));const repo=path.resolve(here,'../..');
const sha=(c)=>c.repeat(64);
const base={
  ...process.env,NODE_ENV:'production',DATABASE_URL:'postgresql://mmri_runtime:StrongRuntimePass123@db.internal:5432/mmri?schema=public&sslmode=require',MIGRATION_DATABASE_URL:'postgresql://mmri_migrate:StrongMigratePass456@db.internal:5432/mmri?schema=public&sslmode=require',
  ACCESS_TOKEN_SECRET:'A'.repeat(64),PASSWORD_PEPPER:'B'.repeat(64),AUDIT_HASH_SALT:'C'.repeat(64),METRICS_TOKEN:'D'.repeat(64),ALLOWED_ORIGINS:'https://businessmmri.mn',COOKIE_SECURE:'true',REFRESH_COOKIE_NAME:'__Secure-mmri_refresh',TRUST_PROXY:'true',TRUST_PROXY_HOPS:'1',MMRI_API_REPLICA_COUNT:'1',RELEASE_SHA:'abcdef1234567',INSTANCE_ID:'mmri-api-1',
  MMRI_API_IMAGE:`registry/mmri-api@sha256:${sha('a')}`,MMRI_WEB_IMAGE:`registry/mmri-web@sha256:${sha('b')}`,MMRI_MIGRATE_IMAGE:`registry/mmri-migrate@sha256:${sha('c')}`,
  MMRI_BILLING_PROVIDER:'manual',MMRI_BILLING_ENFORCEMENT:'true',MMRI_DIAGNOSTIC_PRICE_MNT:'300000',MMRI_RETAKE_PRICE_MNT:'300000',MMRI_OPERATOR_USER_IDS:'op_user_0001_immutable',MMRI_MANUAL_PAYMENT_QR_TEXT:'STATIC-QR-TEXT',
  MMRI_AI_REPORT_PROVIDER:'openai',MMRI_AI_REPORT_REQUIRED:'true',MMRI_AI_REPORT_MODEL:'gpt-6.1-sol',MMRI_AI_REPORT_ENDPOINT:'https://api.openai.com/v1/responses',OPENAI_API_KEY:'sk-proj-'+ 'X'.repeat(40),MMRI_REPORT_STORAGE_DIR:'/var/lib/mmri/report-storage'
};
function run(overrides={}){const env={...base,...overrides};const r=spawnSync(process.execPath,['ops/preflight.mjs'],{cwd:repo,env,encoding:'utf8'});let body={};try{body=JSON.parse(r.stdout||'{}')}catch{}return{code:r.status,body,stderr:r.stderr};}
const cases=[];const expect=(name,pass,overrides={})=>{const r=run(overrides);const ok=pass?r.code===0:r.code!==0;cases.push({name,ok,status:r.body.status,errors:r.body.errors??[]});};
expect('valid hardened production config passes',true);
expect('mock payment rejected',false,{MMRI_BILLING_PROVIDER:'mock'});
expect('mock mail provider rejected in production',false,{MMRI_MAIL_PROVIDER:'mock'});
expect('unimplemented mail provider rejected',false,{MMRI_MAIL_PROVIDER:'smtp'});
expect('disabled mail provider is accepted (with a warning that recovery e-mail is not delivered)',true,{MMRI_MAIL_PROVIDER:'disabled'});
expect('operator access by e-mail address is rejected in production (MMRI-01)',false,{MMRI_OPERATOR_EMAILS:'operator@businessmmri.mn'});
expect('manual payment without operator user ids is rejected',false,{MMRI_OPERATOR_USER_IDS:''});
expect('billing enforcement cannot be disabled',false,{MMRI_BILLING_ENFORCEMENT:'false'});
expect('local database rejected',false,{DATABASE_URL:'postgresql://mmri_runtime:pass@127.0.0.1:5432/mmri?sslmode=require'});
expect('database without TLS rejected',false,{DATABASE_URL:'postgresql://mmri_runtime:pass@db.internal:5432/mmri'});
expect('runtime postgres superuser name rejected',false,{DATABASE_URL:'postgresql://postgres:pass@db.internal:5432/mmri?sslmode=require'});
expect('same runtime and migration credential rejected',false,{MIGRATION_DATABASE_URL:base.DATABASE_URL});
expect('localhost production origin rejected',false,{ALLOWED_ORIGINS:'https://localhost'});
expect('insecure cookie rejected',false,{COOKIE_SECURE:'false'});
expect('invalid proxy hops rejected',false,{TRUST_PROXY_HOPS:'0'});
expect('multiple API replicas rejected without shared limiter',false,{MMRI_API_REPLICA_COUNT:'2'});
expect('temporary report storage rejected',false,{MMRI_REPORT_STORAGE_DIR:'/tmp/reports'});
expect('AI disabled rejected for release',false,{MMRI_AI_REPORT_PROVIDER:'disabled'});
expect('OpenAI endpoint must be official',false,{MMRI_AI_REPORT_ENDPOINT:'https://example.com/v1/responses'});
expect('OpenAI placeholder key rejected',false,{OPENAI_API_KEY:'REPLACE_WITH_SERVER_SIDE_SECRET'});
expect('placeholder access secret rejected',false,{ACCESS_TOKEN_SECRET:'REPLACE_WITH_RANDOM_64_PLUS_CHARS________________________________'});
const failed=cases.filter(x=>!x.ok);console.log(JSON.stringify({status:failed.length?'FAIL':'PASS',passed:cases.length-failed.length,total:cases.length,failed,cases},null,2));if(failed.length)process.exit(1);
