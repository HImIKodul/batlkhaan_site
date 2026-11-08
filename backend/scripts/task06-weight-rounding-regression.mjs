import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const methodology = path.join(root, 'methodology');
const bundleDir = path.join(methodology, 'businessmri-v2.6-runtime-bundles'); // active production bundles (4.x.7); superseded versions are provenance only
const marketing = path.join(methodology, 'MMRI_v3.0.3_QBANK_v3.1.3_STEP6_OF6_ACCEPTED_FINAL.json');
const files = [...fs.readdirSync(bundleDir).filter(x=>/_Methodology_4\.[1-4]\.7_.*\.json$/.test(x)).map(x=>path.join(bundleDir,x)), marketing];
const q4 = x => Math.round(Number(x) * 10000) / 10000;
const tolerance = n => n * 0.00005 + 1e-9;
const result = [];
let checks=0;
for (const file of files) {
  const b=JSON.parse(fs.readFileSync(file,'utf8'));
  const cats=b.categories;
  if (!Array.isArray(cats) || cats.length!==64) throw new Error(`${file}: expected 64 categories`);
  const original=cats.reduce((s,c)=>s+Number(c['Category weight %']),0);
  const stored=cats.reduce((s,c)=>s+q4(c['Category weight %']),0);
  if (Math.abs(original-100)>1e-9) throw new Error(`${file}: frozen source sum ${original}`);
  if (Math.abs(stored-100)>tolerance(cats.length)) throw new Error(`${file}: DECIMAL(8,4) sum ${stored} outside ${tolerance(cats.length)}`);
  checks += 2;
  const groups=new Map();
  for (const c of cats) {
    const key=c.Module;
    const g=groups.get(key) ?? {expected:Number(c['Module weight %']), vals:[]};
    g.vals.push(q4(c['Category weight %'])); groups.set(key,g);
  }
  for (const [name,g] of groups) {
    const s=g.vals.reduce((a,b)=>a+b,0);
    if (Math.abs(s-g.expected)>tolerance(g.vals.length)) throw new Error(`${file}: ${name} rounded sum ${s} vs ${g.expected}`);
    checks++;
  }
  result.push({domain:b.domainCode ?? 'marketing', sourceSum:original, storedScale4Sum:stored, allowedTolerance:tolerance(64)});
}
// Guard: the validator must still reject a material methodology error.
const bad=100.01;
if (Math.abs(bad-100) <= tolerance(64)) throw new Error('material 0.01 weight error would be accepted');
checks++;
console.log(JSON.stringify({status:'PASS',checksPassed:checks,domains:result,materialErrorRejected:true},null,2));
