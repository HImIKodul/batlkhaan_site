/* Robustness: an undecryptable MFA secret must fail closed with the generic 401 (not 500), be audited, and not reveal which factor failed. */
import {provision,call,totp,sql} from './qa-wsb-lib.mjs';
const a=provision('REPORT_REVIEWER','corrupt');
const good=await call('POST','/admin/auth/login',{body:{email:a.email,password:a.password,totpCode:totp(a.secret,0)}});
sql(`update admin_accounts set "mfaSecretEnc"='v1.AAAA.BBBB.CCCC',"mfaLastStep"=0 where id='${a.id}'`);
const bad=await call('POST','/admin/auth/login',{body:{email:a.email,password:a.password,totpCode:'123456'}});
const wrongPw=await call('POST','/admin/auth/login',{body:{email:a.email,password:'Wrong-password-1A!',totpCode:'123456'}});
sql(`update admin_accounts set "mfaSecretEnc"='garbage' where id='${a.id}'`);
const bad2=await call('POST','/admin/auth/login',{body:{email:a.email,password:a.password,totpCode:'123456'}});
const audited=Number(sql(`select count(*) from admin_audit_events where "adminId"='${a.id}' and action='ADMIN_LOGIN' and outcome='FAILURE'`));
console.log('initial login',good.s,'| corrupt secret',bad.s,bad.e?.code,'| garbage secret',bad2.s,'| wrong password',wrongPw.s,wrongPw.e?.code,'| audited failures',audited);
const ok=good.s===200&&bad.s===401&&bad2.s===401&&bad.raw===wrongPw.raw.replace(wrongPw.raw,bad.raw)&&bad.e?.code===wrongPw.e?.code&&bad.e?.message===wrongPw.e?.message&&audited>=3;
console.log(ok?'PASS':'FAIL');process.exit(ok?0:1);
