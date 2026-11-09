/* MMRI-12: concurrent disable/demote between two super admins must never leave zero active SUPER_ADMIN. */
import {provision,login,call,sql,activeSupers} from './qa-wsb-lib.mjs';
const T=Number(process.env.TRIALS||12);
const orig=sql(`select string_agg(id,',') from admin_accounts where role='SUPER_ADMIN' and status<>'DISABLED'`).split(',');
sql(`update admin_accounts set status='DISABLED' where role='SUPER_ADMIN'`); // clone only: isolate the two test supers
const S1=provision('SUPER_ADMIN','s1'),S2=provision('SUPER_ADMIN','s2');
let zero=0;const modes=['disable','role','mixed-a','mixed-b'];
const act=(kind,tok,id)=>kind==='disable'?call('POST',`/admin/admins/${id}/disable`,{tok}):call('POST',`/admin/admins/${id}/role`,{tok,body:{role:'REPORT_REVIEWER'}});
for(let i=0;i<T;i++){
  const m=modes[i%4];
  sql(`update admin_accounts set status='ACTIVE',role='SUPER_ADMIN',"mfaLastStep"=0,"failedLogins"=0,"lockedUntil"=null where id in ('${S1.id}','${S2.id}')`);
  const [l1,l2]=[await login(S1),await login(S2)];
  if(l1.s!==200||l2.s!==200){console.log('login failed',l1.s,l2.s,l1.raw.slice(0,100));process.exit(2)}
  const k1=m==='role'||m==='mixed-a'?'role':'disable', k2=m==='role'||m==='mixed-b'?'role':'disable';
  const [r1,r2]=await Promise.all([act(k1,l1.d.token,S2.id),act(k2,l2.d.token,S1.id)]);
  const n=activeSupers();if(n===0)zero++;
  console.log(`trial ${i} ${m}: S1->S2 ${r1.s}, S2->S1 ${r2.s}, active SUPER_ADMIN remaining=${n}`);
}
sql(`update admin_accounts set status='DISABLED' where id in ('${S1.id}','${S2.id}')`);
for(const id of orig)sql(`update admin_accounts set status='ACTIVE',role='SUPER_ADMIN' where id='${id}'`);
console.log(zero?`FAIL: ${zero}/${T} trials ended with ZERO active super admins`:`PASS: never zero in ${T} trials`);process.exit(zero?1:0);
