/* Static/contract regression for the 2026-11-06 source-audit repairs.  Run from the repo root:
   node qa/audit-fix-static.mjs [options.tsv]     (options.tsv = id,optionIndex,state,score,label export of question_options; enables the corpus check) */
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';
const rd=p=>fs.readFileSync(p,'utf8');let fail=0;const t=(id,n,ok,d='')=>{if(!ok)fail++;console.log((ok?'PASS ':'FAIL ')+id+' '+n+(d?' | '+d:''))};
const css=['frontend/src/design/prism.css','frontend/src/design/holo.css','frontend/src/components/forms.css','frontend/src/components/components.css','frontend/src/pages/questionnaire.css'];
// A1: one owner for answer-card tone rules
const owners=css.filter(f=>/radio-group \.mmri-radio-card\{--ac|has-score-tone/.test(rd(f)));
t('A1-1','answer-card tone contract has exactly one owner (questionnaire.css)',owners.length===1&&owners[0].endsWith('questionnaire.css'),owners.join(','));
t('A1-2','no competing .is-selected shadow for radio cards in holo.css',!/mmri-radio-card\.is-selected\{/.test(rd('frontend/src/design/holo.css')));
// A3
const forms=rd('frontend/src/components/forms.css');
t('A3-1','autofill rule: dark ink on white inset, no navy/white-text remnant',/-webkit-autofill[^{]*\{[^}]*-webkit-text-fill-color:var\(--wp-ink/.test(forms)&&!/-webkit-text-fill-color:#fff/.test(forms)&&!/rgba\(60,70,200/.test(forms));
// A4/A6
const bill=rd('frontend/src/pages/Billing.tsx'),ft=rd('frontend/src/api/types.ts');
t('A4-1','no pseudo-random placeholder QR remains',!/PlaceholderCode/.test(bill)&&!/charCodeAt\(0\);h=Math\.imul/.test(bill));
t('A4-2','QR is generated from provider payload via qrcode-generator; MOCK payload is never rendered as payable',/from 'qrcode-generator'/.test(bill)&&/invoice\.provider==='MOCK'\|\|!text/.test(bill));
const be=rd('backend/src/billing/types.ts'),bs=rd('backend/prisma/schema.prisma');
const beProv=(be.match(/ProviderName="([^;]+)";/)||[])[1].split('|').map(x=>x.replace(/"/g,'').trim()).sort().join(',');
const feProv=(ft.match(/BillingProvider='([^;]+)';/)||[])[1].split('|').map(x=>x.replace(/'/g,'').trim()).sort().join(',');
t('A6-1','frontend provider union equals backend ProviderName',beProv===feProv,`${feProv} vs ${beProv}`);
const enumBody=(bs.match(/enum BillingInvoiceStatus\s*\{([^}]+)\}/)||[])[1]||'';const beSt=enumBody.split(/\s+/).filter(Boolean).sort().join(',');
const feSt=(ft.match(/BillingInvoiceStatus='([^;]+)';/)||[])[1].split('|').map(x=>x.replace(/'/g,'').trim()).sort().join(',');
t('A6-2','frontend invoice status union equals the database enum',beSt===feSt,`${feSt} vs ${beSt}`);
t('A6-3','manualMode is part of the frontend invoice DTO',/manualMode:boolean/.test(ft));
// A7
const srv=rd('backend/src/api/server.ts'),login=rd('frontend/src/pages/Login.tsx');
t('A7-1','API binds to loopback unless production/API_HOST',/\?"0\.0\.0\.0":"127\.0\.0\.1"/.test(srv)&&!/server\.listen\(config\.port,"0\.0\.0\.0"/.test(srv));
t('A7-2','demo-credential button needs the dev flag VITE_MMRI_SHOW_DEMO_LOGIN',/import\.meta\.env\.VITE_MMRI_SHOW_DEMO_LOGIN==='true'/.test(login));
t('A7-3','public tunnel script refuses without explicit staging acknowledgement',/MMRI_PUBLIC_PREVIEW_ACK/.test(rd('PUBLISH_TEMPORARY_LINUX.sh')));
t('A7-4','demo seed refuses production',/REFUSING: the demo company/.test(rd('backend/src/seed-demo-company.ts')));
t('O1','dev Vite origins 5173-5176 are added only when environment !== production',/if\(environment!=="production"\)for\(const port of \[5173,5174,5175,5176\]\)/.test(rd('backend/src/api/config.ts')));
// A5: no real mail provider exists; this stays a recorded release blocker (do not fake delivery)
const mailer=rd('backend/src/api/mail/mailer.ts');t('A5-1','mail providers are still only mock|disabled (release blocker stays open)',!/smtp|sendgrid|resend|postmark|ses\b/i.test(mailer));
// A2/A8 on the real corpus
const tsv=process.argv[2];
const require=createRequire(path.resolve('frontend/package.json'));const {build}=require('esbuild');const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'af-'));
await build({entryPoints:['frontend/src/data/answerTone.ts'],bundle:true,format:'esm',outfile:tmp+'/t.mjs',logLevel:'error'});const T=await import(tmp+'/t.mjs');
// unit: unknown order must never be guessed
const unk=T.buildAnswerLayout([{optionIndex:1,labelMn:'a',state:'FOO',score:null},{optionIndex:2,labelMn:'b',state:'BAR',score:null},{optionIndex:3,labelMn:'c',state:'BAZ',score:null}]);
t('A2-1','options of unknown order keep the listed order and get no quality colour',unk.main.map(x=>x.option.optionIndex).join()==='1,2,3'&&unk.main.every(x=>x.quality===null));
const exp=T.buildAnswerLayout([{optionIndex:1,labelMn:'a',state:'FOO'},{optionIndex:2,labelMn:'b',state:'BAR'}],'WORST_FIRST');
t('A2-2','explicit WORST_FIRST reverses and colours; BEST_FIRST keeps',exp.main[0].option.optionIndex===2&&exp.main[0].quality===1&&T.buildAnswerLayout([{optionIndex:1,labelMn:'a',state:'FOO'},{optionIndex:2,labelMn:'b',state:'BAR'}],'BEST_FIRST').main[0].option.optionIndex===1);
const demo=T.buildDemoAnswerLayout({options:['Сайн','Дунд','Муу','Мэдэхгүй'],scores:[100,50,0,null],states:['SCORED','SCORED','SCORED','DNK'],answerDirection:'SCORE_HIGH_BEST'});
t('A8-1','demo questions use the production layout (scored order, neutral DNK in the special group)',demo.main.map(x=>x.option.labelMn).join()==='Сайн,Дунд,Муу'&&demo.special.length===1&&demo.main[0].quality===1&&demo.main[2].quality===0);
// Applicability gate: the lone affirmative answer is green, its "no / unknown" alternatives stay neutral, and option order never changes colours
const gate=T.buildAnswerLayout([{optionIndex:0,labelMn:'Тийм, хамаарна.',state:'UNAVAILABLE',score:null},{optionIndex:1,labelMn:'Үгүй, манай байгууллагад энэ чиглэл хамаарахгүй.',state:'N_A_CLAIM',score:null},{optionIndex:2,labelMn:'Мэдэхгүй, баттай хариулж чадахгүй.',state:'DNK',score:null}]);
t('G1','applicability gate: "Тийм, хамаарна." is green (quality 1), the other two are neutral special',gate.main.length===1&&gate.main[0].quality===1&&gate.main[0].role==='affirmative'&&gate.special.length===2&&gate.special.every(x=>x.quality===null));
const sc=[0,25,50,75,100].map((v,i)=>({optionIndex:i,labelMn:'o'+i,state:'SCORED',score:v}));const colourOf=l=>Object.fromEntries(l.main.map(x=>[x.option.optionIndex,x.quality]));
const base=colourOf(T.buildAnswerLayout(sc));let stable=true;for(let k=0;k<20;k++){const sh=[...sc].sort(()=>Math.random()-.5);const c=colourOf(T.buildAnswerLayout(sh));for(const i in base)if(c[i]!==base[i])stable=false}
t('G2','shuffling / reversing scored options never changes an option\'s colour quality',stable);
const two=T.buildAnswerLayout([{optionIndex:0,labelMn:'Тийм',state:'SCORED',score:0},{optionIndex:1,labelMn:'Үгүй',state:'SCORED',score:100}]);
t('G3','two scored options: polarity comes from the score (Yes with score 0 is red, No with 100 is green)',two.main[0].option.labelMn==='Үгүй'&&two.main[0].quality===1&&two.main[1].quality===0);
if(tsv){const q=new Map();for(const l of rd(tsv).split('\n')){if(!l)continue;const [id,idx,state,score,label]=l.split('\t');if(!q.has(id))q.set(id,[]);q.get(id).push({optionIndex:+idx,state,score:score===''?null:+score,labelMn:label})}
 let guessed=0,mixedDirection=0,total=0;
 for(const [,o] of q){total++;const roles=T.classifyOptions(o);const rows=o.filter(x=>roles.get(x.optionIndex)==='graded');if(rows.length<2)continue;
  const byScore=rows.every(x=>typeof x.score==='number'),bySem=rows.every(x=>typeof T.semanticAnswerRank(x.state)==='number'),unav=rows.every(x=>x.state.toUpperCase()==='UNAVAILABLE');
  if(!byScore&&!bySem&&!unav)guessed++;
  if(byScore){const l=T.buildAnswerLayout(o);const g=l.main.filter(x=>x.role==='graded');for(let i=1;i<g.length;i++)if(g[i].quality>g[i-1].quality)mixedDirection++}}
 t('A2-3',`corpus: ${total} questions, none depends on a guessed order`,guessed===0,`guessed=${guessed}`);
 t('A2-4','corpus: scored questions are always listed best to worst with falling quality',mixedDirection===0,`violations=${mixedDirection}`)}
else console.log('NOTE corpus checks skipped (no options.tsv given)');
console.log(fail?`FAILED ${fail}`:'ALL PASS');process.exit(fail?1:0);
