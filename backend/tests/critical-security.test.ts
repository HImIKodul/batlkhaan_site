import {createHash} from 'node:crypto';
import {beforeEach,describe,it,expect,vi} from 'vitest';
const db=vi.hoisted(()=>{
 const model=()=>Object.fromEntries(['findUnique','findFirst','create','update','updateMany','count','upsert','deleteMany'].map(k=>[k,vi.fn()]));
 return {user:model(),passwordResetToken:model(),authAuditEvent:model(),refreshSession:model(),trustedDevice:model(),adminAccount:model(),adminSession:model(),adminAuditEvent:model(),billingInvoice:model(),billingPaymentTransaction:model(),companyEntitlement:model(),$queryRaw:vi.fn(),$executeRaw:vi.fn(),$transaction:vi.fn()};
});
vi.mock('../src/db.js',()=>({prisma:db}));
import {PasswordResetService} from '../src/api/auth/password-reset-service.js';
import {EmailVerificationService,EMAIL_CODE_PURPOSE} from '../src/api/auth/email-verification-service.js';
import {AuthService} from '../src/api/auth/auth-service.js';
import {hashPassword,verifyPassword} from '../src/api/auth/crypto.js';
import {AdminService,ROLE_PERMISSIONS} from '../src/api/admin/admin-service.js';
import {DataLifecycleService} from '../src/api/account/data-lifecycle-service.js';
import {registerAccountRoutes} from '../src/api/admin/account-routes.js';
import {registerAdminRoutes} from '../src/api/admin/admin-routes.js';
import {Router} from '../src/api/http/router.js';
import {base32Decode,hotp,totpStep,encryptSecret} from '../src/api/admin/totp.js';
import {BillingService} from '../src/billing/billing-service.js';
const config:any={issuer:'critical-tests',audience:'critical-tests',adminSessionIdleMinutes:15,auditSalt:'synthetic-audit-salt',passwordPepper:'synthetic-pepper',accessTokenSecret:'synthetic-secret',passwordResetTtlMinutes:30,publicAppUrl:'https://example.invalid',refreshTokenTtlSeconds:3600,accessTokenTtlSeconds:900,billingProvider:'mock',environment:'development'};
const user:any={id:'u1',email:'owner@example.invalid',status:'ACTIVE',tokenVersion:1,emailVerificationRequired:false,emailVerifiedAt:null,erasedAt:null};
const mailer:any={provider:'resend',send:vi.fn()};
const token='A'.repeat(43);
let reset:PasswordResetService;
beforeEach(()=>{
 vi.resetAllMocks();
 db.$transaction.mockImplementation(async f=>typeof f==='function'?f(db):Promise.all(f));
 db.user.findUnique.mockResolvedValue({...user});
 db.authAuditEvent.create.mockResolvedValue({});db.adminAuditEvent.create.mockResolvedValue({});
 db.passwordResetToken.count.mockResolvedValue(0);db.passwordResetToken.findFirst.mockResolvedValue(null);
 db.passwordResetToken.create.mockResolvedValue({id:'tok1'});db.passwordResetToken.deleteMany.mockResolvedValue({count:1});db.passwordResetToken.updateMany.mockResolvedValue({count:1});
 db.user.update.mockResolvedValue({...user});db.refreshSession.updateMany.mockResolvedValue({count:1});db.adminAccount.findUnique.mockResolvedValue(null);
 mailer.send.mockResolvedValue({delivered:true,provider:'resend'});
 reset=new PasswordResetService(config,mailer);
});
function row(overrides:any={}){return {id:'t1',userId:user.id,purpose:'PASSWORD_RESET',usedAt:null,expiresAt:new Date(Date.now()+60000),user:{...user},...overrides}}
describe('verification and recovery service contracts (mock database)',()=>{
 it('stores only a purpose-bound hash, a 30 minute expiry and sends a one-time fragment link',async()=>{
  await reset.requestReset(user.email,{});const data=db.passwordResetToken.create.mock.calls[0][0].data;
  const message=mailer.send.mock.calls[0][0];const raw=message.text.match(/token=([A-Za-z0-9_-]{43})/)[1];
  expect(data.tokenHash).toBe(reset.hashToken(raw));expect(data.tokenHash).not.toContain(raw);expect(data.purpose).toBe('PASSWORD_RESET');
  expect(data.expiresAt.getTime()-Date.now()).toBeGreaterThan(1799000);expect(message.subject).toContain('BusinessMRI.mn');
 });
 it.each([null,{...user,status:'DISABLED'},{...user,erasedAt:new Date()},{...user,emailVerificationRequired:true}])('does not mail ineligible accounts %#',async u=>{
  db.user.findUnique.mockResolvedValue(u);await expect(reset.requestReset(user.email,{})).resolves.toBeUndefined();expect(mailer.send).not.toHaveBeenCalled();
 });
 it.each(['hour','cooldown'])('enforces %s resend limit inside the locked transaction',async mode=>{
  if(mode==='hour')db.passwordResetToken.count.mockResolvedValue(3);else db.passwordResetToken.findFirst.mockResolvedValue({createdAt:new Date()});
  await reset.requestReset(user.email,{});expect(db.$queryRaw).toHaveBeenCalled();expect(mailer.send).not.toHaveBeenCalled();expect(db.passwordResetToken.create).not.toHaveBeenCalled();
 });
 it('a concurrent email change cannot send a new token to the old mailbox',async()=>{db.user.findUnique.mockResolvedValueOnce({...user}).mockResolvedValue({...user,email:'new@example.invalid',emailVerificationRequired:true});await reset.requestReset(user.email,{});expect(mailer.send).not.toHaveBeenCalled();expect(db.passwordResetToken.create).not.toHaveBeenCalled()});
 it('invalidates older tokens only in the same purpose',async()=>{await reset.requestReset(user.email,{});expect(db.passwordResetToken.updateMany.mock.calls[0][0].where).toMatchObject({purpose:'PASSWORD_RESET',usedAt:null})});
 it.each([null,row({usedAt:new Date()}),row({expiresAt:new Date(0)}),row({purpose:'EMAIL_VERIFICATION'}),row({user:{...user,status:'DISABLED'}})])('rejects invalid, expired, consumed or cross-purpose tokens %#',async r=>{
  db.passwordResetToken.findUnique.mockResolvedValue(r);await expect(reset.confirmReset(token,'NewPassword123!',{})).rejects.toMatchObject({code:'INVALID_RESET_TOKEN'});expect(db.user.update).not.toHaveBeenCalled();
 });
 it('rejects weak passwords before claiming tokens',async()=>{await expect(reset.confirmReset(token,'short',{})).rejects.toMatchObject({code:'WEAK_PASSWORD'});expect(db.passwordResetToken.updateMany).not.toHaveBeenCalled()});
 it('a lost one-time claim cannot change credentials',async()=>{db.passwordResetToken.findUnique.mockResolvedValue(row());db.passwordResetToken.updateMany.mockResolvedValue({count:0});await expect(reset.confirmReset(token,'NewPassword123!',{})).rejects.toMatchObject({code:'INVALID_RESET_TOKEN'});expect(db.user.update).not.toHaveBeenCalled()});
 it('reset changes password, bumps token version, revokes customer and admin sessions',async()=>{
  db.passwordResetToken.findUnique.mockResolvedValue(row());db.adminAccount.findUnique.mockResolvedValue({id:'admin1'});
  await reset.confirmReset(token,'NewPassword123!',{});const change=db.user.update.mock.calls[0][0].data;
  expect(await verifyPassword('NewPassword123!',change.passwordHash,config.passwordPepper)).toBe(true);expect(change.tokenVersion).toEqual({increment:1});
  expect(db.refreshSession.updateMany).toHaveBeenCalled();expect(db.adminSession.updateMany).toHaveBeenCalled();expect(mailer.send.mock.calls[0][0].kind).toBe('PASSWORD_CHANGED');
 });
 it('rechecks erased/disabled user under the token claim lock',async()=>{
  db.passwordResetToken.findUnique.mockResolvedValue(row());db.user.findUnique.mockResolvedValue({...user,status:'DISABLED'});
  await expect(reset.confirmReset(token,'NewPassword123!',{})).rejects.toMatchObject({code:'INVALID_RESET_TOKEN'});expect(db.user.update).not.toHaveBeenCalled();
 });
 it('registration duplicates do not reveal existence or create sessions',async()=>{
  const auth=new AuthService(config);await expect(auth.register({email:user.email,password:'Registration123!'},{})).resolves.toEqual({accepted:true});expect(db.refreshSession.create).not.toHaveBeenCalled();expect(db.user.create).not.toHaveBeenCalled();
 });
 it('new public registrations explicitly require verification',async()=>{
  db.user.findUnique.mockResolvedValue(null);db.user.create.mockResolvedValue(user);await new AuthService(config).register({email:user.email,password:'Registration123!'},{});
  expect(db.user.create.mock.calls[0][0].data.emailVerificationRequired).toBe(true);expect(db.refreshSession.create).not.toHaveBeenCalled();
 });
 it('pending accounts get the same login denial as invalid credentials',async()=>{
  const passwordHash=await hashPassword('Registration123!',config.passwordPepper);db.user.findUnique.mockResolvedValue({...user,passwordHash,emailVerificationRequired:true});
  await expect(new AuthService(config).login({email:user.email,password:'Registration123!'},{})).rejects.toMatchObject({status:401});expect(db.refreshSession.create).not.toHaveBeenCalled();
 });
});
const payment=(id:string,amountMnt:number)=>({id,amountMnt});
function billingFixture(overrides:any={}){
 const invoice={id:'i1',companyId:'c1',domainCode:'marketing',status:'PENDING',provider:'QPAY',amountMnt:300000,...overrides};
 db.billingInvoice.findUnique.mockResolvedValue(invoice);db.billingInvoice.findFirst.mockResolvedValue(null);db.billingInvoice.updateMany.mockResolvedValue({count:1});db.billingPaymentTransaction.findUnique.mockResolvedValue(null);db.billingPaymentTransaction.create.mockResolvedValue({});db.companyEntitlement.upsert.mockResolvedValue({});
 const svc=new BillingService(config);return {invoice,activate:(transactions:any[],extra:any={})=>(svc as any).activatePaidInvoice('i1',{paid:true,paidAmountMnt:300000,paymentId:'set1',transactions,raw:{},...extra})};
}
describe('payment activation contracts (mock transaction, PostgreSQL race tests separate)',()=>{
 it('claims every constituent before granting exactly one entitlement',async()=>{
  const {activate}=billingFixture();await activate([payment('a',100000),payment('b',200000)]);expect(db.billingPaymentTransaction.create).toHaveBeenCalledTimes(2);expect(db.companyEntitlement.upsert).toHaveBeenCalledTimes(1);
 });
 it('rejects overlapping payment sets on any constituent',async()=>{
  const {activate}=billingFixture();db.billingPaymentTransaction.findUnique.mockResolvedValue({invoiceId:'other-invoice'});await expect(activate([payment('b',300000)])).rejects.toMatchObject({code:'PAYMENT_ALREADY_USED'});expect(db.companyEntitlement.upsert).not.toHaveBeenCalled();
 });
 it.each([[],[payment('a',150000),payment('a',150000)],[payment('a',299999)],[payment('a',-1)]].map(payments=>({payments})))('rejects missing, duplicated or inconsistent transaction evidence %#',async ({payments})=>{
  const {activate}=billingFixture();await expect(activate(payments)).rejects.toMatchObject({status:502});expect(db.companyEntitlement.upsert).not.toHaveBeenCalled();
 });
 it('refuses new activation while historical combined sets are unresolved',async()=>{
  const {activate}=billingFixture();db.billingInvoice.findFirst.mockResolvedValue({id:'legacy'});await expect(activate([payment('a',300000)])).rejects.toMatchObject({code:'PAYMENT_LEDGER_RECONCILIATION_REQUIRED'});expect(db.companyEntitlement.upsert).not.toHaveBeenCalled();
 });
 it.each(['PAID','REFUNDED'])('reconciliation of %s cannot regrant entitlement',async status=>{
  const {activate}=billingFixture({status,providerPaymentId:'set1'});await activate([payment('a',300000)]);expect(db.companyEntitlement.upsert).not.toHaveBeenCalled();expect(db.billingInvoice.updateMany).not.toHaveBeenCalled();
 });
 it('rejects changed settled reference',async()=>{const {activate}=billingFixture({status:'PAID',providerPaymentId:'original'});await expect(activate([payment('a',300000)])).rejects.toMatchObject({code:'PAYMENT_REFERENCE_CHANGED'})});
 it('partial totals never grant rights',async()=>{const {activate}=billingFixture();await expect(activate([payment('a',1)],{paidAmountMnt:1})).rejects.toMatchObject({code:'PARTIAL_PAYMENT'});expect(db.companyEntitlement.upsert).not.toHaveBeenCalled()});
});
describe('administrator authorization and session contracts',()=>{
 const admin=new AdminService(config);
 const principal:any={adminId:'ad1',permissions:ROLE_PERMISSIONS.SUPER_ADMIN,reauthAt:new Date()};
 it('SUPER_ADMIN includes every defined reviewer permission',()=>{for(const role of ['REPORT_REVIEWER','BILLING_REVIEWER'] as const)for(const p of ROLE_PERMISSIONS[role])expect(ROLE_PERMISSIONS.SUPER_ADMIN).toContain(p)});
 it('reviewers cannot manage accounts or administrators',async()=>{for(const role of ['REPORT_REVIEWER','BILLING_REVIEWER'] as const)for(const p of ['accounts.manage','admins.manage'] as const)await expect(admin.requirePermission({...principal,permissions:ROLE_PERMISSIONS[role]},p,{})).rejects.toMatchObject({status:403})});
 it('sensitive actions require fresh reauthentication and audit denial',async()=>{
  await expect(admin.requirePermission({...principal,reauthAt:new Date(0)},'admins.manage',{}, {sensitive:true})).rejects.toMatchObject({code:'ADMIN_REAUTH_REQUIRED'});expect(db.adminAuditEvent.create).toHaveBeenCalled();
 });
 it.each(['missing','revoked','idle','absolute','disabled'])('rejects %s administrator session',async mode=>{
  const s:any={id:'s1',revokedAt:null,expiresAt:new Date(Date.now()+60000),absoluteExpiresAt:new Date(Date.now()+60000),lastSeenAt:new Date(),admin:{id:'a1',userId:'u1',status:'ACTIVE',role:'SUPER_ADMIN'}};
  if(mode==='revoked')s.revokedAt=new Date();if(mode==='idle')s.expiresAt=new Date(0);if(mode==='absolute')s.absoluteExpiresAt=new Date(0);if(mode==='disabled')s.admin.status='DISABLED';
  db.adminSession.findUnique.mockResolvedValue(mode==='missing'?null:s);await expect(admin.authenticate('Bearer adm_'+'A'.repeat(43))).rejects.toMatchObject({status:401});
 });
 it('audit metadata excludes passwords, tokens, MFA codes and report text',async()=>{
  await admin.audit('ad1','TEST','SUCCESS',{},undefined,{password:'never',token:'never',totpCode:'never',text:'never',role:'SUPER_ADMIN'});
  expect(db.adminAuditEvent.create.mock.calls[0][0].data.metadata).toEqual({role:'SUPER_ADMIN'});
 });
 it('audit write failures are surfaced',async()=>{db.adminAuditEvent.create.mockRejectedValue(new Error('storage unavailable'));await expect(admin.audit(null,'TEST','FAILURE',{})).rejects.toThrow('storage unavailable')});
 it('a pending MFA admin cannot count as the remaining active super administrator',async()=>{
  db.adminAccount.findUnique.mockResolvedValue({id:'a1',status:'ACTIVE',role:'SUPER_ADMIN'});db.adminAccount.count.mockResolvedValue(0);
  await expect(admin.disableAdmin('a1')).rejects.toMatchObject({code:'LAST_SUPER'});expect(db.adminAccount.count.mock.calls[0][0].where.status).toBe('ACTIVE');expect(db.adminSession.updateMany).not.toHaveBeenCalled();
 });
});

describe('reset versus session issuance races (mock transaction)',()=>{
 it('a password changed during login cannot issue a new session',async()=>{
  const passwordHash=await hashPassword('BeforeReset123!',config.passwordPepper);
  db.user.findUnique.mockResolvedValueOnce({...user,passwordHash}).mockResolvedValue({...user,passwordHash:'changed',tokenVersion:2});
  await expect(new AuthService(config).login({email:user.email,password:'BeforeReset123!'},{})).rejects.toMatchObject({status:401});expect(db.refreshSession.create).not.toHaveBeenCalled();
 });
 it.each([false,true])('reset invalidates a concurrent refresh including rotated grace=%s',async grace=>{
  db.refreshSession.findUnique.mockResolvedValue({id:'rs1',userId:'u1',familyId:'f1',user:{...user},expiresAt:new Date(Date.now()+60000),revokedAt:grace?new Date():null,rotatedAt:grace?new Date():null});
  db.user.findUnique.mockResolvedValue({...user,tokenVersion:2});
  await expect(new AuthService(config).refresh('synthetic-refresh',{})).rejects.toMatchObject({status:401});expect(db.refreshSession.create).not.toHaveBeenCalled();
 });
 it('logout takes the same user lock before revoking its whole family',async()=>{
  db.refreshSession.findUnique.mockResolvedValue({userId:'u1',familyId:'f1'});await new AuthService(config).logout('synthetic-refresh',{});
  expect(db.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(db.refreshSession.updateMany.mock.invocationCallOrder[0]);expect(db.refreshSession.updateMany.mock.calls[0][0].where.familyId).toBe('f1');
 });
});
async function adminFixture(){
 const password='SyntheticAdminPassword123!',secret='JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
 const account={id:'ad1',userId:'u1',role:'SUPER_ADMIN',status:'ACTIVE',failedLogins:0,lockedUntil:null,mfaLastStep:BigInt(totpStep()-2),mfaSecretEnc:encryptSecret(secret,config.accessTokenSecret+':admin-mfa')};
 const person={...user,passwordHash:await hashPassword(password,config.passwordPepper)};
 db.user.findUnique.mockResolvedValue(person);db.adminAccount.findUnique.mockResolvedValue(account);db.adminAccount.update.mockResolvedValue({failedLogins:1});db.adminAccount.updateMany.mockResolvedValue({count:1});
 const session={id:'as1',expiresAt:new Date(Date.now()+60000),absoluteExpiresAt:new Date(Date.now()+60000),revokedAt:null};db.adminSession.create.mockResolvedValue(session);db.adminSession.findUnique.mockResolvedValue(session);
 return {account,person,password,code:hotp(base32Decode(secret),totpStep()),service:new AdminService(config)};
}
describe('administrator credential and MFA session boundaries',()=>{
 it('valid password plus TOTP produces only a hashed opaque session in storage',async()=>{
  const {service,password,code}=await adminFixture();const r=await service.login({email:user.email,password,totpCode:code},{});
  expect(r.token).toMatch(/^adm_[A-Za-z0-9_-]{43}$/);const stored=db.adminSession.create.mock.calls[0][0].data.tokenHash;expect(stored).toMatch(/^[a-f0-9]{64}$/);expect(stored).not.toContain(r.token);expect(db.adminSession.create.mock.calls[0][0].data.expiresAt.getTime()-Date.now()).toBeGreaterThan(899000);expect(db.adminSession.create.mock.calls[0][0].data.absoluteExpiresAt.getTime()-Date.now()).toBeGreaterThan(28799000);expect(db.adminAccount.updateMany.mock.calls[0][0].where.mfaLastStep.lt).toBeTypeOf('bigint');
 });
 it.each(['disabled-user','erased-user','disabled-admin','missing-mfa','tampered-secret'])('fails closed on %s',async mode=>{
  const {service,password,code,person,account}=await adminFixture();
  if(mode==='disabled-user')db.user.findUnique.mockResolvedValue({...person,status:'DISABLED'});if(mode==='erased-user')db.user.findUnique.mockResolvedValue({...person,erasedAt:new Date()});if(mode==='disabled-admin')db.adminAccount.findUnique.mockResolvedValue({...account,status:'DISABLED'});if(mode==='tampered-secret')db.adminAccount.findUnique.mockResolvedValue({...account,mfaSecretEnc:'v1.invalid.invalid.invalid'});
  await expect(service.login({email:user.email,password,totpCode:mode==='missing-mfa'?'':code},{})).rejects.toMatchObject({code:'ADMIN_LOGIN_FAILED'});expect(db.adminSession.create).not.toHaveBeenCalled();
 });
 it('a concurrent replay losing the MFA conditional update creates no session',async()=>{
  const {service,password,code}=await adminFixture();db.adminAccount.updateMany.mockResolvedValue({count:0});await expect(service.login({email:user.email,password,totpCode:code},{})).rejects.toMatchObject({code:'ADMIN_LOGIN_FAILED'});expect(db.adminSession.create).not.toHaveBeenCalled();
 });
 it('login lockout blocks even valid credentials',async()=>{
  const {service,password,code,account}=await adminFixture();db.adminAccount.findUnique.mockResolvedValue({...account,lockedUntil:new Date(Date.now()+60000)});await expect(service.login({email:user.email,password,totpCode:code},{})).rejects.toMatchObject({code:'ADMIN_LOCKED'});expect(db.adminSession.create).not.toHaveBeenCalled();
 });
 it('reauthentication cannot bypass persistent lockout',async()=>{
  const {service,password,code,account}=await adminFixture();db.adminAccount.findUnique.mockResolvedValue({...account,lockedUntil:new Date(Date.now()+60000)});await expect(service.reauth({adminId:'ad1',sessionId:'as1'} as any,{password,totpCode:code},{})).rejects.toMatchObject({code:'ADMIN_LOGIN_FAILED'});expect(db.adminSession.update).not.toHaveBeenCalled();
 });
 it('reauthentication cannot refresh a revoked session',async()=>{
  const {service,password,code}=await adminFixture();db.adminSession.findUnique.mockResolvedValue({revokedAt:new Date()});await expect(service.reauth({adminId:'ad1',sessionId:'as1'} as any,{password,totpCode:code},{})).rejects.toMatchObject({code:'ADMIN_LOGIN_FAILED'});expect(db.adminSession.update).not.toHaveBeenCalled();
 });
 it('a concurrent password reset wins over admin login',async()=>{
  const {service,password,code,person}=await adminFixture();db.user.findUnique.mockResolvedValueOnce(person).mockResolvedValue({...person,tokenVersion:2});await expect(service.login({email:user.email,password,totpCode:code},{})).rejects.toMatchObject({code:'ADMIN_LOGIN_FAILED'});expect(db.adminSession.create).not.toHaveBeenCalled();
 });
 it('the fifth failed credential check atomically sets a fifteen minute lockout',async()=>{
  const {service,code}=await adminFixture();db.adminAccount.update.mockResolvedValue({failedLogins:5});await expect(service.login({email:user.email,password:'wrong',totpCode:code},{})).rejects.toMatchObject({status:401});expect(db.adminAccount.update.mock.calls[0][0].data.failedLogins).toEqual({increment:1});expect(db.adminAccount.update.mock.calls[1][0].data.lockedUntil.getTime()-Date.now()).toBeGreaterThan(899000);
 });
});
describe('QPay callback authentication and transaction recovery',()=>{
 function setup(){const fixture=billingFixture({callbackTokenHash:createHash('sha256').update('synthetic-callback').digest('hex'),providerInvoiceId:'remote-i1'});const service=new BillingService(config);const provider={name:'QPAY',checkInvoicePayment:vi.fn()};(service as any).provider=provider;return {...fixture,service,provider}}
 it.each(['','wrong-token'])('invalid callback token never calls QPay or grants access: %s',async token=>{const {service,provider}=setup();await expect(service.handleProviderCallback('i1',token)).rejects.toMatchObject({code:'INVALID_CALLBACK_TOKEN'});expect(provider.checkInvoicePayment).not.toHaveBeenCalled();expect(db.companyEntitlement.upsert).not.toHaveBeenCalled()});
 it('callback cannot treat an upstream outage as payment',async()=>{const {service,provider}=setup();provider.checkInvoicePayment.mockRejectedValue(new Error('unavailable'));await expect(service.handleProviderCallback('i1','synthetic-callback')).rejects.toMatchObject({code:'PAYMENT_VERIFICATION_ERROR'});expect(db.companyEntitlement.upsert).not.toHaveBeenCalled()});
 it('a valid callback still requires a verified fully paid transaction set',async()=>{const {service,provider}=setup();provider.checkInvoicePayment.mockResolvedValue({paid:false,paidAmountMnt:1,paymentId:'partial'});await service.handleProviderCallback('i1','synthetic-callback');expect(db.companyEntitlement.upsert).not.toHaveBeenCalled()});
 it('a stale unique-index snapshot retries against a new transaction',async()=>{
  const {activate}=billingFixture();db.$transaction.mockRejectedValueOnce({code:'P2002'});await activate([payment('a',300000)]);expect(db.$transaction).toHaveBeenCalledTimes(2);expect(db.companyEntitlement.upsert).toHaveBeenCalledTimes(1);
 });
 it('recording a confirmed refund revokes active and consumed rights',async()=>{
  const {invoice}=billingFixture({status:'PAID'});db.billingInvoice.update.mockResolvedValue({...invoice,status:'REFUNDED'});const service=new BillingService(config);await service.recordConfirmedRefund('i1','synthetic-refund','Synthetic test');expect(db.companyEntitlement.updateMany.mock.calls[0][0]).toMatchObject({where:{sourceInvoiceId:'i1',status:{in:['ACTIVE','CONSUMED']}},data:{status:'REVOKED'}});
 });
});

describe('SUPER_ADMIN customer email and status workflows',()=>{
 const principal:any={adminId:'ad1',userId:'super-user'};
 function routes(){
  const handlers=new Map<string,any>(),audit=vi.fn().mockResolvedValue(undefined);
  registerAccountRoutes({route:(method:string,path:string,_permission:any,handler:any)=>handlers.set(method+' '+path,handler),audit,pageOf:()=>({page:1,pageSize:20,skip:0})} as any);
  const response:any={writeHead:vi.fn(),end:vi.fn()};db.user.findUnique.mockResolvedValue({...user,adminAccount:null});db.user.findFirst.mockResolvedValue(null);
  return {handlers,audit,response,ctx:{params:{id:'u1'},res:response}};
 }
 it('changing email invalidates old-mailbox tokens and requires fresh ownership proof',async()=>{
  const {handlers,ctx,response}=routes();await handlers.get('POST /users/:id/email')(ctx,principal,{}, {newEmail:'new@example.invalid',confirmNewEmail:'new@example.invalid',reason:'Synthetic ownership correction'});
  expect(db.user.update.mock.calls[0][0].data).toMatchObject({email:'new@example.invalid',emailVerificationRequired:true,emailVerifiedAt:null,tokenVersion:{increment:1}});expect(db.passwordResetToken.updateMany.mock.calls[0][0].where).toEqual({userId:'u1',usedAt:null});expect(db.refreshSession.updateMany).toHaveBeenCalled();expect(db.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(db.user.update.mock.invocationCallOrder[0]);expect(JSON.parse(response.end.mock.calls[0][0]).data.changed).toBe(true);
 });
 it('disabling customer invalidates outstanding reset and verification links',async()=>{
  const {handlers,ctx}=routes();await handlers.get('POST /users/:id/status')(ctx,principal,{}, {status:'DISABLED',reason:'Synthetic account deactivation'});
  expect(db.user.update.mock.calls[0][0].data).toMatchObject({status:'DISABLED',tokenVersion:{increment:1}});expect(db.passwordResetToken.updateMany).toHaveBeenCalled();
 });
 it('customer management cannot change a dedicated admin email',async()=>{
  const {handlers,ctx}=routes();db.user.findUnique.mockResolvedValue({...user,adminAccount:{id:'other-admin'}});await expect(handlers.get('POST /users/:id/email')(ctx,principal,{}, {newEmail:'new@example.invalid',confirmNewEmail:'new@example.invalid',reason:'Synthetic correction'})).rejects.toMatchObject({code:'ADMIN_ACCOUNT_PROTECTED'});expect(db.user.update).not.toHaveBeenCalled();
 });
});
describe('administrator route audit persistence boundary',()=>{
 function setup(){
  const router=new Router(),audit=vi.fn().mockResolvedValue(undefined),maintenance=vi.fn().mockResolvedValue({updated:0});
  const admin:any={authenticate:vi.fn().mockResolvedValue({adminId:'ad1'}),requirePermission:vi.fn().mockResolvedValue(undefined),audit};
  registerAdminRoutes({router,config,admin,reviews:{maintenance},ipLimiter:{check:vi.fn()},loginLimiter:{check:vi.fn()},fingerprint:()=>({}),readJson:vi.fn().mockResolvedValue({})} as any);
  const ctx:any={req:{headers:{}},res:{writeHead:vi.fn(),end:vi.fn()},params:{},query:new URLSearchParams()};
  return {audit,maintenance,admin,run:()=>router.match('POST','/api/v1/admin/maintenance/run')!.route.handler(ctx)};
 }
 it('no mutation runs when its durable authorization audit cannot be stored',async()=>{const {audit,maintenance,run}=setup();audit.mockRejectedValue(new Error('storage unavailable'));await expect(run()).rejects.toThrow('storage unavailable');expect(maintenance).not.toHaveBeenCalled()});
 it('successful mutation has authorization, business and completion audit records',async()=>{const {audit,maintenance,run}=setup();await run();expect(maintenance).toHaveBeenCalledOnce();expect(audit.mock.calls.map(c=>c[1])).toEqual(['ADMIN_MUTATION_AUTHORIZED','MAINTENANCE_RUN','ADMIN_MUTATION_COMPLETED'])});
 it('failed mutation has a durable failed outcome',async()=>{const {audit,maintenance,run}=setup();maintenance.mockRejectedValue(new Error('operation unavailable'));await expect(run()).rejects.toThrow('operation unavailable');expect(audit.mock.calls.map(c=>c[1])).toEqual(['ADMIN_MUTATION_AUTHORIZED','ADMIN_MUTATION_FAILED'])});
 it('permission denial cannot reach a mutation',async()=>{const {admin,maintenance,run}=setup();admin.requirePermission.mockRejectedValue(new Error('denied'));await expect(run()).rejects.toThrow('denied');expect(maintenance).not.toHaveBeenCalled()});
});

it('customer account erasure cannot bypass dedicated administrator protections',async()=>{
 db.adminAccount.findUnique.mockResolvedValue({id:'super-admin'});await expect(new DataLifecycleService(config).eraseAccount('u1',{confirmEmail:user.email,password:'SyntheticPassword123!'},{})).rejects.toMatchObject({code:'ADMIN_ACCOUNT_PROTECTED'});expect(db.$transaction).not.toHaveBeenCalled();
});
it('provider rejection records a sanitized delivery failure without leaking provider details',async()=>{
 mailer.send.mockRejectedValue(new Error('sensitive-provider-message'));await expect(reset.requestReset(user.email,{})).rejects.toThrow('Mail delivery request failed');const audit=db.authAuditEvent.create.mock.calls.at(-1)![0].data;expect(audit.eventType).toBe('PASSWORD_RESET_DELIVERY_FAILED');expect(JSON.stringify(audit)).not.toContain('sensitive-provider-message');
});

describe('registration e-mail code is a separate process from password recovery (mock database)',()=>{
 const pending:any={...user,emailVerificationRequired:true,emailVerifiedAt:null};
 let verify:EmailVerificationService;
 const codeRow=(code:string,over:any={})=>({id:'c1',userId:user.id,purpose:EMAIL_CODE_PURPOSE,usedAt:null,createdAt:new Date(Date.now()-5000),expiresAt:new Date(Date.now()+600000),tokenHash:verify.hashCode(user.id,code),...over});
 beforeEach(()=>{verify=new EmailVerificationService(config,mailer);db.user.findUnique.mockResolvedValue({...pending});db.authAuditEvent.count.mockResolvedValue(0)});
 it('registration sends a 6-digit code, no link, and never mentions a password reset',async()=>{
  await verify.requestCode(user.email,{});const m=mailer.send.mock.calls[0][0];
  expect(m.kind).toBe('EMAIL_VERIFICATION');expect(m.text).toMatch(/\n\d{6}\n/);expect(m.text).not.toMatch(/https?:|#\/|reset-password|token=/i);
  const created=db.passwordResetToken.create.mock.calls[0][0].data;expect(created.purpose).toBe(EMAIL_CODE_PURPOSE);expect(created.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  expect(created.expiresAt.getTime()-Date.now()).toBeLessThanOrEqual(600000+1000);expect(created.tokenHash).not.toMatch(/^\d{6}$/);
 });
 it('only the same purpose is voided when a new code is issued, and a password-reset request is unaffected',async()=>{await verify.requestCode(user.email,{});expect(db.passwordResetToken.updateMany.mock.calls[0][0].where).toMatchObject({purpose:EMAIL_CODE_PURPOSE,usedAt:null})});
 it.each([['cooldown',()=>db.passwordResetToken.findFirst.mockResolvedValue({createdAt:new Date()})],['hourly cap',()=>db.passwordResetToken.count.mockResolvedValue(5)]])('resend is throttled by %s without sending mail',async(_n,arm)=>{arm();await verify.requestCode(user.email,{});expect(mailer.send).not.toHaveBeenCalled();expect(db.passwordResetToken.create).not.toHaveBeenCalled()});
 it('unknown and already-verified addresses get no mail and no error (no enumeration)',async()=>{
  db.user.findUnique.mockResolvedValueOnce(null);await expect(verify.requestCode('nobody@example.invalid',{})).resolves.toBe('SKIPPED');   // nothing sent; the API answers the same way as for a sent code
  db.user.findUnique.mockResolvedValueOnce({...user,emailVerificationRequired:true,emailVerifiedAt:new Date()});await expect(verify.requestCode(user.email,{})).resolves.toBe('SKIPPED');expect(mailer.send).not.toHaveBeenCalled();
 });
 it('the correct code marks the e-mail verified and changes nothing else',async()=>{
  db.passwordResetToken.findFirst.mockResolvedValue(codeRow('123456'));await verify.verifyCode(user.email,' 123 456 ',{});
  const data=db.user.update.mock.calls[0][0].data;expect(Object.keys(data)).toEqual(['emailVerifiedAt']);expect(data.emailVerifiedAt).toBeInstanceOf(Date);
  expect(db.refreshSession.updateMany).not.toHaveBeenCalled();expect(db.adminSession.updateMany).not.toHaveBeenCalled();expect(mailer.send).not.toHaveBeenCalled();
 });
 it('a wrong code is rejected with the generic error and verifies nothing',async()=>{db.passwordResetToken.findFirst.mockResolvedValue(codeRow('123456'));await expect(verify.verifyCode(user.email,'654321',{})).rejects.toMatchObject({code:'INVALID_VERIFICATION_CODE',status:400});expect(db.user.update).not.toHaveBeenCalled();expect(db.authAuditEvent.create.mock.calls.at(-1)?.[0].data.eventType).toBe('EMAIL_CODE_REJECTED')});
 it.each([['expired/used/missing',()=>db.passwordResetToken.findFirst.mockResolvedValue(null)],['unknown address',()=>db.user.findUnique.mockResolvedValue(null)],['already verified',()=>db.user.findUnique.mockResolvedValue({...pending,emailVerifiedAt:new Date()})]])('%s gives the same generic error',async(_n,arm)=>{db.passwordResetToken.findFirst.mockResolvedValue(codeRow('123456'));arm();await expect(verify.verifyCode(user.email,'123456',{})).rejects.toMatchObject({code:'INVALID_VERIFICATION_CODE',message:'Код буруу эсвэл хугацаа нь дууссан байна. Шинэ код авна уу.'});expect(db.user.update).not.toHaveBeenCalled()});
 it('after 5 wrong guesses even the correct code is voided',async()=>{db.passwordResetToken.findFirst.mockResolvedValue(codeRow('123456'));db.authAuditEvent.count.mockResolvedValue(5);await expect(verify.verifyCode(user.email,'123456',{})).rejects.toMatchObject({code:'INVALID_VERIFICATION_CODE'});expect(db.user.update).not.toHaveBeenCalled();expect(db.passwordResetToken.updateMany).toHaveBeenCalled()});
 it('a lost one-time claim cannot verify twice',async()=>{db.passwordResetToken.findFirst.mockResolvedValue(codeRow('123456'));db.passwordResetToken.updateMany.mockResolvedValue({count:0});await expect(verify.verifyCode(user.email,'123456',{})).rejects.toMatchObject({code:'INVALID_VERIFICATION_CODE'});expect(db.user.update).not.toHaveBeenCalled()});
 it('malformed input and a password-reset token are rejected before any lookup',async()=>{for(const bad of ['12345','1234567','abcdef',token,'']){await expect(verify.verifyCode(user.email,bad,{})).rejects.toMatchObject({code:'INVALID_VERIFICATION_CODE'})}expect(db.passwordResetToken.findFirst).not.toHaveBeenCalled();expect(db.user.update).not.toHaveBeenCalled()});
 it('the code hash is bound to the user and cannot equal any password-reset token hash',()=>{expect(verify.hashCode('u1','123456')).not.toBe(verify.hashCode('u2','123456'));expect(verify.hashCode('u1','123456')).not.toBe(reset.hashToken('123456'))});
 it('a registration code can never reset a password, and a reset token can never verify an e-mail',async()=>{
  db.passwordResetToken.findUnique.mockResolvedValue(row({purpose:EMAIL_CODE_PURPOSE}));await expect(reset.confirmReset(token,'NewPassword123!',{})).rejects.toMatchObject({code:'INVALID_RESET_TOKEN'});expect(db.user.update).not.toHaveBeenCalled();
  db.passwordResetToken.findFirst.mockResolvedValue(null);await expect(verify.verifyCode(user.email,token,{})).rejects.toMatchObject({code:'INVALID_VERIFICATION_CODE'});expect(db.user.update).not.toHaveBeenCalled();
 });
});
