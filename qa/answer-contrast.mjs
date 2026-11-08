/* WCAG contrast of the dark ink on every answer tint (rest 40%, hover 52%, selected 66%) over the whole green-to-red scale. Run from the repo root. */
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';
const require=createRequire(path.resolve('frontend/package.json'));const {build}=require('esbuild');const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ct-'));
await build({entryPoints:['frontend/src/data/answerTone.ts'],bundle:true,format:'esm',outfile:tmp+'/t.mjs',logLevel:'error'});const T=await import(tmp+'/t.mjs');
const lum=c=>{const f=v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4};return .2126*f(c[0])+.7152*f(c[1])+.0722*f(c[2])};const cr=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
const ink=[22,35,51];let worst=99;for(let q=0;q<=1.0001;q+=.05){const col=T.answerToneAtQuality(q).color.match(/\d+/g).map(Number);for(const pct of [.40,.52,.66]){worst=Math.min(worst,cr(ink,col.map(v=>v*pct+255*(1-pct))))}}
console.log('worst-case text contrast:',worst.toFixed(2),worst>=4.5?'PASS':'FAIL');process.exit(worst>=4.5?0:1);
