import type React from 'react';

const neutralPattern=/мэдэхгүй|хамаарахгүй|мэдээлэх боломжгүй|мэдээлэл алга|хариулах мэдээлэл алга|шалгаагүй|тодорхойгүй/i;
const neutralStates=new Set(['DNK','N_A','N_A_CLAIM','UNAVAILABLE','UNKNOWN','NOT_APPLICABLE','NEUTRAL']);

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
 return {color:`rgb(${color.join(' ')})`,soft:`rgb(${soft.join(' ')})`};
}

function answerStyleFromQuality(quality:number):React.CSSProperties{
 const {color,soft}=answerToneAtQuality(quality);
 return {'--answer-color':color,'--answer-soft':soft} as React.CSSProperties;
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
