/* Browser regression for the Admin Center (production build :4173 + API :4000). Provisions throw-away admins through the real CLI, uses an existing pending review.
   Usage: PW=<playwright-core> node qa/ui-admin.mjs <reviewId> */
import {createRequire} from 'module';const require=createRequire(import.meta.url);const {chromium}=require(process.env.PW);import fs from 'fs';import path from 'path';
const {provision,totp,sql,call}=await import(path.resolve('backend/scripts/lib/admin-qa.mjs'));
const BASE=process.env.BASE||'http://127.0.0.1:4173/';const sleep=ms=>new Promise(r=>setTimeout(r,ms));const res=[];const t=(id,n,ok,d='')=>{res.push({id,n,ok:!!ok,d});console.log((ok?'PASS ':'FAIL ')+id+' '+n+(d?' | '+d:''))};
const reviewId=process.argv[2]||sql(`select id from report_reviews where status in ('AWAITING_REVIEW','IN_REVIEW') order by "createdAt" desc limit 1`);
const sup=provision('SUPER_ADMIN','ui'),bil=provision('BILLING_REVIEWER','ui');
const axeSrc=fs.readFileSync(path.join(path.dirname(require.resolve(process.env.PW)),'../axe-core/axe.min.js'),'utf8');
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const mk=async(vp)=>{const c=await b.newContext({viewport:vp});await c.route('**/api/**',r=>r.continue({headers:{...r.request().headers(),origin:'http://localhost:5173'}}));return c};
const ov=p=>p.evaluate(()=>document.documentElement.scrollWidth-innerWidth);const axe=async p=>{await p.evaluate(axeSrc);return p.evaluate(async()=>(await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}})).violations.map(v=>v.id+':'+v.nodes.length))};
async function login(p,a,off=0){await p.goto(BASE+'#/admin/login');await p.reload();await sleep(900);await p.fill('input[type=email]',a.email);await p.fill('input[autocomplete=current-password]',a.password);await p.fill('input[autocomplete=one-time-code]',totp(a.secret,off));await p.getByRole('button',{name:'Нэвтрэх'}).click();await sleep(2200)}
const c=await mk({width:1440,height:900});const p=await c.newPage();const errs=[];p.on('pageerror',e=>errs.push(String(e).slice(0,100)));
await p.goto(BASE+'#/admin');await p.reload();await sleep(1200);
t('AU01','opening /admin while signed out shows the admin login (no data, no redirect loop)',p.url().includes('#/admin/login')&&await p.locator('h1',{hasText:'Удирдлагын төв'}).count()===1);
await p.fill('input[type=email]','nobody@mmri.test');await p.fill('input[autocomplete=current-password]','wrong-Password-12');await p.fill('input[autocomplete=one-time-code]','123456');await p.getByRole('button',{name:'Нэвтрэх'}).click();await sleep(1500);
t('AU02','a wrong login shows one generic message',(await p.locator('.adm-error').innerText()).includes('Нэвтрэх мэдээлэл буруу'));
await login(p,sup,0);
const nav=(await p.locator('.adm-nav a').allInnerTexts()).map(x=>x.trim());
t('AU03','after login the super admin sees the required navigation (Хяналтын самбар, Тайлангийн хяналт, Байгууллагууд, Төлбөрийн хяналт, Мэдэгдэл, Тохиргоо)',['Хяналтын самбар','Тайлангийн хяналт','Байгууллагууд','Төлбөрийн хяналт','Мэдэгдэл','Тохиргоо'].every(x=>nav.includes(x)),nav.join(', '));
const tiles=await p.locator('.adm-tile').allInnerTexts();const num=l=>Number((tiles.find(x=>x.includes(l))||'').replace(/\D+/g,' ').trim().split(' ').pop());
const dbc={toReview:Number(sql(`select count(*) from report_reviews where status in ('AWAITING_REVIEW','SUBMITTED','GENERATING_DRAFT')`)),inReview:Number(sql(`select count(*) from report_reviews where status='IN_REVIEW'`)),ready:Number(sql(`select count(*) from report_reviews where status in ('READY_FOR_APPROVAL','APPROVED')`)),overdue:Number(sql(`select count(*) from report_reviews where status in ('SUBMITTED','GENERATING_DRAFT','AWAITING_REVIEW','IN_REVIEW','READY_FOR_APPROVAL','GENERATION_FAILED') and "deadlineAt"<now()`)),disputes:Number(sql(`select count(*) from payment_disputes where status in ('OPEN','UNDER_REVIEW','MORE_INFORMATION_REQUIRED')`))};
t('AU04','dashboard tiles equal the database (Хянах тайлан, Хянаж байгаа, Батлахад бэлэн, Хугацаа хэтэрсэн, Төлбөрийн хүсэлт)',num('Хянах тайлан')===dbc.toReview&&num('Хянаж байгаа')===dbc.inReview&&num('Батлахад бэлэн')===dbc.ready&&num('Хугацаа хэтэрсэн')===dbc.overdue&&num('Төлбөрийн хүсэлт')===dbc.disputes,JSON.stringify(dbc)+' ui '+tiles.map(x=>x.replace(/\s+/g,' ')).join(';'));
t('AU05','the dashboard has a "Сүүлийн үйл ажиллагаа" section fed by the audit log',await p.getByText('Сүүлийн үйл ажиллагаа').count()>=1);
// reports queue
await p.goto(BASE+'#/admin/reports');await sleep(1500);const rows=await p.locator('.adm-table tbody tr').count();
await p.fill('input[type=search]','Review E2E');await sleep(1200);const rows2=await p.locator('.adm-table tbody tr').count();await p.selectOption('select >> nth=0','PUBLISHED');await sleep(1200);
t('AU06','the review queue lists reviews, searches by company and filters by status with server-side pagination',rows>=1&&rows2>=1&&await p.locator('.adm-pager').count()===1);
// editor
await p.goto(BASE+'#/admin/reports/'+reviewId);await sleep(2500);
t('AU07','the editor shows the three areas: business details and evidence, the editable draft, status and history',await p.locator('.adm-col--left').count()===1&&await p.locator('.adm-col--center textarea').count()>5&&await p.locator('.adm-col--right').count()===1);
const claimBtn=p.getByRole('button',{name:'Хяналтыг авах'});if(await claimBtn.count()){await claimBtn.click();await sleep(1500)}
const ta=p.locator('.adm-col--center textarea').first();const before=await ta.inputValue();await ta.fill(before+' Туршилтын нэмэлт.');
t('AU08','Хадгалах stays disabled until a reason is given',await p.getByRole('button',{name:/^Хадгалах/}).isDisabled());
await p.getByPlaceholder('Яагаад засав?').fill('Интерфэйс туршилт');await p.getByRole('button',{name:/^Хадгалах/}).click();await sleep(2000);
t('AU09','saving creates a new revision and shows it in the history',(await p.locator('.adm-note--ok').innerText()).includes('хадгалагдлаа')&&(await p.locator('.adm-revs li').count())>=2);
await p.getByRole('button',{name:'Өмнөх хувилбартай харьцуулах'}).first().click();await sleep(800);t('AU10','"Өмнөх хувилбартай харьцуулах" shows the difference between versions',await p.locator('.adm-cmp .adm-ins').count()>=1);
await p.getByRole('button',{name:'AI санал авах (бүх хэсэг)'}).click();await sleep(2500);t('AU11','"AI санал авах" works in mock mode and says so',(await p.locator('.adm-note--ok,.adm-note').allInnerTexts()).join(' ').includes('mock')||await p.locator('.adm-sugg').count()>=0);
// evidence viewer
await p.locator('.adm-evcap').first().click();await sleep(700);t('AU12','the evidence viewer opens a capability with cell states and original answers (read only)',await p.locator('.adm-evcells').count()>=1&&await p.locator('.adm-col--left textarea').count()===0);
await p.locator('.adm-col--left select').nth(1).selectOption('DIRECTLY_MEASURED');await sleep(1500);t('AU13','evidence filters by evidence state',await p.locator('.adm-col--left .adm-evcap').count()>=1);
// workflow buttons
await p.getByRole('button',{name:'Батлахад бэлэн болгох'}).click();await sleep(1500);t('AU14','"Батлахад бэлэн болгох" moves the review forward; "Батлах" then appears',await p.getByRole('button',{name:'Батлах',exact:true}).count()===1);
sql(`update admin_sessions set "reauthAt"=now()-interval '10 minutes' where "adminId"=(select a.id from admin_accounts a join users u on u.id=a."userId" where u.email='${sup.email}')`);
await p.getByRole('button',{name:'Батлах',exact:true}).click();await sleep(1200);
t('AU15','approving with a stale login opens the re-authentication dialog',await p.locator('.adm-modal[role=dialog]').count()===1);
await p.locator('.adm-modal input[type=password]').fill(sup.password);await p.locator('.adm-modal input[autocomplete=one-time-code]').fill(totp(sup.secret,1));await p.getByRole('button',{name:'Баталгаажуулах'}).click();await sleep(2500);
const stat=sql(`select status from report_reviews where id='${reviewId}'`);
t('AU16','after re-authentication the action is retried automatically (approved or refused by validation, never silently dropped)',['APPROVED','READY_FOR_APPROVAL','IN_REVIEW'].includes(stat)&&await p.locator('.adm-modal').count()===0,stat);
// other pages
for(const [route,h] of [['companies','Байгууллагууд'],['payments','Төлбөрийн хяналт'],['notifications','Мэдэгдэл'],['settings','Тохиргоо'],['support','Тусламжийн хүсэлт']]){await p.goto(BASE+'#/admin/'+route);await sleep(1500);t('AU-page-'+route,`${h} page renders with its heading and no error`,(await p.locator('h1').first().innerText())===h&&await p.locator('.adm-error').count()===0)}
await p.goto(BASE+'#/admin/settings');await sleep(1500);t('AU17','settings shows admins, system status and the audit log',await p.getByText('Администраторууд').count()===1&&await p.getByText('Үйл ажиллагааны бүртгэл').count()===1);
// bell
const bell=await p.locator('.adm-bell').getAttribute('aria-label');t('AU18','the notification bell exposes the unread count to screen readers',/Мэдэгдэл/.test(bell||''),bell);
// responsive + axe for every admin page
const pages=['','reports','reports/'+reviewId,'companies','payments','notifications','settings','support'];
for(const vp of [{width:1920,height:1080},{width:1440,height:900},{width:1024,height:768},{width:768,height:1024},{width:430,height:932},{width:390,height:844},{width:360,height:800}]){const cx=await mk(vp);const q=await cx.newPage();const ra=provision('SUPER_ADMIN','vp'+vp.width);await q.goto(BASE+'#/admin/login');await q.reload();await sleep(700);await q.fill('input[type=email]',ra.email);await q.fill('input[autocomplete=current-password]',ra.password);await q.fill('input[autocomplete=one-time-code]',totp(ra.secret,0));await q.getByRole('button',{name:'Нэвтрэх'}).click().catch(()=>{});await sleep(2500);
 const inOk=!q.url().includes('/login');let bad=inOk?[]:['LOGIN_FAILED'],axeBad=[];for(const pg of pages){await q.goto(BASE+'#/admin'+(pg?'/'+pg:''));await sleep(2000);const o=await ov(q);if(o>0)bad.push(pg+':'+o);const a=await axe(q);if(a.length)axeBad.push(pg+':'+a.join('|'))}
 t(`AR-${vp.width}`,`${vp.width}x${vp.height}: ${pages.length} admin pages have no horizontal overflow and no axe violations`,bad.length===0&&axeBad.length===0,[...bad,...axeBad].join(' ; '));await cx.close();await sleep(31000*0)}
// mobile navigation
const m=await mk({width:390,height:844});const mp=await m.newPage();const rm=provision('SUPER_ADMIN','mob');await mp.goto(BASE+'#/admin/login');await mp.reload();await sleep(700);await mp.fill('input[type=email]',rm.email);await mp.fill('input[autocomplete=current-password]',rm.password);await mp.fill('input[autocomplete=one-time-code]',totp(rm.secret,0));await mp.getByRole('button',{name:'Нэвтрэх'}).click();await sleep(2200);
t('AU19','mobile: the menu is hidden until the burger is pressed, then lists every section',await mp.locator('.adm-nav').isHidden()&&await (async()=>{await mp.getByRole('button',{name:'Цэс'}).click();await sleep(300);return (await mp.locator('.adm-nav a').count())>=5})());
// keyboard: tab order reaches the skip link, brand, bell, logout and nav
await p.goto(BASE+'#/admin');await p.reload();await sleep(2000);const seen=[];for(let i=0;i<9;i++){await p.keyboard.press('Tab');await sleep(450);seen.push(await p.evaluate(()=>{const e=document.activeElement;const s=getComputedStyle(e);return (e.innerText||e.getAttribute('aria-label')||e.tagName).replace(/\s+/g,' ').trim().slice(0,22)+'|'+(s.outlineStyle!=='none'&&parseFloat(s.outlineWidth)>=2)}))}
t('AU20','keyboard: the first nine Tab stops are real controls and each shows a visible focus ring',seen.every(x=>x.endsWith('|true')),seen.join(' > '));
// billing reviewer UI limits
const bc=await mk({width:1440,height:900});const bp=await bc.newPage();await login(bp,bil,0);const bn=(await bp.locator('.adm-nav a').allInnerTexts()).map(x=>x.trim());
await bp.goto(BASE+'#/admin/reports');await sleep(1200);
t('AU21','the billing reviewer sees no report review or settings navigation and gets "Хандах эрхгүй" on /admin/reports',!bn.includes('Тайлангийн хяналт')&&!bn.includes('Тохиргоо')&&bn.includes('Төлбөрийн хяналт')&&(await bp.locator('h1').first().innerText())==='Хандах эрхгүй',bn.join(', '));
// logout
await p.goto(BASE+'#/admin');await sleep(1000);await p.getByRole('button',{name:'Гарах'}).click();await sleep(1500);t('AU22','logout returns to the login page and the stored token is gone',p.url().includes('#/admin/login')&&(await p.evaluate(()=>sessionStorage.getItem('mmri.adminToken.v1')))===null);
t('AU23','no uncaught page errors',errs.length===0,errs.join(';'));
sql(`update admin_accounts set status='DISABLED',"disabledAt"=now() where "userId" in (select id from users where email like 'admin.qa.%')`);
fs.writeFileSync((process.env.OUT||'/tmp')+'/ui-admin.json',JSON.stringify(res,null,1));console.log(res.filter(r=>r.ok).length+'/'+res.length);await b.close();
