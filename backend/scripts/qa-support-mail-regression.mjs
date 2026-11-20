/* Support inbox regression against an ISOLATED API running with MMRI_SUPPORT_MAIL_PROVIDER=mock (file-based mailbox in MMRI_MOCK_MAIL_DIR).
   Proves: import, no duplicates, plain-text only, customer linking, reply to sender only, QA allow-list, duplicate-reply guard, handled/re-open, search, authorization. Uses mock mail ONLY: nothing here touches Gmail. */
import fs from 'node:fs';import crypto from 'node:crypto';
import {call,sql,customer,freshAdminTotp} from './lib/admin-qa.mjs';
let pass=0,fail=0;const rec=(n,ok,d='')=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+n+(d?' | '+d:''))};
const dir=process.env.MMRI_MOCK_MAIL_DIR;const inbox=dir+'/support-inbox.jsonl',outbox=dir+'/outbox.jsonl';
const sup={email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD,secret:process.env.ADMIN_TOTP_SECRET};
const S=(await call('POST','/admin/auth/login',{body:{email:sup.email,password:sup.password,totpCode:await freshAdminTotp(sup)}})).d.token;
const adm=async(m,p,body,tok=S)=>{let r=await call(m,'/admin'+p,{tok,body});if(r.s===401&&r.e?.code==='ADMIN_REAUTH_REQUIRED'&&tok===S){await call('POST','/admin/auth/reauth',{tok:S,body:{password:sup.password,totpCode:await freshAdminTotp(sup)}});r=await call(m,'/admin'+p,{tok,body})}return r};
const tag=crypto.randomBytes(4).toString('hex');
const cu=await customer('sm');
const push=o=>fs.appendFileSync(inbox,JSON.stringify(o)+'\n');
const m1={id:`sm-${tag}-1`,threadId:`th-${tag}-A`,from:cu.email,fromName:'Тест Хэрэглэгч',subject:`Тайлангийн асуулт ${tag}`,text:'Сайн байна уу, тайлан хэзээ гарах вэ?',date:new Date(Date.now()-3600e3).toISOString(),messageId:`<m1-${tag}@mail>`};
const m2={id:`sm-${tag}-2`,threadId:`th-${tag}-B`,from:`stranger-${tag}@example.test`,subject:`HTML мэйл ${tag}`,html:'<p>Сайн уу</p><script>fetch("/admin/users")</script><img src=x onerror=alert(1)><b>ТАЙЛАН</b>',date:new Date().toISOString(),messageId:`<m2-${tag}@mail>`,attachments:2};
const m3={id:`sm-${tag}-3`,threadId:`th-${tag}-C`,from:`someone-${tag}@gmail.com`,subject:`Гадаад хаяг ${tag}`,text:'Энэ хаяг QA allow-list-д ороогүй.',date:new Date().toISOString(),messageId:`<m3-${tag}@mail>`};
push(m1);push(m2);push(m3);push(m1); // m1 pushed twice: the same message id must be imported once
const st=await adm('GET','/support-mail/status');rec('status: mock mailbox connected',st.s===200&&st.d.connected===true&&st.d.provider==='mock');
const s1=await adm('POST','/support-mail/sync');rec('sync imports 3 distinct messages (duplicate id ignored)',s1.s===200&&s1.d.imported===3,JSON.stringify(s1.d));
const s2=await adm('POST','/support-mail/sync');rec('second sync imports nothing',s2.d.imported===0);
const count=sql(`select count(*) from support_mail_messages where "gmailMessageId" like 'sm-${tag}-%'`);rec('database holds exactly 3 messages for the batch (UNIQUE message id)',count==='3',count);
const list=await adm('GET',`/support-mail?q=${tag}`);const items=list.d?.items??[];rec('search finds the three conversations',items.length===3,String(items.length));
const A=items.find(t=>t.subject.startsWith('Тайлангийн асуулт')),B=items.find(t=>t.subject.startsWith('HTML мэйл')),C=items.find(t=>t.subject.startsWith('Гадаад'));
rec('new conversations are unanswered/open',items.every(t=>t.unanswered===true&&t.status==='OPEN'));
const uA=await adm('GET',`/support-mail?unanswered=1&q=${tag}`);rec('unanswered filter works',uA.d.total===3);
const dA=await adm('GET',`/support-mail/${A.id}`);rec('thread links the registered customer account',dA.s===200&&dA.d.customer?.email===cu.email&&dA.d.customer.id,JSON.stringify(dA.d.customer?.email));
const dB=await adm('GET',`/support-mail/${B.id}`);const bodyB=dB.d.messages[0].bodyText;
rec('HTML message stored as plain text: no tags/script/handlers; attachments counted not stored',!/<|script|onerror|fetch\(/.test(bodyB)&&/ТАЙЛАН/.test(bodyB)&&dB.d.messages[0].attachments===2,JSON.stringify(bodyB));
rec('unregistered sender has no customer link',dB.d.customer===null);
// reply
const before=fs.existsSync(outbox)?fs.readFileSync(outbox,'utf8').trim().split('\n').length:0;
const rp=await adm('POST',`/support-mail/${A.id}/reply`,{text:'Тайлан батлагдмагц таны апп дотор болон имэйлээр мэдэгдэнэ.',to:'attacker@evil.test'});
const outs=fs.readFileSync(outbox,'utf8').trim().split('\n').slice(before).map(l=>JSON.parse(l));
rec('reply is sent to the conversation sender only (an injected "to" is ignored)',rp.s===200&&outs.length===1&&outs[0].to===cu.email&&outs[0].kind==='SUPPORT_REPLY'&&outs[0].subject.startsWith('Re: '),JSON.stringify(outs.map(o=>o.to)));
rec('reply threads on the original message id',outs[0]?.inReplyTo===m1.messageId);
const dup=await adm('POST',`/support-mail/${A.id}/reply`,{text:'Тайлан батлагдмагц таны апп дотор болон имэйлээр мэдэгдэнэ.'});rec('double-click duplicate reply refused (409)',dup.s===409&&dup.e?.code==='DUPLICATE_REPLY');
const blocked=await adm('POST',`/support-mail/${C.id}/reply`,{text:'Энэ илгээгдэх ёсгүй.'});rec('QA allow-list: reply to a non-allow-listed outside address is refused, nothing sent',blocked.s===409&&blocked.e?.code==='RECIPIENT_NOT_ALLOWLISTED'&&fs.readFileSync(outbox,'utf8').trim().split('\n').length===before+1);
rec('empty reply refused',(await adm('POST',`/support-mail/${A.id}/reply`,{text:' '})).s===400);
const dA2=await adm('GET',`/support-mail/${A.id}`);rec('thread now shows the outbound reply and is answered',dA2.d.messages.length===2&&dA2.d.messages[1].direction==='OUTBOUND');
const l2=await adm('GET',`/support-mail?q=${tag}&unanswered=1`);rec('answered thread leaves the unanswered list',l2.d.total===2);
// handled / reopen on new inbound
const h=await adm('POST',`/support-mail/${A.id}/handled`,{handled:true});rec('mark handled',h.s===200&&sql(`select status from support_mail_threads where id='${A.id}'`)==='HANDLED');
push({id:`sm-${tag}-4`,threadId:m1.threadId,from:cu.email,subject:`Re: Тайлангийн асуулт ${tag}`,text:'Баярлалаа, дахин нэг асуулт байна.',date:new Date().toISOString(),messageId:`<m4-${tag}@mail>`});
const s3=await adm('POST','/support-mail/sync');rec('new customer message joins the same conversation and re-opens it',s3.d.imported===1&&sql(`select status from support_mail_threads where id='${A.id}'`)==='OPEN'&&sql(`select count(*) from support_mail_messages where "threadId"='${A.id}'`)==='3');
// authorization
rec('no token: inbox and reply are refused (401)',[(await call('GET','/admin/support-mail',{})).s,(await call('POST',`/admin/support-mail/${A.id}/reply`,{body:{text:'xx'}})).s].every(x=>x===401));
rec('customer token cannot reach the support inbox (401)',(await call('GET','/admin/support-mail',{tok:cu.tok})).s===401);
rec('no customer-facing route exposes support mail',(await call('GET','/support-mail',{tok:cu.tok})).s===404);
const audit=sql(`select count(*) from admin_audit_events where action in ('SUPPORT_MAIL_REPLY','SUPPORT_MAIL_HANDLED','SUPPORT_MAIL_SYNC')`);rec('replies, handled and syncs are in the admin audit trail',Number(audit)>=3,audit);
console.log(`\nRESULT pass=${pass} fail=${fail}`);process.exit(fail?1:0);
