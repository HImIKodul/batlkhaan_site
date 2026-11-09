import fs from 'node:fs';
import path from 'node:path';
const failures=[]; const details=[];
for(const dir of ['backend','frontend']){
  const pkgPath=path.join(dir,'package.json'), lockPath=path.join(dir,'package-lock.json');
  const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));
  const direct={...(pkg.dependencies??{}),...(pkg.devDependencies??{})};
  for(const [name,spec] of Object.entries(direct)) if(/^[~^*]|[xX]$|\s-\s|\|\|/.test(String(spec))) failures.push(`${dir}: direct dependency ${name} is not exact: ${spec}`);
  if(pkg.packageManager!=='npm@10.9.2') failures.push(`${dir}: packageManager must be npm@10.9.2`);
  if(!fs.existsSync(lockPath)){failures.push(`${dir}: package-lock.json missing`); continue;}
  const lock=JSON.parse(fs.readFileSync(lockPath,'utf8'));
  if(lock.lockfileVersion!==3) failures.push(`${dir}: lockfileVersion must be 3`);
  const root=lock.packages?.['']; if(!root) failures.push(`${dir}: lock root package missing`);
  else {
    for(const [sec,key] of [['dependencies','dependencies'],['devDependencies','devDependencies']]){
      for(const [name,spec] of Object.entries(pkg[sec]??{})) if(root[key]?.[name]!==spec) failures.push(`${dir}: lock root ${name} spec mismatch`);
    }
  }
  details.push({dir,lockfileVersion:lock.lockfileVersion,packageEntries:Object.keys(lock.packages??{}).length});
}
const out={status:failures.length?'FAIL':'PASS',failures,details}; console.log(JSON.stringify(out,null,2)); if(failures.length)process.exit(1);
