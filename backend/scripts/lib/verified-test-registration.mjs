/** Complete public registration (6-digit e-mail code) through the local mock mailbox. No bypass or DB mutation.
 * For isolated fixture creation only. Refuses public/non-loopback APIs and requires an explicit mailbox.
 * Returns the actual login fetch Response so existing cookie/permission tests retain their checks.
 */
import fs from 'node:fs';import path from 'node:path';
export async function registerVerifiedFixture(apiBase,{email,password,displayName},headers={}){
 const url=new URL(apiBase);if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.port==='4000')throw new Error('Verified fixture registration requires an isolated loopback API');
 if(!process.env.MMRI_MOCK_MAIL_DIR)throw new Error('Set MMRI_MOCK_MAIL_DIR to the isolated API mock mailbox');
 const base=apiBase.replace(/\/$/,'');const post=(route,body)=>fetch(base+route,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
 const reg=await post('/auth/register',{email,password,displayName});const accepted=await reg.json();
 if(reg.status!==202||accepted.data?.accepted!==true||accepted.data?.accessToken||reg.headers.get('set-cookie'))throw new Error('Registration must be pending without a session');
 const code=fixtureVerificationCode(email);
 const verified=await post('/auth/email-verification/confirm',{email,code});if(verified.status!==200)throw new Error('Ownership confirmation failed');
 const login=await post('/auth/login',{email,password});if(login.status!==200)throw new Error('Verified fixture login failed');return login;
}

export function fixtureVerificationCode(email){
 if(!process.env.MMRI_MOCK_MAIL_DIR)throw new Error('Explicit isolated MMRI_MOCK_MAIL_DIR required');
 const file=path.join(process.env.MMRI_MOCK_MAIL_DIR,'outbox.jsonl');
 const mails=fs.readFileSync(file,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
 const message=mails.filter(m=>m.to===String(email).trim().toLowerCase()&&m.kind==='EMAIL_VERIFICATION').at(-1);
 const code=message?.text.match(/\n(\d{6})\n/)?.[1];if(!code)throw new Error('No 6-digit verification code in isolated mock mailbox');return code;
}
