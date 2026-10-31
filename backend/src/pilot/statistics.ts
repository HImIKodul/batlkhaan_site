export interface NumericPair { x:number; y:number; }

export function mean(values:number[]):number|null {
  return values.length ? values.reduce((a,b)=>a+b,0)/values.length : null;
}
export function median(values:number[]):number|null {
  if(!values.length)return null;
  const s=[...values].sort((a,b)=>a-b), m=Math.floor(s.length/2);
  return s.length%2?s[m]!:(s[m-1]!+s[m]!)/2;
}
export function percentile(values:number[],p:number):number|null {
  if(!values.length)return null;
  const s=[...values].sort((a,b)=>a-b), x=Math.min(1,Math.max(0,p))*(s.length-1), lo=Math.floor(x), hi=Math.ceil(x);
  if(lo===hi)return s[lo]!;
  return s[lo]!+(s[hi]!-s[lo]!)*(x-lo);
}
export function pearson(pairs:NumericPair[]):number|null {
  if(pairs.length<2)return null;
  const mx=mean(pairs.map(p=>p.x))!, my=mean(pairs.map(p=>p.y))!;
  let num=0,dx=0,dy=0;
  for(const p of pairs){const a=p.x-mx,b=p.y-my;num+=a*b;dx+=a*a;dy+=b*b;}
  const den=Math.sqrt(dx*dy); return den===0?null:num/den;
}
export function meanAbsoluteDifference(pairs:NumericPair[]):number|null {
  return mean(pairs.map(p=>Math.abs(p.x-p.y)));
}
export function rmse(pairs:NumericPair[]):number|null {
  const m=mean(pairs.map(p=>(p.x-p.y)**2)); return m===null?null:Math.sqrt(m);
}
export function wilsonInterval(successes:number,total:number,z=1.959963984540054):{low:number;high:number}|null {
  if(total<=0)return null;
  const phat=successes/total, z2=z*z, denom=1+z2/total;
  const center=(phat+z2/(2*total))/denom;
  const half=(z*Math.sqrt((phat*(1-phat)+z2/(4*total))/total))/denom;
  return {low:Math.max(0,center-half),high:Math.min(1,center+half)};
}
export function pairMetricSummary(pairs:NumericPair[]){
  const diffs=pairs.map(p=>Math.abs(p.x-p.y));
  return {n:pairs.length,meanAbsoluteDifference:mean(diffs),medianAbsoluteDifference:median(diffs),p95AbsoluteDifference:percentile(diffs,.95),rmse:rmse(pairs),pearson:pearson(pairs)};
}
export function confidenceAgreementBins(rows:Array<{confidence:number;difference:number}>){
  const defs=[{name:'LOW',min:0,max:.5},{name:'MEDIUM',min:.5,max:.75},{name:'HIGH',min:.75,max:1.000001}];
  return defs.map(d=>{const x=rows.filter(r=>r.confidence>=d.min&&r.confidence<d.max);return {band:d.name,n:x.length,meanConfidence:mean(x.map(r=>r.confidence)),meanAbsoluteDifference:mean(x.map(r=>r.difference)),meanObservedAgreement:mean(x.map(r=>Math.max(0,1-r.difference/100)))};});
}
