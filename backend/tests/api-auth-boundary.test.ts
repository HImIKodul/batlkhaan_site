import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {Readable} from 'node:stream';
const mocks=vi.hoisted(()=>({request:vi.fn(),confirm:vi.fn(),register:vi.fn(),code:vi.fn(),verify:vi.fn()}));
vi.mock('../src/api/auth/auth-service.js',()=>({AuthService:class{register=mocks.register}}));
vi.mock('../src/api/auth/password-reset-service.js',()=>({PASSWORD_RESET_MIN_RESPONSE_MS:350,PasswordResetService:class{requestReset=mocks.request;confirmReset=mocks.confirm}}));
vi.mock('../src/api/auth/email-verification-service.js',()=>({EmailVerificationService:class{requestCode=mocks.code;verifyCode=mocks.verify}}));
vi.mock('../src/db.js',()=>({prisma:{}}));
import {createApi} from '../src/api/app.js';
import {ApiError} from '../src/api/errors.js';
const cfg:any={refreshCookieName:'mmri_refresh',cookieSecure:true,refreshTokenTtlSeconds:3600,environment:'development',mailProvider:'disabled',auditSalt:'synthetic',mailRequestTimeoutMs:1000,allowedOrigins:new Set(),operatorEmails:new Set(),operatorUserIds:new Set(),authAccountRateLimit:10,authIpRateLimit:100,rateLimitWindowMs:60000,requestBodyLimitBytes:10000,billingProvider:'mock',publicAppUrl:'https://example.invalid'};
beforeEach(()=>{vi.useFakeTimers();mocks.request.mockReset().mockResolvedValue(undefined);mocks.confirm.mockReset().mockResolvedValue(undefined);mocks.register.mockReset().mockResolvedValue({accepted:true});mocks.code.mockReset().mockResolvedValue(undefined);mocks.verify.mockReset().mockResolvedValue(undefined)});
afterEach(()=>vi.useRealTimers());
async function invoke(path:string,body:any,app=createApi(cfg)){
 const req:any=Readable.from([JSON.stringify(body)]);req.headers={};req.socket={remoteAddress:'127.0.0.1'};
 const headers:any={};const res:any={setHeader:(k:string,v:any)=>headers[k]=v,writeHead:(status:number,h:any)=>{res.status=status;Object.assign(headers,h)},end:(raw:string)=>res.body=JSON.parse(raw)};
 const route=app.router.match('POST',path);expect(route).not.toBeNull();
 const pending=route!.route.handler({req,res,params:{},query:new URLSearchParams(),requestId:'synthetic'});
 // Give readJson's async iterator a chance to finish before advancing the fake clock.
 await vi.advanceTimersByTimeAsync(0);return {pending,res,headers,app};
}
it('registration returns generic 202 with no session cookie or access token',async()=>{
 const {pending,res,headers}=await invoke('/api/v1/auth/register',{email:'owner@example.invalid',password:'SyntheticPassword123!'});
 await vi.advanceTimersByTimeAsync(1350);await pending;expect(res.status).toBe(202);expect(res.body.data.accepted).toBe(true);expect(headers['set-cookie']).toBeUndefined();expect(res.body.data.accessToken).toBeUndefined();
});
it.each(['success','failure','slow'])('recovery response is identical and covers the provider deadline: %s',async mode=>{
 if(mode==='failure')mocks.request.mockRejectedValue(new Error('sensitive provider text'));
 if(mode==='slow')mocks.request.mockImplementation(()=>new Promise(resolve=>setTimeout(resolve,1000)));
 const {pending,res}=await invoke('/api/v1/auth/password-reset/request',{email:'synthetic@example.invalid'});
 await vi.advanceTimersByTimeAsync(1349);expect(res.body).toBeUndefined();await vi.advanceTimersByTimeAsync(1);await pending;expect(res.status).toBe(202);expect(res.body.data.accepted).toBe(true);expect(JSON.stringify(res.body)).not.toContain('sensitive');
});
it('verification requests use the same generic response and fixed timing',async()=>{
 const {pending,res}=await invoke('/api/v1/auth/email-verification/request',{email:'unknown@example.invalid'});await vi.advanceTimersByTimeAsync(1349);expect(res.body).toBeUndefined();await vi.advanceTimersByTimeAsync(1);await pending;expect(res.status).toBe(202);
});
it('verification code confirmation takes e-mail + code, creates no session and never reaches the password-reset service',async()=>{
 const {pending,res,headers}=await invoke('/api/v1/auth/email-verification/confirm',{email:'Owner@Example.invalid',code:'123456'});await vi.advanceTimersByTimeAsync(400);await pending;
 expect(res.body.data).toEqual({verified:true});expect(headers['set-cookie']).toBeUndefined();expect(mocks.verify).toHaveBeenCalledWith('Owner@Example.invalid','123456',expect.anything());expect(mocks.confirm).not.toHaveBeenCalled();
});
it('a wrong verification code takes at least the fixed minimum time (no timing oracle)',async()=>{
 mocks.verify.mockRejectedValue(new ApiError(400,'INVALID_VERIFICATION_CODE','x'));
 const {pending}=await invoke('/api/v1/auth/email-verification/confirm',{email:'nobody@example.invalid',code:'000000'});let settled:any=null;const done=pending.then(()=>{settled='ok'},(e:any)=>{settled=e.code});
 await vi.advanceTimersByTimeAsync(299);expect(settled).toBeNull();await vi.advanceTimersByTimeAsync(2);await done;expect(settled).toBe('INVALID_VERIFICATION_CODE');
});
it('registration requests a code from the verification service, not the password-reset service',async()=>{
 const {pending,res}=await invoke('/api/v1/auth/register',{email:'new@example.invalid',password:'SyntheticPassword123!'});await vi.advanceTimersByTimeAsync(1400);await pending;expect(res.status).toBe(202);expect(mocks.code).toHaveBeenCalled();expect(mocks.request).not.toHaveBeenCalled();expect(res.body.data.message).toMatch(/6 оронтой/);
});

it('invitation-only registration refuses an uninvited address before any account or mail is created',async()=>{
 vi.stubEnv('MMRI_REGISTRATION_ALLOWLIST','guest@example.invalid, @pilot.invalid');
 try{
  for(const email of ['stranger@example.invalid','guest@example.invalid.evil.invalid','x@sub.pilot.invalid.evil']){
   const {pending}=await invoke('/api/v1/auth/register',{email,password:'SyntheticPassword123!'});const out=expect(pending).rejects.toMatchObject({status:403,code:'REGISTRATION_BY_INVITATION'});
   await vi.advanceTimersByTimeAsync(1350);await out}
  expect(mocks.register).not.toHaveBeenCalled();expect(mocks.code).not.toHaveBeenCalled();
  for(const email of ['Guest@Example.invalid','a@pilot.invalid']){const {pending,res}=await invoke('/api/v1/auth/register',{email,password:'SyntheticPassword123!'});await vi.advanceTimersByTimeAsync(1350);await pending;expect(res.status).toBe(202)}
 }finally{vi.unstubAllEnvs()}
});
