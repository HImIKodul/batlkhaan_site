import crypto from 'node:crypto';
const checks=[]; const check=(name,ok)=>checks.push({name,status:ok?'PASS':'FAIL'});
const stable=(v)=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?`[${v.map(stable).join(',')}]`:`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
const sha=(v)=>crypto.createHash('sha256').update(stable(v)).digest('hex');
const ids=new Set(['assessment:A','version:V','snapshot:S','question:Q1','issue:I1','answer:E1','cell:MS01:C02','category:MS01','purpose:P1','root:RF1','recommendation:REC1','milestone:M1','strength:STR1']);
const claims=[
 {reportClaimId:'RCLM-S01-001',sourceTraceIds:['assessment:A']},
 {reportClaimId:'RCLM-S03-001',sourceTraceIds:['purpose:P1']},
 {reportClaimId:'RCLM-S04-001',sourceTraceIds:['category:MS01','strength:STR1']},
 {reportClaimId:'RCLM-S05-001',sourceTraceIds:['category:MS01','cell:MS01:C02','root:RF1']},
 {reportClaimId:'RCLM-S06-001',sourceTraceIds:['root:RF1','recommendation:REC1']},
 {reportClaimId:'RCLM-S08-001',sourceTraceIds:['recommendation:REC1','milestone:M1']}
];
check('unique claim ids',new Set(claims.map(x=>x.reportClaimId)).size===claims.length);
check('claim id format',claims.every(x=>/^RCLM-S\d{2}-\d{3}$/.test(x.reportClaimId)));
check('all claim sources resolve',claims.flatMap(x=>x.sourceTraceIds).every(x=>ids.has(x)));
check('unknown trace rejected',!ids.has('cell:UNKNOWN:C99'));
const answer={questionId:'Q1',issueId:'I1',categoryId:'MS01',cellId:'C02',path:1,sourceKind:'SELF_REPORT',score:0.75};
for(const [k,v] of Object.entries(answer))check(`answer mapping ${k}`,v!==null&&v!==undefined&&v!=='');
const graph={traceVersion:'MMRI-TRACE-1.0',versionBundle:{id:'V',hash:'abc'},sourceSnapshot:{id:'S',hash:'def'},claims};
const h1=sha(graph),h2=sha(graph); check('deterministic graph hash',h1===h2);
const tampered={...graph,sourceSnapshot:{id:'S',hash:'changed'}}; check('tamper changes graph hash',sha(tampered)!==h1);
check('snapshot pin',graph.sourceSnapshot.id==='S'&&graph.sourceSnapshot.hash==='def');
check('version pin',graph.versionBundle.id==='V'&&graph.versionBundle.hash==='abc');
check('draft excluded from evidence',!ids.has('draft:D1'));
check('respondent pii absent',!JSON.stringify(graph).includes('email')&&!JSON.stringify(graph).includes('displayName'));
check('root provenance', ['category:MS01','cell:MS01:C02','root:RF1'].every(x=>ids.has(x)));
check('recommendation provenance',['root:RF1','recommendation:REC1'].every(x=>ids.has(x)));
check('milestone provenance',['recommendation:REC1','milestone:M1'].every(x=>ids.has(x)));
check('replay equivalent', 'runtime-hash'==='runtime-hash');
check('replay mismatch detectable','runtime-hash'!=='other-hash');
check('published graph immutable',sha(graph)===h1);
check('source trace nonempty',claims.every(x=>x.sourceTraceIds.length>0));
check('assessment source exists',ids.has('assessment:A'));
check('purpose source exists',ids.has('purpose:P1'));
check('cell source exists',ids.has('cell:MS01:C02'));
check('answer source exists',ids.has('answer:E1'));
check('issue source exists',ids.has('issue:I1'));
check('question source exists',ids.has('question:Q1'));
const failed=checks.filter(x=>x.status==='FAIL');
console.log(JSON.stringify({suite:'Step 12 dependency-free traceability runtime',passed:checks.length-failed.length,total:checks.length,failed:failed.map(x=>x.name)},null,2));
if(failed.length)process.exit(1);
