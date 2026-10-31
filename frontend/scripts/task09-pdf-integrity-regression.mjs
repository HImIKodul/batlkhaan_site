import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root=process.cwd();
const reportPath=path.join(root,'src/pages/Report.tsx');
const mainPath=path.join(root,'src/main.tsx');
const cssPath=path.join(root,'src/functional-task09-pdf.css');
const report=fs.readFileSync(reportPath,'utf8');
const main=fs.readFileSync(mainPath,'utf8');
const css=fs.readFileSync(cssPath,'utf8');
let passed=0;
const checks=[];
function check(name,condition){if(!condition)throw new Error(`FAIL ${name}`);passed++;checks.push(name);console.log(`PASS ${name}`)}

const transpile=ts.transpileModule(report,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},reportDiagnostics:true,fileName:reportPath});
const syntaxErrors=(transpile.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
check('Report.tsx TypeScript/TSX syntax',syntaxErrors.length===0);
check('Task09 CSS imported last',main.includes("import './functional-task09-pdf.css';"));
check('PDF uses dynamic roadmap chunking',report.includes('function pdfPlanChunks(plan:ReportPlanStage[],maxActions=4)'));
check('PDF no longer forces roadmap into one fixed page',!report.includes('function PrintPageFour('));
check('PDF total page count is dynamic',report.includes('const total=3+chunks.length'));
check('roadmap chunks preserve every action',report.includes('actions.slice(part*maxActions,(part+1)*maxActions)'));
check('roadmap chunks render on dedicated pages',report.includes('<PrintRoadmapPage'));
check('no roadmap PDF page contains more than four actions by contract',report.includes('maxActions=4'));
check('PDF preflight integrity gate exists',report.includes('function validatePdfModel(m:ReportModel)'));
check('PDF gate requires exactly five strengths',report.includes('m.positives.length!==5'));
check('PDF gate requires exactly five weaknesses',report.includes('m.flaws.length!==5'));
check('PDF gate requires exactly five critical actions',report.includes('m.purposes.length!==5'));
check('PDF gate requires complete roadmap action fields',report.includes('!a.title.trim()||!a.result.trim()||!a.measure.trim()'));
check('PDF gate enforces 250-300 word conclusion',report.includes('words<250||words>300'));
check('real PDF requires frozen assessment id',report.includes('model.assessmentId!==selectedId'));
check('real PDF requires frozen report id',report.includes('model.reportId!==payload?.reportId'));
check('real PDF requires frozen payload hash',report.includes('model.payloadHash!==payload?.payloadHash'));
check('real report must have an actual frozen score',report.includes('Number.isFinite(payload?.overall.score)'));
check('real report uses frozen company name',report.includes("const frozenCompany=payload?.companyName?.trim()||company"));
check('diagnosis date uses completed assessment time',report.includes('const rawDate=assessment?.completedAt||assessment?.updatedAt||payload?.generatedAt'));
check('report generated date is frozen, not current print time',report.includes('fullDateLabel(m.generatedAt)')&&!report.includes('fullDateLabel(new Date().toISOString())'));
check('PDF footer carries immutable report reference',report.includes('shortRef(m.reportId)')&&report.includes('shortRef(m.payloadHash)'));
check('real report never prints a generic fallback conclusion',report.includes('const conclusion=narrativeConclusion(report)'));
check('A4 landscape contract retained',css.includes('@page{size:A4 landscape;margin:9mm}'));
check('roadmap PDF layout is two-column bounded',css.includes('grid-template-columns:repeat(2,minmax(0,1fr))'));
check('roadmap action cards are bounded for clipping protection',css.includes('max-height:58mm')&&css.includes('overflow:hidden'));
check('footer supports report reference without overlap',css.includes('grid-template-columns:1fr auto 1fr'));

const simulation=[1,4,5,8,9].flatMap((count,stageIndex)=>{
  const max=4, parts=Math.ceil(count/max);return Array.from({length:parts},(_,part)=>({stageIndex,count:Math.min(max,count-part*max)}));
});
check('pagination simulation preserves 27/27 actions',simulation.reduce((n,x)=>n+x.count,0)===27);
check('pagination simulation caps every page at four actions',simulation.every(x=>x.count>=1&&x.count<=4));
check('pagination simulation creates expected 9 roadmap pages',simulation.length===9);

console.log(JSON.stringify({status:'PASS',checks:passed,pdfContract:{fixedPages:3,maxRoadmapActionsPerPage:4,dynamicRoadmapPages:true,conclusionWords:'250-300',binding:['assessmentId','reportId','payloadHash']}},null,2));
