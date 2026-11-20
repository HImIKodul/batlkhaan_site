// Direct-dependency retention evidence, not a transitive vulnerability audit.
import fs from 'node:fs';import path from 'node:path';
const rows=[];
for(const project of ['backend','frontend']){
 const pkg=JSON.parse(fs.readFileSync(project+'/package.json','utf8'));const files=[];
 function walk(dir){if(!fs.existsSync(dir))return;for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(['node_modules','dist','dist-engine','dist-strategy','.git'].includes(e.name))continue;const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(/\.(tsx?|mjs|css|json)$/.test(p)&&!p.endsWith('package-lock.json'))files.push(p)}}
 for(const dir of ['src','scripts','tests'])walk(project+'/'+dir);
 for(const file of fs.readdirSync(project))if(/^(vite|tsconfig).*\.(ts|json)$/.test(file))files.push(project+'/'+file);
 const contents=files.map(file=>({file,text:fs.readFileSync(file,'utf8')}));
 for(const [name,version] of Object.entries({...pkg.dependencies,...pkg.devDependencies})){
  const refs=contents.filter(x=>x.text.includes(name)).map(x=>x.file);
  const role=name.startsWith('@types/')?'TypeScript type declarations':name==='typescript'?'tsc build/typecheck executable':name==='prisma'?'schema generation/migration CLI':name==='vitest'?'critical test runner':refs.length?'imported or referenced by source/config/tests':'REVIEW_REQUIRED';
  rows.push({project,name,version,role,references:refs.slice(0,12),remove:false});
 }
}
console.log(JSON.stringify({status:rows.some(x=>x.role==='REVIEW_REQUIRED')?'REVIEW_REQUIRED':'PASS',scope:'Retained direct dependencies after documented cleanup; not an online advisory audit',items:rows},null,2));
