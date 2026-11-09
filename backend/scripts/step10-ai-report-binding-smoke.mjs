import fs from 'node:fs';
import { deterministicFallbackNarrative, generateValidatedNarrative, OpenAiNarrativeProvider, validateNarrativeDraft, reportBindingMaterial } from '../dist-strategy/report/index.js';
import { sha256Json } from '../dist-strategy/lib/hash.js';

const payloadBase={
 payloadVersion:'MMRI-REPORT-PAYLOAD-1.3',payloadHash:'',diagnosisResultHash:'diag-hash',strategyHash:'strategy-hash',planHash:'plan-hash',bindingHash:'',
 reportId:'RPT-TEST-V4',reportContractVersion:'MMRI-REPORT-1.0',findingsPolicyVersion:'MMRI-REPORT-FINDINGS-1.0-FIVE-CATEGORY',traceVersion:'MMRI-TRACE-1.0',
 versionBundleId:'mv-test',versionBundleHash:'bundle-hash',sourceSnapshotId:'snap-test',sourceSnapshotHash:'snapshot-hash',
 assessmentId:'ASS-1',assessmentMode:'FULL',assessmentStatus:'COMPLETED',routingState:'FULL_COMPLETE',generatedAt:'2026-09-09T00:00:00.000Z',companyName:'Test Co',methodologyVersion:'1.1.0',metricType:'OFFICIAL_OVERALL_SCORE',
 overall:{score:72,confidence:.9,coverage:.95,band:'Mature'},purposes:[1,2,3,4,5].map(i=>({id:`P${i}`,nameMn:`Зорилго ${i}`,score:70+i,confidence:.9,coverage:.95,band:null})),
 strengths:[],weaknesses:[],rootFindings:[],priorityActions:[],evidenceActions:[],roadmap:[],risks:[],remeasurement:{horizon:'H2',labelMn:'90 хоногийн дараа, төлөвлөсөн үйл ажиллагаа бодитоор хэрэгжиж эхэлсэн эсэхийг шалгах зорилгоор, анхны оношилгоотой ижил аргачлал, ижил хүрээ, ижил хариулагчдын бүрэлдэхүүнтэйгээр давтан үнэлгээ хийж, хугацааны эхэнд тогтоосон хэмжүүрүүдийн өөрчлөлтийг удирдлагын түвшинд бүгдээрээ хамтдаа сайтар хянан хэлэлцэх уулзалт'},requiredWarnings:[],displayDictionary:{},
 traceIndex:{'assessment:ASS-1':{kind:'ASSESSMENT',ref:'ASS-1'},...Object.fromEntries([1,2,3,4,5].map(i=>[`purpose:P${i}`,{kind:'PURPOSE',ref:`P${i}`}]))},
 versions:{methodology:'1.1.0',scoring:'MMRI-SCORING-1.0',confidence:'MMRI-CONFIDENCE-1.0',rootCause:'MMRI-ROOT-CAUSE-1.0',recommendation:'MMRI-RECOMMENDATION-1.0',actionPlan:'MMRI-ACTION-PLAN-1.0',report:'MMRI-REPORT-1.0',aiGeneration:'MMRI-AI-GENERATION-1.0'}
};
payloadBase.bindingHash=sha256Json(reportBindingMaterial({diagnosisResultHash:payloadBase.diagnosisResultHash,strategyHash:payloadBase.strategyHash,planHash:payloadBase.planHash,reportContractVersion:payloadBase.reportContractVersion,aiContractVersion:payloadBase.versions.aiGeneration,findingsPolicyVersion:payloadBase.findingsPolicyVersion}));
payloadBase.payloadHash=sha256Json({...payloadBase,payloadHash:''});
const payload=payloadBase;

const checks=[]; const check=(name,ok,detail='')=>{checks.push({name,status:ok?'PASS':'FAIL',detail});if(!ok)console.error('FAIL',name,detail)};
const fallback=deterministicFallbackNarrative(payload); const fv=validateNarrativeDraft(payload,fallback);
check('deterministic fallback validates',fv.state==='PASS',JSON.stringify(fv.issues));
const validProvider={metadata:{provider:'CUSTOM',modelIdentifier:'fake-valid',modelConfig:{},promptVersion:'test'},async generate(){return fallback;}};
const valid=await generateValidatedNarrative(payload,validProvider);
check('valid AI narrative publishes',valid.state==='PASS',valid.state);check('valid provider one attempt',valid.providerAttempts===1,String(valid.providerAttempts));
const bad=structuredClone(fallback);bad.sections[1].claims[0].textMn+=' 999999 өснө.';
const badProvider={metadata:{provider:'CUSTOM',modelIdentifier:'fake-bad',modelConfig:{},promptVersion:'test'},async generate(){return bad;}};
const blocked=await generateValidatedNarrative(payload,badProvider);
check('unsafe AI narrative falls back',blocked.state==='AI_FALLBACK_USED',blocked.state);check('unsafe output never published',blocked.narrative.sections[1].claims[0].textMn!==bad.sections[1].claims[0].textMn,'');
const long=structuredClone(fallback);long.sections[1].claims[0].textMn+=' '+Array(1200).fill('тайлбар').join(' ');
const repairProvider={metadata:{provider:'CUSTOM',modelIdentifier:'fake-repair',modelConfig:{},promptVersion:'test'},async generate(){return long;},async repair(){return fallback;}};
const repaired=await generateValidatedNarrative(payload,repairProvider);
check('one repair can recover',repaired.state==='PASS',repaired.state);check('repair attempts exactly two',repaired.providerAttempts===2,String(repaired.providerAttempts));
const throwing={metadata:{provider:'CUSTOM',modelIdentifier:'fake-error',modelConfig:{},promptVersion:'test'},async generate(){throw new Error('provider down')}};
const err=await generateValidatedNarrative(payload,throwing);check('provider exception falls back',err.state==='AI_FALLBACK_USED',err.state);check('provider error audited',err.providerError==='provider down',String(err.providerError));

const oldFetch=globalThis.fetch;let captured=null;globalThis.fetch=async(_url,init)=>{captured=JSON.parse(init.body);return new Response(JSON.stringify({output_text:JSON.stringify(fallback)}),{status:200,headers:{'content-type':'application/json'}})};
try{
 const openai=new OpenAiNarrativeProvider({apiKey:'test-key-not-real',model:'test-model',endpoint:'https://example.invalid/v1/responses'});
 const rendered=await openai.generate(payload);
 check('OpenAI provider uses Responses model field',captured?.model==='test-model',String(captured?.model));
 check('OpenAI provider uses strict JSON schema',captured?.text?.format?.type==='json_schema'&&captured?.text?.format?.strict===true,JSON.stringify(captured?.text?.format));
 check('OpenAI provider disables response storage',captured?.store===false,String(captured?.store));
 check('provider pins payload hash locally',rendered.draft.payloadHash===payload.payloadHash,rendered.draft.payloadHash);
}finally{globalThis.fetch=oldFetch;}

const incomplete={...payload,planHash:''};const invalid=validateNarrativeDraft(incomplete,fallback);check('incomplete triple binding blocks',invalid.state==='GENERATION_BLOCKED',JSON.stringify(invalid.issues));check('binding validator check V21',invalid.issues.some(x=>x.checkId==='V21'),'');
let tamperBlocked=false;try{await generateValidatedNarrative({...payload,overall:{...payload.overall,score:99}},validProvider)}catch{tamperBlocked=true}check('tampered frozen payload blocked before provider',tamperBlocked,'');
let mutationBlocked=false;const mutatingProvider={metadata:{provider:'CUSTOM',modelIdentifier:'fake-mutator',modelConfig:{},promptVersion:'test'},async generate(p){try{p.overall.score=1}catch{};return fallback;}};const mutationResult=await generateValidatedNarrative(payload,mutatingProvider);mutationBlocked=mutationResult.state==='PASS'&&payload.overall.score===72;check('provider receives detached read-only authority',mutationBlocked,String(payload.overall.score));
const summary={suite:'MMRI Step 10 AI executive report binding smoke',version:'3.23.0',total:checks.length,passed:checks.filter(x=>x.status==='PASS').length,failed:checks.filter(x=>x.status==='FAIL').length,checks};
fs.writeFileSync(new URL('../methodology/STEP10_AI_REPORT_SMOKE.json',import.meta.url),JSON.stringify(summary,null,2));console.log(JSON.stringify({total:summary.total,passed:summary.passed,failed:summary.failed},null,2));if(summary.failed)process.exit(1);
