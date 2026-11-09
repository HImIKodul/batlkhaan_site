/* 20-question company onboarding: save, reload, re-login persistence and failure recovery through the REAL UI.
   Run ONLY against an isolated stack with synthetic users. Env: PW=<playwright-core path> BASE=<frontend origin>/ (dev server proxying /api to the isolated backend)
   SHOT=<dir for screenshots, optional>. Exit code 1 on any failure. */
import {createRequire} from 'module';const require=createRequire(import.meta.url);const {chromium}=require(process.env.PW);
const BASE=process.env.BASE||'http://127.0.0.1:5310/',SHOT=process.env.SHOT||'';const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let fail=0;const t=(id,n,ok,d='')=>{if(!ok)fail++;console.log((ok?'PASS ':'FAIL ')+id+' '+n+(d?' | '+String(d).slice(0,220):''))};
const PW='Ui-Test-Pass-12345!';const email=`ui.onb.${Date.now()}@example.test`;
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
async function run(viewport,label){
  const ctx=await b.newContext({viewport});const p=await ctx.newPage();const puts=[];
  p.on('response',r=>{if(r.request().method()==='PUT'&&r.url().includes('/profile-answers'))puts.push(r.status())});
  const shot=async n=>{if(SHOT)await p.screenshot({path:`${SHOT}/${label}-${n}.png`})};
  const em=label+'.'+email;
  await p.goto(BASE+'#/login');await sleep(1000);
  await p.locator('.mmri-tabs button',{hasText:'Бүртгүүлэх'}).first().click();await p.fill('input[autocomplete=name]','Synthetic UI');await p.fill('input[type=email]',em);await p.fill('input[type=password]',PW);
  await p.click('button[type=submit]');await sleep(2200);
  await p.goto(BASE+'#/company');await sleep(1200);
  await p.fill('input[autocomplete=organization]','Синтетик Тест');await p.click('input[role=combobox]');await p.keyboard.type('ХХК');await sleep(300);await p.locator('[role=option]').first().click();
  await p.getByRole('button',{name:'Үргэлжлүүлэх'}).click();await sleep(1200);
  const chosen=[];
  // answer 1..19, then fail the final save twice (500, then network drop), then succeed
  for(let i=0;i<20;i++){
    const labels=p.locator('.profile-question-card .mmri-radio-card');const n=await labels.count();const pick=(i%Math.min(n,4));
    chosen.push(pick+1);await labels.nth(pick).click();await sleep(120);
    if(i<19){await p.getByRole('button',{name:'Дараагийн асуулт'}).click();await sleep(200)}
  }
  await shot('last-question');
  // 1) server error on save
  await p.route('**/profile-answers',r=>r.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:{code:'INTERNAL',message:'Internal error at db.query line 88 ECONNREFUSED'}})}));
  const finishBtn=p.getByRole('button',{name:/Хадгалаад дуусгах/}).last();
  await finishBtn.click();await sleep(1200);
  const alertText=await p.locator('[role=alert], .mmri-support-alert, .mmri-error, [class*=error]').allInnerTexts().then(a=>a.join(' ')).catch(()=>'');
  t(label+'-F1','server error does not show completion',!(await p.locator('h1').innerText()).includes('Байгууллагын мэдээлэл'),await p.locator('h1').innerText());
  t(label+'-F2','a visible Mongolian error explains the failure',/[А-Яа-яӨөҮү]{4}/.test(alertText)&&alertText.trim().length>10,alertText.slice(0,120));
  t(label+'-F3','no raw technical text (ECONNREFUSED/db.query/500/Internal) leaks to the customer',!/ECONNREFUSED|db\.query|Internal|INTERNAL|undefined|\[object/.test(await p.locator('body').innerText()));
  await shot('error-500');
  // 2) network failure
  await p.unroute('**/profile-answers');await p.route('**/profile-answers',r=>r.abort('connectionrefused'));
  await finishBtn.click();await sleep(1200);
  t(label+'-F4','network failure does not show completion',!(await p.locator('h1').innerText()).includes('Байгууллагын мэдээлэл'));
  const alert2=await p.locator('[role=alert], .mmri-support-alert, [class*=error]').allInnerTexts().then(a=>a.join(' ')).catch(()=>'');
  t(label+'-F5','network failure has a visible Mongolian error',/[А-Яа-яӨөҮү]{4}/.test(alert2)&&alert2.trim().length>10,alert2.slice(0,120));
  t(label+'-F6','selected answers survive the failure (draft kept)',(await p.locator('.profile-question-card .mmri-radio-card input:checked').count())===1);
  // 3) success, with a double click
  await p.unroute('**/profile-answers');const before=puts.length;
  await finishBtn.dblclick().catch(()=>finishBtn.click());await sleep(2200);
  t(label+'-S1','save succeeds and shows the completed state',(await p.locator('h1').innerText()).includes('Байгууллагын мэдээлэл'),await p.locator('h1').innerText());
  t(label+'-S2','double click sends exactly one successful save',puts.slice(before).filter(s=>s===200).length===1,puts.slice(before).join(','));
  await shot('saved');
  // 4) reload persistence
  await p.reload();await sleep(2200);
  t(label+'-P1','after reload the completed state is restored from the server',(await p.locator('h1').innerText()).includes('Байгууллагын мэдээлэл'));
  const sel=await p.locator('.company-detail-editor__grid label').count();t(label+'-P2','20 saved answers are shown',sel===20,sel);
  // 5) logout + login
  await ctx.clearCookies();await p.evaluate(()=>{sessionStorage.clear();localStorage.clear()});
  await p.goto(BASE+'#/login');await p.reload();await sleep(1000);
  await p.fill('input[type=email]',em);await p.fill('input[type=password]',PW);await p.click('button[type=submit]');await sleep(2500);
  await p.goto(BASE+'#/company');await sleep(2200);
  t(label+'-P3','after logging out and in the answers are still complete',(await p.locator('h1').innerText()).includes('Байгууллагын мэдээлэл')&&(await p.locator('.company-detail-editor__grid label').count())===20);
  const overflow=await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);t(label+'-L1','no horizontal overflow',!overflow);
  await ctx.close();
}
await run({width:1280,height:900},'desktop');
await run({width:390,height:844},'mobile');
await b.close();console.log(fail?`FAILED ${fail}`:'ALL PASS');process.exit(fail?1:0);
