/* Browser regression (Playwright + Chrome) for password recovery, legal pages and the account data section, on the production build.
   Needs: API :4000 (development, MMRI_MAIL_PROVIDER=mock), preview :4173, PW=<path to playwright-core>. Creates its own throw-away accounts. */
import {createRequire} from 'module';const require=createRequire(import.meta.url);const {chromium}=require(process.env.PW);import fs from 'fs';import crypto from 'crypto';import path from 'path';
const BASE=process.env.BASE||'http://127.0.0.1:4173/';const API='http://localhost:4000/api/v1';const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const BOX=path.join(process.env.HOME,'MMRI_STEP10_FINAL_WORKING/backend/.mock-mailbox/outbox.jsonl');
const res=[];const t=(id,n,ok,d='')=>{res.push({id,n,ok:!!ok,d});console.log((ok?'PASS ':'FAIL ')+id+' '+n+(d?' | '+d:''))};
const mails=()=>fs.existsSync(BOX)?fs.readFileSync(BOX,'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l)):[];
const axeSrc=fs.readFileSync(process.env.AXE||path.join(path.dirname(require.resolve(process.env.PW)),'../axe-core/axe.min.js'),'utf8');
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const mk=async(vp)=>{const c=await b.newContext({viewport:vp,acceptDownloads:true});await c.route('**/api/**',r=>r.continue({headers:{...r.request().headers(),origin:'http://localhost:5173'}}));return c};
const reg=async(label)=>{const email=`ui.${label}.${Date.now()}.${crypto.randomBytes(2).toString('hex')}@mmri.test`,pw=crypto.randomBytes(12).toString('base64url')+'Aa1!';const r=await fetch(API+'/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password:pw,displayName:'UI '+label})});return {email,pw,tok:(await r.json()).data.accessToken}};
const overflow=p=>p.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
const axe=async p=>{await p.evaluate(axeSrc);return p.evaluate(async()=>(await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}})).violations.map(v=>v.id+':'+v.nodes.length))};
const u=await reg('flow');
{const c=await mk({width:1440,height:900});const p=await c.newPage();const errs=[];p.on('pageerror',e=>errs.push(String(e).slice(0,100)));
 await p.goto(BASE+'#/login');await p.reload();await sleep(900);
 t('U01','login page offers "Нууц үгээ мартсан уу?" and legal links',await p.getByText('Нууц үгээ мартсан уу?').count()===1&&await p.locator('a[href="#/privacy"]').count()>=1&&await p.locator('a[href="#/terms"]').count()>=1);
 await p.getByText('Нууц үгээ мартсан уу?').click();await sleep(800);t('U02','forgot-password page opens',p.url().includes('#/forgot-password')&&await p.locator('h1').innerText()==='Нууц үг сэргээх');
 await p.fill('input[type=email]',u.email);await p.getByRole('button',{name:'Холбоос илгээх'}).click();await sleep(1200);
 t('U03','request shows the neutral confirmation (30 minutes, one time)',(await p.locator('.auth__done').innerText()).includes('30 минут'));
 const mail=mails().filter(m=>m.to===u.email).pop();const token=(mail?.text.match(/token=([A-Za-z0-9_-]{43})/)||[])[1];t('U04','a mock e-mail with a reset link was written (no real e-mail sent)',!!token&&mail.text.includes('#/reset-password?token='));
 // unknown address gets the same text
 await p.goto(BASE+'#/forgot-password');await p.reload();await sleep(900);await p.fill('input[type=email]',`nobody.${Date.now()}@mmri.test`);await p.getByRole('button',{name:'Холбоос илгээх'}).click();await sleep(1200);t('U05','an unknown address gets the same confirmation (no enumeration)',(await p.locator('.auth__done').innerText()).includes('30 минут'));
 // reset page
 await p.goto(BASE+'#/reset-password?token='+token);await p.reload();await sleep(900);const np=crypto.randomBytes(12).toString('base64url')+'Zz9!';
 const inputs=p.locator('input[type=password]');await inputs.nth(0).fill(np);await inputs.nth(1).fill(np+'x');const btnDisabled=await p.getByRole('button',{name:'Нууц үг солих'}).isDisabled();
 t('U06','mismatching passwords keep the submit button disabled',btnDisabled);
 await inputs.nth(1).fill(np);await p.getByRole('button',{name:'Нууц үг солих'}).click();await sleep(1800);t('U07','valid reset shows success and asks to sign in again',(await p.locator('.auth__done').innerText()).includes('амжилттай солигдлоо'));
 t('U08','the token is removed from the address bar after success',!p.url().includes('token='),p.url().split('#')[1]);
 // sign in with the new password through the UI; old one fails
 await p.goto(BASE+'#/login');await p.reload();await sleep(800);await p.fill('input[type=email]',u.email);await p.fill('input[type=password]',u.pw);await p.click('button[type=submit]');await sleep(1800);const oldFailed=await p.locator('.mmri-support-alert.is-error').count()>0;
 await p.fill('input[type=password]',np);await p.click('button[type=submit]');await sleep(2200);t('U09','old password is refused, new password signs in',oldFailed&&(await p.locator('.mmri-account-trigger').count())>0);
 // reused / bad token
 await p.goto(BASE+'#/reset-password?token='+token);await p.reload();await sleep(900);const i2=p.locator('input[type=password]');await i2.nth(0).fill(np+'2');await i2.nth(1).fill(np+'2');await p.getByRole('button',{name:'Нууц үг солих'}).click();await sleep(1500);
 t('U10','a used token shows an invalid or expired message with a way to get a new link',(await p.locator('.mmri-support-alert').innerText()).includes('хүчингүй')&&await p.getByText('Шинэ холбоос авах').count()>0);
 await p.goto(BASE+'#/reset-password?token=short');await p.reload();await sleep(800);t('U11','a malformed link shows "Холбоос буруу байна" without a form',(await p.locator('.auth__done').innerText()).includes('Холбоос буруу')&&await p.locator('input[type=password]').count()===0);
 t('U12','no uncaught page errors',errs.length===0,errs.join(';'));await c.close()}
// legal pages: content, status, responsive, axe
for(const [route,title] of [['privacy','Нууцлалын бодлого'],['terms','Үйлчилгээний нөхцөл']]){
 for(const vp of [{width:1440,height:900},{width:390,height:844},{width:360,height:800}]){const c=await mk(vp);const p=await c.newPage();await p.goto(BASE+'#/'+route);await p.reload();await sleep(1200);
  const h1=await p.locator('h1').innerText();const banner=await p.locator('.legal-doc__banner').innerText();const ov=await overflow(p);const ax=await axe(p);const sections=await p.locator('.legal-doc__block').count();
  t(`L-${route}-${vp.width}`,`${title}: h1, visible draft banner, ${sections} sections, no overflow, axe clean`,h1===title&&banner.includes('Хуулийн хяналт хүлээгдэж')&&sections>=9&&ov<=0&&ax.length===0,`overflow ${ov} axe ${ax.join(',')||'none'}`);
  if(vp.width===1440){const text=await p.locator('main').innerText();t(`L-${route}-text`,'text has no em dash and marks owner decisions as pending ("батлагдаагүй")',!text.includes('—')&&text.includes('батлагдаагүй'));}
  await c.close()}}
// footer on the home page
{const c=await mk({width:1440,height:900});const p=await c.newPage();await p.goto(BASE+'#/');await p.reload();await sleep(1400);t('F01','application footer links to privacy and terms',await p.locator('.mmri-legal-footer a[href="#/privacy"]').count()===1&&await p.locator('.mmri-legal-footer a[href="#/terms"]').count()===1);await c.close()}
// register page shows legal links
{const c=await mk({width:390,height:844});const p=await c.newPage();await p.goto(BASE+'#/login');await p.reload();await sleep(900);await p.locator('.mmri-tabs button',{hasText:'Бүртгүүлэх'}).first().click();await sleep(500);t('F02','registration form links to Terms and Privacy Policy (draft status shown)',(await p.locator('.auth__legal').innerText()).includes('Хуулийн хяналт')&&await p.locator('.auth__legal a').count()===2);t('F03','registration page has no horizontal overflow at 390',await overflow(p)<=0);await c.close()}
// account data: export, guarded erasure
{const e=await reg('data');const co=await (await fetch(API+'/companies',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+e.tok},body:JSON.stringify({name:'UI Data ХХК'})})).json();
 const c=await mk({width:1440,height:900});const p=await c.newPage();const errs=[];p.on('pageerror',x=>errs.push(String(x).slice(0,100)));
 await p.goto(BASE+'#/login');await p.reload();await sleep(800);await p.fill('input[type=email]',e.email);await p.fill('input[type=password]',e.pw);await p.click('button[type=submit]');await sleep(2500);
 await p.goto(BASE+'#/settings?section=data');await sleep(1500);
 t('D01','Settings > Өгөгдөл ба нууцлал page opens and links to the legal drafts',(await p.locator('h1').innerText())==='Өгөгдөл ба нууцлал'&&await p.locator('.account-data a[href="#/privacy"]').count()===1);
 const [dl]=await Promise.all([p.waitForEvent('download',{timeout:15000}).catch(()=>null),p.getByRole('button',{name:'Бүртгэлийн мэдээлэл татах'}).click()]);let dltext='';if(dl){const f=await dl.path();dltext=fs.readFileSync(f,'utf8')}
 t('D02','account export downloads a JSON file with the account and no secrets',!!dl&&dltext.includes(e.email)&&!/passwordHash|tokenVersion/.test(dltext),dl?dl.suggestedFilename():'no download');
 const eraseBtn=p.getByRole('button',{name:'Байгууллагын мэдээллийг устгах'});t('D03','company erase button stays disabled until name and password are typed',await eraseBtn.isDisabled());
 const nameField=p.locator('.account-data__danger').first().locator('input').nth(0),pwField=p.locator('.account-data__danger').first().locator('input').nth(1);
 await nameField.fill('Өөр нэр');await pwField.fill(e.pw);await eraseBtn.click();await sleep(1500);t('D04','a wrong confirmation name is refused with a Mongolian message and nothing is erased',(await p.locator('.mmri-support-alert.is-error').innerText()).includes('таарахгүй'));
 await nameField.fill('UI Data ХХК');await pwField.fill('wrong-password-12');await eraseBtn.click();await sleep(1500);t('D05','a wrong password is refused',(await p.locator('.mmri-support-alert.is-error').innerText()).includes('Нууц үг буруу'));
 await pwField.fill(e.pw);await eraseBtn.click();await sleep(2200);t('D06','correct confirmation erases the company data and says what is retained',(await p.locator('.mmri-support-alert').first().innerText()).includes('устгагдлаа')&&(await p.locator('.mmri-support-alert').first().innerText()).includes('хадгалагдана'));
 await p.goto(BASE+'#/settings?section=data');await sleep(1200);const accBox=p.locator('.account-data__danger').nth(1);await accBox.locator('input').nth(0).fill(e.email);await accBox.locator('input').nth(1).fill(e.pw);await p.getByRole('button',{name:'Бүртгэлээ устгах'}).click();await sleep(3000);
 const r=await fetch(API+'/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:e.email,password:e.pw})});t('D07','account erasure signs the user out and the account can no longer sign in',r.status===401&&(await p.locator('.mmri-account-trigger').count())===0,`login ${r.status}`);
 t('D08','no uncaught page errors on the data page',errs.length===0,errs.join(';'));await c.close()}
// data page responsive + axe (fresh account)
for(const vp of [{width:1440,height:900},{width:390,height:844}]){const e=await reg('resp');await fetch(API+'/companies',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+e.tok},body:JSON.stringify({name:'UI Resp ХХК'})});const c=await mk(vp);const p=await c.newPage();await p.goto(BASE+'#/login');await p.reload();await sleep(800);await p.fill('input[type=email]',e.email);await p.fill('input[type=password]',e.pw);await p.click('button[type=submit]');await sleep(2200);await p.goto(BASE+'#/settings?section=data');await sleep(1400);
 const ov=await overflow(p),ax=await axe(p);t(`D-resp-${vp.width}`,'data page: no overflow, axe clean',ov<=0&&ax.length===0,`overflow ${ov} axe ${ax.join(',')||'none'}`);await c.close()}
// auth pages responsive + axe
for(const route of ['forgot-password','reset-password?token='+'A'.repeat(43)]){for(const vp of [{width:1440,height:900},{width:390,height:844}]){const c=await mk(vp);const p=await c.newPage();await p.goto(BASE+'#/'+route);await p.reload();await sleep(1000);const ov=await overflow(p),ax=await axe(p);t(`A-${route.slice(0,8)}-${vp.width}`,'recovery page: no overflow, axe clean',ov<=0&&ax.length===0,`overflow ${ov} axe ${ax.join(',')||'none'}`);await c.close()}}
fs.writeFileSync((process.env.OUT||'/tmp')+'/ui-recovery-legal-data.json',JSON.stringify(res,null,1));console.log(res.filter(r=>r.ok).length+'/'+res.length);await b.close();
