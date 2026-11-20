/* Summarises the JSON records written by qa-diagnostic-matrix.mjs into the Phase A acceptance table (one row per domain x profile).
   Usage: node scripts/qa-diagnostic-matrix-summary.mjs <dir> [suffix]  -> prints a markdown table and writes <dir>/summary.json */
import fs from 'node:fs';import path from 'node:path';
const dir=process.argv[2],suffix=process.argv[3]||'base';if(!dir)throw new Error('usage: <dir> [suffix]');
const rows=[];
for(const f of fs.readdirSync(dir).filter(x=>x.endsWith(`_${suffix}.json`)&&!x.includes('verification')).sort()){
  const r=JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));if(!r.results)continue;
  const res=r.results,tr=r.trace||[],ev=res.evidence||{},caps=res.capabilities||res.categories||[];
  const ids=tr.map(x=>x.id),dupIds=ids.length-new Set(ids).size;
  const cnt=s=>tr.filter(x=>x.state===s).length;
  const scored=tr.filter(x=>typeof x.score==='number').length;
  const withEv=caps.filter(c=>(c.coverage??0)>0).length;
  const basis=l=>(l?.items||[]).reduce((m,x)=>{m[x.basis||'VALIDATED']=(m[x.basis||'VALIDATED']||0)+1;return m},{});
  const wk=(res.weaknesses?.items||[]);
  rows.push({domain:r.domain,profile:r.profile,methodology:res.methodologyVersion,asked:tr.length,duplicateQuestionIds:dupIds,scoredAnswers:scored,dnk:cnt('DNK'),naClaims:cnt('N_A_CLAIM'),
    score:res.overall.score,band:res.overall.band,confidence:res.overall.confidence,cellCoverage:res.overall.coverage,capabilitiesWithEvidence:`${withEv}/${caps.length}`,
    knownCells:ev.knownCells,applicableCells:ev.applicableCells,unresolvedCells:ev.statusCounts?.UNRESOLVED??0,gatheringCells:ev.statusCounts?.GATHERING??0,
    metricType:res.metricType,isOfficial:res.overall.isOfficial,quickEstimate:res.quality?.quickEstimate,hardContradictions:res.quality?.hardContradictions,
    strengthBasis:basis(res.strengths),weaknessBasis:basis(res.weaknesses),weaknessesScoring80Plus:wk.filter(x=>x.score>=80).length,
    pdfPages:r.pdf?.pages,progressSaved:r.progress?.answeredQuestions,progressBreakdown:r.progress?.answerBreakdown??null,stop:r.progress?.routingState});
}
fs.writeFileSync(path.join(dir,'summary.json'),JSON.stringify(rows,null,1));
const pct=v=>v==null?'-':(v*100).toFixed(1)+'%';
console.log('| domain | profile | asked | scored | DNK | score | confidence | cell coverage | caps w/ evidence | unresolved | str basis | wk basis | wk>=80 | PDF pp |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for(const x of rows)console.log(`| ${x.domain} | ${x.profile} | ${x.asked} | ${x.scoredAnswers} | ${x.dnk} | ${Math.round(x.score)} ${x.band??''} | ${x.confidence} | ${pct(x.cellCoverage)} | ${x.capabilitiesWithEvidence} | ${x.unresolvedCells} | ${JSON.stringify(x.strengthBasis)} | ${JSON.stringify(x.weaknessBasis)} | ${x.weaknessesScoring80Plus} | ${x.pdfPages} |`);
console.log(`\nrows=${rows.length} duplicateQuestionIds=${rows.reduce((s,x)=>s+x.duplicateQuestionIds,0)} nonThreePage=${rows.filter(x=>x.pdfPages!==3).length}`);
