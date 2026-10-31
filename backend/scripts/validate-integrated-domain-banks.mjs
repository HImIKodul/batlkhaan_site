import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const dir=resolve(process.cwd(),'methodology/domain-question-banks');
const manifest=JSON.parse(readFileSync(resolve(dir,'manifest-r17.08.json'),'utf8'));
let failed=0;
for(const [domain,entry] of Object.entries(manifest.domains)){
 const bytes=readFileSync(resolve(dir,entry.file));const sha=createHash('sha256').update(bytes).digest('hex');const bank=JSON.parse(bytes.toString('utf8'));
 const ids=new Set(bank.questions.map(q=>q.id));const bad=bank.questions.filter(q=>!q.id||!q.question||!Array.isArray(q.options)||q.options.length<2);
 const pass=bank.domain===domain&&bank.frozen===true&&bank.questionCount===entry.count&&bank.questions.length===entry.count&&ids.size===entry.count&&!bad.length;
 console.log(`${pass?'PASS':'FAIL'} ${domain}: ${bank.questions.length} questions · ${ids.size} unique · ${sha.slice(0,12)}…`);if(!pass)failed++;
}
if(failed)process.exit(1);
console.log(`PASS repaired integrated domain banks · IT + Finance + HR + Operations`);
