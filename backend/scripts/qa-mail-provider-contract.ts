import assert from 'node:assert/strict';
import { ResendMailer, createMailer } from '../src/api/mail/mailer.js';
const message = {to:'synthetic@example.invalid',subject:'BusinessMRI.mn: нууц үг сэргээх',text:'Нэг удаагийн холбоос',kind:'PASSWORD_RESET'};
let calls=0;
const transport: typeof fetch = async (url, options) => {
  calls++;
  assert.equal(url,'https://api.resend.com/emails');
  assert.equal(options?.redirect,'error');
  assert.ok(options?.signal instanceof AbortSignal);
  assert.equal(new Headers(options?.headers).get('authorization'),'Bearer contract-test-key');
  const {html,headers,...sent}=JSON.parse(String(options?.body));
  assert.deepEqual(sent,{from:'BusinessMRI.mn <noreply@example.invalid>',to:[message.to],subject:message.subject,text:message.text});
  assert.ok(html.includes('MRI')&&html.includes(message.text)&&!/<script|<img|javascript:/i.test(html));
  assert.deepEqual(headers,{'Auto-Submitted':'auto-generated'});
  return new Response(JSON.stringify({id:'synthetic-mail-id'}),{status:200});
};
assert.deepEqual(await new ResendMailer('contract-test-key','noreply@example.invalid',1000,transport).send(message),{delivered:true,provider:'resend'});
assert.equal(calls,1);
for(const response of [new Response('credential-and-token-must-not-leak',{status:401}),new Response('{}',{status:200}),new Response('invalid',{status:200})]){
 await assert.rejects(()=>new ResendMailer('contract-test-key','noreply@example.invalid',1000,async()=>response).send(message),{message:'Mail provider request failed'});
}
await assert.rejects(()=>new ResendMailer('contract-test-key','noreply@example.invalid',1000,async()=>{throw new Error('sensitive transport details')}).send(message),{message:'Mail provider request failed'});
await assert.rejects(()=>new ResendMailer('key','noreply@example.invalid',1000,transport).send({...message,subject:'hello\r\nBcc: other@example.invalid'}),{message:'Invalid mail envelope'});
await assert.rejects(()=>new ResendMailer('key','noreply@example.invalid',1000,transport).send({...message,to:'two@example.invalid,other@example.invalid'}),{message:'Invalid mail envelope'});
assert.throws(()=>createMailer({mailProvider:'resend',mockMailDir:'/unused'}),/configuration missing/);
assert.equal((await createMailer({mailProvider:'disabled',mockMailDir:'/unused'}).send(message)).delivered,false);
console.log('PASS mail provider contract; no external email sent');
