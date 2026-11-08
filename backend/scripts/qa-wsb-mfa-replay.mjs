/* MMRI-18: concurrent reuse of one TOTP step must succeed at most once (login and reauth). */
import {provision,login,call,totp,sql} from './qa-wsb-lib.mjs';
let bad=0;const T=Number(process.env.TRIALS||5);
for(let i=0;i<T;i++){
  const a=provision('REPORT_REVIEWER','replay'+i);
  const body={email:a.email,password:a.password,totpCode:totp(a.secret,0)};
  const rs=await Promise.all([1,2,3].map(()=>call('POST','/admin/auth/login',{body})));
  const ok=rs.filter(r=>r.s===200).length;
  // reauth: log in with previous step, then fire parallel reauths with the current step
  sql(`update admin_accounts set "mfaLastStep"=0 where id='${a.id}'`);
  const l=await login(a,-1);let rok=-1;
  if(l.s===200){const rb={password:a.password,totpCode:totp(a.secret,0)};
    const rr=await Promise.all([1,2,3].map(()=>call('POST','/admin/auth/reauth',{tok:l.d.token,body:rb})));rok=rr.filter(r=>r.s<300).length;}
  console.log(`trial ${i}: parallel logins succeeded=${ok} (want 1); parallel reauths succeeded=${rok} (want 1)`);
  if(ok!==1||rok!==1)bad++;
}
console.log(bad?`FAIL: ${bad}/${T} trials allowed TOTP replay`:`PASS: no TOTP replay in ${T} trials`);process.exit(bad?1:0);
