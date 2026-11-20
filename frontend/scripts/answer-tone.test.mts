/* Unit test for the answer colour progression (best answer green at the top, worst red at the bottom). Run: cd backend && npx tsx ../../../10_INTEGRATED_FRONTEND/frontend/scripts/answer-tone.test.mts */
import {answerToneAtQuality,scoredAnswerStyle,isNeutralAnswer,buildAnswerLayout} from '../src/data/answerTone.ts';
let p=0,q=0;const t=(n:string,ok:boolean,d='')=>{ok?p++:q++;console.log((ok?'PASS ':'FAIL ')+n+(d?' | '+d:''))};
const rgb=(s:string)=>s.match(/\d+/g)!.map(Number);
const hue=(c:number[])=>{const [r,g,b]=c.map(v=>v/255);const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;if(!d)return 0;let h=mx===r?((g-b)/d)%6:mx===g?(b-r)/d+2:(r-g)/d+4;h*=60;h=h<0?h+360:h;return h>180?h-360:h};
const hues=(n:number)=>Array.from({length:n},(_,i)=>Math.round(hue(rgb(answerToneAtQuality(1-i/(n-1)).color))));
const in_=(v:number,lo:number,hi:number)=>v>=lo&&v<=hi;
const h5=hues(5),h4=hues(4),h3=hues(3),h2=hues(2);
t('five answers: green, yellow-green, yellow, orange, red (top to bottom)',in_(h5[0],120,165)&&in_(h5[1],65,100)&&in_(h5[2],42,58)&&in_(h5[3],20,36)&&in_(h5[4],-1,10),h5.join(' > '));
t('four answers: green, yellow-green, orange-yellow, red',in_(h4[0],120,165)&&in_(h4[1],62,105)&&in_(h4[2],26,50)&&in_(h4[3],-1,10),h4.join(' > '));
t('three answers: green, yellow, red',in_(h3[0],120,165)&&in_(h3[1],42,58)&&in_(h3[2],-1,10),h3.join(' > '));
t('two answers: green and red',in_(h2[0],120,165)&&in_(h2[1],-1,10),h2.join(' > '));
for(const [n,h] of [[5,h5],[4,h4],[3,h3]] as const)t(`${n} answers: hue falls strictly from green to red with clearly different neighbours (>= 14 degrees)`,h.every((v,i)=>i===0||h[i-1]-v>=14),h.join(' > '));
const sc=[3,2,1,0].map(s=>hue(rgb((scoredAnswerStyle(s,0,3) as any)['--answer-color'])));
t('real scores 3,2,1,0 give the four-answer progression (score drives colour, not position)',sc.every((v,i)=>i===0||sc[i-1]>v)&&in_(sc[0],120,165)&&in_(sc[3],-1,10),sc.map(Math.round).join(' > '));
t('colours are rich, not pastel: every tone has strong saturation',[1,.75,.5,.25,0].every(x=>{const [r,g,b]=rgb(answerToneAtQuality(x).color);const mx=Math.max(r,g,b),mn=Math.min(r,g,b);return (mx-mn)/mx>=.6}));
const opts=[{optionIndex:1,labelMn:'Бүрэн',state:'UNAVAILABLE',score:null},{optionIndex:2,labelMn:'Хэсэгчлэн',state:'UNAVAILABLE',score:null},{optionIndex:3,labelMn:'Огт үгүй',state:'UNAVAILABLE',score:null},{optionIndex:4,labelMn:'Мэдэхгүй',state:'DNK',score:null}];
const lay=buildAnswerLayout(opts as any);
t('neutral "Мэдэхгүй" stays special/neutral (no scored colour) and order is preserved',lay.special.length===1&&lay.special[0].quality===null&&lay.main.map(x=>x.option.optionIndex).join(',')==='1,2,3'&&isNeutralAnswer('Мэдэхгүй','DNK'));
const ladder=[{optionIndex:1,labelMn:'Огт хамаарахгүй.',state:'N_A_CLAIM',score:null},{optionIndex:2,labelMn:'Зарим',state:'PARTIAL_APPLICABILITY',score:null},{optionIndex:3,labelMn:'Ихэнх',state:'MOSTLY_APPLICABLE',score:null},{optionIndex:4,labelMn:'Шууд',state:'APPLICABLE',score:null},{optionIndex:5,labelMn:'Мэдэхгүй',state:'DNK',score:null}];
const ll=buildAnswerLayout(ladder as any);const lh=ll.main.map(x=>Math.round(hue(rgb(answerToneAtQuality(x.quality as number).color))));
t('applicability ladder (4 answers incl. N_A_CLAIM): listed best first, order APPLICABLE > MOSTLY > PARTIAL > N_A',ll.main.map(x=>x.option.state).join()==='APPLICABLE,MOSTLY_APPLICABLE,PARTIAL_APPLICABILITY,N_A_CLAIM');
t('applicability ladder colours: green, yellow-green, orange-yellow, red; DNK neutral',in_(lh[0],120,165)&&in_(lh[1],62,105)&&in_(lh[2],26,50)&&in_(lh[3],-1,10)&&ll.special.length===1&&ll.special[0].option.state==='DNK',lh.join(' > '));
const lone=buildAnswerLayout([{optionIndex:1,labelMn:'Хамаарахгүй',state:'N_A_CLAIM',score:null},{optionIndex:2,labelMn:'Тийм',state:'SCORED',score:100},{optionIndex:3,labelMn:'Үгүй',state:'SCORED',score:0}] as any);
t('N_A_CLAIM without an applicability ladder stays neutral/special',lone.special.some(x=>x.option.state==='N_A_CLAIM'));
console.log(`RESULT pass=${p} fail=${q}`);process.exit(q?1:0)
