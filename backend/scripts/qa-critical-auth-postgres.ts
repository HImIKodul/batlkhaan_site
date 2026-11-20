/** Real PostgreSQL contract regression, bounded to three concurrent operations.
 * Refuses every target except the existing isolated release database. No company is created or deleted.
 * Provider delivery is captured in memory; this does not verify Resend inbox delivery.
 * DATABASE_URL=<isolated URL> MMRI_CRITICAL_DB_TESTS=YES node --import tsx scripts/qa-critical-auth-postgres.ts
 */
import {randomBytes,randomUUID} from 'node:crypto';
import {prisma} from '../src/db.js';
import {AuthService} from '../src/api/auth/auth-service.js';
import {PasswordResetService} from '../src/api/auth/password-reset-service.js';
import {EmailVerificationService,EMAIL_CODE_PURPOSE} from '../src/api/auth/email-verification-service.js';
import {hashAuditValue} from '../src/api/auth/crypto.js';
import {authenticate} from '../src/api/auth/access.js';
const target=new URL(process.env.DATABASE_URL??'postgresql://invalid/invalid');
if(process.env.MMRI_CRITICAL_DB_TESTS!=='YES'||target.pathname!=='/mmri_codexfix_release_20261110'||!['127.0.0.1','localhost'].includes(target.hostname)||target.port!=='55432')throw new Error('Refusing: explicit isolated release database and MMRI_CRITICAL_DB_TESTS=YES required');
const config:any={environment:'development',auditSalt:randomUUID(),passwordPepper:randomUUID(),accessTokenSecret:randomBytes(48).toString('base64url'),issuer:'critical-test',audience:'critical-test',passwordResetTtlMinutes:30,publicAppUrl:'https://example.invalid',refreshTokenTtlSeconds:3600,accessTokenTtlSeconds:900};
const messages:any[]=[];
const mailer:any={provider:'mock',send:async(m:any)=>{messages.push(m);return{delivered:true,provider:'mock'}}};
const auth=new AuthService(config),verify=new EmailVerificationService(config,mailer),reset=new PasswordResetService(config,mailer);
const email=`critical.${randomUUID()}@example.invalid`,initialPassword='Registration-'+randomUUID(),ownerPassword=initialPassword,recoveredPassword='Recovered-'+randomUUID();
const fp={ip:'acceptance-auth-'+randomUUID(),userAgent:'BusinessMRI-local-acceptance'};
let uid:string|undefined;let adminId:string|undefined;let failures=0;
const results:any[]=[];
function check(name:string,ok:boolean){results.push({name,status:ok?'PASS':'FAIL'});if(!ok)failures++}
const denied=async(f:()=>Promise<any>,code?:string)=>{try{await f();return false}catch(e:any){return code?e.code===code:e.status===401}};
const latestToken=(kind:string)=>messages.filter(m=>m.kind===kind).at(-1)?.text.match(/token=([A-Za-z0-9_-]{43})/)?.[1];
const latestCode=()=>messages.filter(m=>m.kind==='EMAIL_VERIFICATION').at(-1)?.text.match(/\n(\d{6})\n/)?.[1];
try{
 const before=await prisma.company.count();
 check('registration returns no session',(await auth.register({email,password:initialPassword},fp)).accepted===true);
 uid=(await prisma.user.findUniqueOrThrow({where:{email}})).id;
 check('pending ownership cannot login',await denied(()=>auth.login({email,password:initialPassword},fp)));
 await Promise.all(Array.from({length:3},()=>verify.requestCode(email,fp)));
 check('concurrent verification requests send exactly one message',messages.filter(m=>m.kind==='EMAIL_VERIFICATION').length===1);
 const vc=latestCode();
 const row=await prisma.passwordResetToken.findFirstOrThrow({where:{userId:uid,purpose:EMAIL_CODE_PURPOSE}});
 check('verification code is 6 digits, stored only as a user-bound hash, and expires',/^\d{6}$/.test(vc||'')&&row.tokenHash===verify.hashCode(uid,vc!)&&!row.tokenHash.includes(vc!)&&row.expiresAt>new Date());
 check('verification mail has no link and no token',!/https?:|token=|reset-password/i.test(messages.find(m=>m.kind==='EMAIL_VERIFICATION').text));
 check('a verification code cannot reset a password',await denied(()=>reset.confirmReset(vc,'Another-'+randomUUID(),fp),'INVALID_RESET_TOKEN'));
 const wrong=vc==='000000'?'111111':'000000';
 check('wrong code rejected',await denied(()=>verify.verifyCode(email,wrong,fp),'INVALID_VERIFICATION_CODE'));
 check('still unverified after a wrong code',await denied(()=>auth.login({email,password:initialPassword},fp)));
 await verify.verifyCode(email,vc,fp);
 check('verification replay rejected',await denied(()=>verify.verifyCode(email,vc,fp),'INVALID_VERIFICATION_CODE'));
 const login=await auth.login({email,password:ownerPassword},fp);
 check('verified account signs in',!!login.accessToken&&!!login.refreshToken);
 // Synthetic admin session proves that ordinary recovery revokes both session systems.
 adminId=(await prisma.adminAccount.create({data:{userId:uid,role:'REPORT_REVIEWER',status:'ACTIVE'}})).id;
 await prisma.adminSession.create({data:{adminId,tokenHash:randomUUID(),expiresAt:new Date(Date.now()+60000),absoluteExpiresAt:new Date(Date.now()+60000)}});
 await reset.requestReset(email,fp);const rt=latestToken('PASSWORD_RESET');
 const confirmations=await Promise.allSettled(Array.from({length:3},()=>reset.confirmReset(rt,recoveredPassword,fp)));
 check('parallel one-time recovery has exactly one winner',confirmations.filter(r=>r.status==='fulfilled').length===1&&confirmations.filter(r=>r.status==='rejected').every((r:any)=>r.reason.code==='INVALID_RESET_TOKEN'));
 check('pre-reset access token is invalid',await denied(()=>authenticate('Bearer '+login.accessToken,config)));
 check('pre-reset refresh token is invalid',await denied(()=>auth.refresh(login.refreshToken,fp)));
 check('pre-reset administrator sessions revoked',await prisma.adminSession.count({where:{adminId,revokedAt:null}})===0);
 check('recovered password signs in',!!(await auth.login({email,password:recoveredPassword},fp)).accessToken);
 // Age only this fixture's token creation times to simulate elapsed resend cooldowns.
 for(let n=1;n<3;n++){
  await prisma.passwordResetToken.updateMany({where:{userId:uid,purpose:'PASSWORD_RESET'},data:{createdAt:new Date(Date.now()-61_000)}});
  await reset.requestReset(email,fp);
 }
 await prisma.passwordResetToken.updateMany({where:{userId:uid,purpose:'PASSWORD_RESET'},data:{createdAt:new Date(Date.now()-61_000)}});
 await Promise.all(Array.from({length:3},()=>reset.requestReset(email,fp)));
 check('durable hourly cap holds under parallel requests',await prisma.passwordResetToken.count({where:{userId:uid,purpose:'PASSWORD_RESET'}})===3);
 const newest=latestToken('PASSWORD_RESET');
 check('superseded reset token rejected',await denied(()=>reset.confirmReset(rt,initialPassword,fp),'INVALID_RESET_TOKEN'));
 await prisma.passwordResetToken.updateMany({where:{userId:uid,purpose:'PASSWORD_RESET',usedAt:null},data:{expiresAt:new Date(0)}});
 check('expired recovery token rejected',await denied(()=>reset.confirmReset(newest,initialPassword,fp),'INVALID_RESET_TOKEN'));
 const count=messages.length;await reset.requestReset('unknown.'+randomUUID()+'@example.invalid',fp);
 check('unknown email receives no message',messages.length===count);
 check('successful reset has an audit event',await prisma.authAuditEvent.count({where:{userId:uid,eventType:'PASSWORD_RESET_COMPLETED'}})===1);
 check('existing company count unchanged',await prisma.company.count()===before);
}finally{
 // Only records created by this invocation are eligible for cleanup.
 if(uid){await prisma.authAuditEvent.deleteMany({where:{OR:[{userId:uid},{ipHash:hashAuditValue(fp.ip,config.auditSalt)}]}});if(adminId)await prisma.adminAccount.delete({where:{id:adminId}});await prisma.user.delete({where:{id:uid}})}
 await prisma.$disconnect();
}
console.log(JSON.stringify({suite:'critical-auth-real-postgres',status:failures?'FAIL':'PASS',results},null,2));if(failures)process.exitCode=1;
