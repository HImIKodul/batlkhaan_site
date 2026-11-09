import type React from 'react';

const neutralPattern=/мэдэхгүй|хамаарахгүй|мэдээлэх боломжгүй|мэдээлэл алга|хариулах мэдээлэл алга|шалгаагүй|тодорхойгүй/i;
const neutralStates=new Set(['DNK','N_A','N_A_CLAIM','UNAVAILABLE','UNKNOWN','NOT_APPLICABLE','NEUTRAL']);

type OptionLike={optionIndex:number;labelMn:string;state?:string|null;score?:number|null};
const alwaysNeutralStates=new Set(['DNK','N_A','N_A_CLAIM','UNKNOWN','NOT_APPLICABLE','NEUTRAL']);
export type OptionRole='graded'|'affirmative'|'neutral-main'|'special';
/**
 * Structural classification of one question's options (verified against all 17 option structures of the 61,440 live questions).
 *  - DNK / N/A / unknown states are always "special" (neutral gray, listed under the "cannot answer" heading).
 *  - UNAVAILABLE is the import state of options that carry no numeric score. When there are two or more of them and no other graded state exists
 *    (about 28,000 evidence/record questions) they are an ordered graded scale, listed best first, and are coloured by position.
 *    A lone UNAVAILABLE option next to only DNK / N/A choices is the affirmative applicability answer ("Тийм, хамаарна", 4,096 live questions): it is the one substantive answer and shows the best (green) tone; the "no, does not apply" and "unknown" alternatives stay neutral gray. An UNAVAILABLE option that sits next to other graded states (benchmark "no data") is a neutral special choice.
 *  - Label wording is only a fallback for options whose state is not informative; it is NOT used for UNAVAILABLE scales, otherwise a real answer such as
 *    "Not tested" would be mistaken for "unknown".
 */
export function classifyOptions(options:OptionLike[]):Map<number,OptionRole>{
 const st=(o:OptionLike)=>String(o.state||'').toUpperCase();
 const unav=options.filter(o=>st(o)==='UNAVAILABLE');
 const otherGraded=options.some(o=>{const x=st(o);return x!=='UNAVAILABLE'&&!alwaysNeutralStates.has(x)&&!neutralPattern.test(o.labelMn||'')});
 const unavailableIsScale=unav.length>=2&&!otherGraded;
 const out=new Map<number,OptionRole>();
 for(const o of options){
  const x=st(o);
  if(alwaysNeutralStates.has(x))out.set(o.optionIndex,'special');
  else if(x==='UNAVAILABLE')out.set(o.optionIndex,unavailableIsScale?'graded':unav.length===1&&!otherGraded?'affirmative':'special');
  else out.set(o.optionIndex,neutralPattern.test(o.labelMn||'')?'special':'graded');
 }
 return out;
}
export function isNeutralAnswer(label:string,state?:string|null){
 return neutralPattern.test(label||'')||neutralStates.has(String(state||'').toUpperCase());
}

const semanticRanks:Record<string,number>={
 APPLICABLE:100,MOSTLY_APPLICABLE:67,PARTIAL_APPLICABILITY:33,
 TREND_IMPROVING:100,TREND_STABLE:50,TREND_DECLINING:0,
 BENCHMARK_FAR_ABOVE:100,BENCHMARK_SLIGHTLY_ABOVE:75,BENCHMARK_NEAR:50,BENCHMARK_SLIGHTLY_BELOW:25,BENCHMARK_FAR_BELOW:0,
 FULLY_IMPLEMENTED:100,IMPLEMENTED:100,MOSTLY_IMPLEMENTED:75,PARTIALLY_IMPLEMENTED:50,EARLY_STAGE:25,NOT_IMPLEMENTED:0,
 YES:100,TRUE:100,PARTIAL:50,NO:0,FALSE:0,
};
export function semanticAnswerRank(state?:string|null){
 const key=String(state||'').toUpperCase();
 return Object.prototype.hasOwnProperty.call(semanticRanks,key)?semanticRanks[key]:null;
}

function clamp01(value:number){
 if(!Number.isFinite(value))return .5;
 return Math.max(0,Math.min(1,value));
}
function lerp(a:number,b:number,t:number){return Math.round(a+(b-a)*t)}
function mix(a:number[],b:number[],t:number){return a.map((value,index)=>lerp(value,b[index],t))}

/*
 * R17.21.4 / Step 03
 * One continuous semantic scale for every scored answer count:
 *   quality 1.00 -> green
 *   quality 0.75 -> exact green/yellow midpoint
 *   quality 0.50 -> yellow
 *   quality 0.25 -> exact yellow/red midpoint
 *   quality 0.00 -> red
 *
 * With four choices the normalized qualities are 1, 2/3, 1/3, 0, so the
 * two middle choices naturally become green-yellow and yellow-red mixtures.
 * Scored questions use their real normalized score rather than nth-child.
 */
const GREEN=[25,134,95];
const YELLOW=[211,177,0];
const RED=[198,62,50];
const GREEN_SOFT=[239,249,244];
const YELLOW_SOFT=[255,251,232];
const RED_SOFT=[255,243,241];

/* Visual only: how much of the tone colour the answer card fill may carry. The fill mixes the tone with vivid blue, and white text on it must stay >= 4.8:1,
   so saturated tones (green, red, orange) get a stronger share than the yellow midpoint. Never used for scoring or ordering. */
/* Each card's dark end is a shade of its OWN hue (plus a little sapphire), so a green answer stays green instead of fading to blue. The shade is darkened only as far as the label needs: the card also carries a white gloss (about 14 percent white where the label sits) and a specular streak, so the check blends 16 percent white into the fill and demands 5.3:1; measured in Chrome on real pixels this keeps every label above 4.5:1. */
const lin=(v:number)=>{const c=v/255;return c<=.03928?c/12.92:Math.pow((c+.055)/1.055,2.4)};
const lum=(c:number[])=>.2126*lin(c[0])+.7152*lin(c[1])+.0722*lin(c[2]);
const cardDeep=(c:number[],s:number)=>c.map((v,i)=>Math.round(v*s+[0,10,60][i]*.2));
const labelOk=(m:number[])=>1.05/(lum(m.map(v=>v*.84+255*.16))+.05)>=5.3;
function cardShade(color:number[]){
 for(const s of [.62,.5,.4,.3,.22,.14]){const d=cardDeep(color,s);
  for(let p=90;p>=40;p-=2){if(labelOk(color.map((v,i)=>v*p/100+d[i]*(1-p/100))))return {mix:p,deep:d}}}
 return {mix:40,deep:cardDeep(color,.1)}}
export function answerToneAtQuality(quality:number){
 const q=clamp01(quality);
 let color:number[];
 let soft:number[];
 if(q>=.5){
  const local=(q-.5)/.5;
  color=mix(YELLOW,GREEN,local);
  soft=mix(YELLOW_SOFT,GREEN_SOFT,local);
 }else{
  const local=q/.5;
  color=mix(RED,YELLOW,local);
  soft=mix(RED_SOFT,YELLOW_SOFT,local);
 }
 return {color:`rgb(${color.join(' ')})`,soft:`rgb(${soft.join(' ')})`,...(()=>{const c=cardShade(color);return {mix:c.mix,deep:`rgb(${c.deep.join(' ')})`}})()};
}

function answerStyleFromQuality(quality:number):React.CSSProperties{
 const {color,soft,mix,deep}=answerToneAtQuality(quality);
 return {'--answer-color':color,'--answer-soft':soft,'--answer-mix':mix,'--answer-deep':deep} as React.CSSProperties;
}

export function scoredAnswerStyle(score:number,min:number,max:number):React.CSSProperties{
 if(!Number.isFinite(score)||!Number.isFinite(min)||!Number.isFinite(max))return answerStyleFromQuality(.5);
 // Equal score values genuinely carry no better/worse distinction, so all use
 // the neutral centre of the scored scale instead of inventing an ordering.
 const quality=max>min?(score-min)/(max-min):.5;
 return answerStyleFromQuality(quality);
}

export function positionalAnswerStyle(index:number,count:number,bestFirst=true):React.CSSProperties{
 const safeCount=Math.max(1,Math.floor(Number.isFinite(count)?count:1));
 const safeIndex=Math.max(0,Math.min(safeCount-1,Math.floor(Number.isFinite(index)?index:0)));
 const quality=safeCount<=1?.5:(bestFirst?1-safeIndex/(safeCount-1):safeIndex/(safeCount-1));
 return answerStyleFromQuality(quality);
}

export type LayoutOption<T extends OptionLike>={option:T;role:'graded'|'affirmative'|'neutral-main'|'special';quality:number|null};
/** Direction in which the options of a question are listed when neither scores nor state semantics determine the order (never guessed). */
export type ListedOrder='BEST_FIRST'|'WORST_FIRST';
/**
 * The single source of truth for how a question's answers are ordered and coloured (questionnaire AND demo; tested against the live question banks).
 * main    : graded options best first, each with its quality 0..1 (score-normalised when scores exist, otherwise semantic state rank, otherwise listed position),
 *           plus the lone affirmative applicability answer (quality 1 = green), plus options of unknown order (no colour).
 * special : DNK / N/A / unknown, always neutral gray.
 * Order is derived only from (1) numeric scores, (2) known semantic states, (3) an all-UNAVAILABLE scale (listed best first), (4) an explicit `listedOrder`.
 * When none applies the options are NOT reordered and NOT given a quality colour (neutral), instead of guessing a direction.
 */
export function buildAnswerLayout<T extends OptionLike>(options:T[],listedOrder?:ListedOrder):{main:LayoutOption<T>[];special:LayoutOption<T>[]}{
 const roles=classifyOptions(options);
 const special=options.filter(o=>roles.get(o.optionIndex)==='special').map(option=>({option,role:'special' as const,quality:null}));
 const rest=options.filter(o=>roles.get(o.optionIndex)!=='special');
 const affirmative:LayoutOption<T>[]=rest.filter(o=>roles.get(o.optionIndex)==='affirmative').map(option=>({option,role:'affirmative' as const,quality:1}));
 const neutralMain:LayoutOption<T>[]=[];
 let rows=rest.filter(o=>roles.get(o.optionIndex)==='graded');
 if(rows.length>1){
  if(rows.every(o=>typeof o.score==='number'))rows=[...rows].sort((a,b)=>Number(b.score)-Number(a.score));
  else{const ranked=rows.map(o=>semanticAnswerRank(o.state));
   if(ranked.every(v=>typeof v==='number'))rows=[...rows].sort((a,b)=>Number(semanticAnswerRank(b.state))-Number(semanticAnswerRank(a.state)));
   else if(rows.every(o=>String(o.state||'').toUpperCase()==='UNAVAILABLE')||listedOrder==='BEST_FIRST')rows=[...rows];   // ordered scale: listed best first
   else if(listedOrder==='WORST_FIRST')rows=[...rows].reverse();
   else{neutralMain.unshift(...rows.map(option=>({option,role:'neutral-main' as const,quality:null})));rows=[]}}          // unknown direction: keep listed order, no quality colour
 }
 const scored=rows.filter(o=>typeof o.score==='number').map(o=>Number(o.score));const min=scored.length?Math.min(...scored):0,max=scored.length?Math.max(...scored):0;
 const graded=rows.map((option,i)=>({option,role:'graded' as const,quality:typeof option.score==='number'?(max>min?(Number(option.score)-min)/(max-min):.5):rows.length<=1?.5:1-i/(rows.length-1)}));
 return {main:[...affirmative,...graded,...neutralMain],special};
}

/** Demo (test-business) questions: same layout contract as the live questionnaire. `answerDirection` only decides the listed order when scores/states cannot. */
export type DemoQuestionLike={options:string[];states?:string[]|null;scores?:(number|null)[]|null;answerDirection?:string|null};
export function buildDemoAnswerLayout(q:DemoQuestionLike){
 const options=q.options.map((labelMn,optionIndex)=>({optionIndex,labelMn,state:q.states?.[optionIndex]??null,score:typeof q.scores?.[optionIndex]==='number'?Number(q.scores[optionIndex]):null}));
 const dir=String(q.answerDirection||'').toUpperCase();
 return buildAnswerLayout(options,dir==='WORST_TO_BEST'?'WORST_FIRST':dir==='BEST_TO_WORST'||dir==='SCORE_HIGH_BEST'?'BEST_FIRST':undefined);
}
