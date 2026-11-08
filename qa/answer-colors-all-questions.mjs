/* Verifies the answer colour rules against EVERY question of the live five-domain banks (61,440).
   Data export: see the psql command in docs (ANSWER_COLOR_RULES). Usage: node qa/answer-colors-all-questions.mjs <options.tsv>  (run from the repo root; needs frontend/node_modules/esbuild). */
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';
const require=createRequire(path.resolve('frontend/package.json'));const {build}=require('esbuild');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-'));await build({entryPoints:['frontend/src/data/answerTone.ts'],bundle:true,format:'esm',outfile:tmp+'/t.mjs',logLevel:'error'});
const T=await import(tmp+'/t.mjs');
const q=new Map();for(const line of fs.readFileSync(process.argv[2],'utf8').split('\n')){if(!line)continue;const [id,idx,state,score,label]=line.split('\t');if(!q.has(id))q.set(id,[]);q.get(id).push({optionIndex:+idx,state,score:score===''?null:+score,labelMn:label})}
const rgb=c=>c.match(/\d+/g).map(Number);const hue=([r,g,b])=>{r/=255;g/=255;b/=255;const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;if(!d)return 0;let h=mx===r?((g-b)/d)%6:mx===g?(b-r)/d+2:(r-g)/d+4;h*=60;return h<0?h+360:h};
const fam=h=>h<18?'red':h<42?'orange':h<58?'yellow':h<110?'yellow-green':'green';
const expected={5:['green','yellow-green','yellow','orange','red'],4:['green','yellow-green','orange','red'],3:['green','yellow','red'],2:['green','red']};
let fail=0;const bad=(id,m)=>{fail++;if(fail<=12)console.log('FAIL',id,m)};const stats={questions:q.size,gradedCounts:{},specialOnlyQuestions:0,neutralMain:0,unavailableScales:0,positionalOnly:0,equalScores:0,familyChecked:0};
for(const [id,opts] of q){
 const {main,special}=T.buildAnswerLayout(opts);
 for(const o of opts){if(['DNK','N_A_CLAIM','N_A','UNKNOWN','NOT_APPLICABLE'].includes(o.state)&&!special.some(x=>x.option===o))bad(id,'neutral state option is not in the neutral group: '+o.state)}
 if(special.some(x=>x.quality!==null))bad(id,'neutral option carries a quality colour');
 const graded=main.filter(x=>x.role==='graded');
 if(main.length===0&&opts.some(o=>!['DNK','N_A_CLAIM'].includes(o.state)))bad(id,'every answer would render gray');
 if(main.length===0)stats.specialOnlyQuestions++;
 stats.gradedCounts[graded.length]=(stats.gradedCounts[graded.length]||0)+1;if(main.some(x=>x.role==='neutral-main'))stats.neutralMain++;
 if(graded.length>=2&&graded.every(x=>String(x.option.state).toUpperCase()==='UNAVAILABLE'))stats.unavailableScales++;
 const scored=graded.filter(x=>typeof x.option.score==='number');
 if(scored.length===graded.length&&graded.length>1){
  for(let i=1;i<graded.length;i++){if(graded[i].option.score>graded[i-1].option.score)bad(id,'higher score listed after a lower one');if(graded[i].option.score<graded[i-1].option.score&&!(graded[i].quality<graded[i-1].quality))bad(id,'lower score is not less favourable in colour')}
  if(new Set(graded.map(x=>x.option.score)).size===1){stats.equalScores++}
 }else if(graded.length>1&&graded.every(x=>typeof x.option.score!=='number'))stats.positionalOnly++;
 if(graded.length>=2&&graded.length<=5){stats.familyChecked++;const fams=graded.map(x=>fam(hue(rgb(T.answerToneAtQuality(x.quality).color))));if(JSON.stringify(fams)!==JSON.stringify(expected[graded.length]))bad(id,`colour families ${fams} != ${expected[graded.length]}`)}
}
console.log(JSON.stringify(stats));console.log(fail?`FAILED ${fail}`:'ALL PASS');process.exit(fail?1:0);
