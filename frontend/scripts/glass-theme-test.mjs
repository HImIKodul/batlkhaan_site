/* Unit test for design/glassTheme.ts (hover > selected > default blue, debounced leave, idempotent writes).
   Bundles the module with esbuild and runs it against a fake document. Usage: node scripts/glass-theme-test.mjs */
import {build} from 'esbuild';
import fs from 'fs';import os from 'os';import path from 'path';
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'glass-'));const file=path.join(tmp,'gt.mjs');
const stub=path.join(tmp,'react-stub.mjs');fs.writeFileSync(stub,'export const useEffect=()=>{};export const useLayoutEffect=()=>{};');
await build({entryPoints:['src/design/glassTheme.ts'],bundle:true,format:'esm',outfile:file,alias:{react:stub},logLevel:'error'});
let writes=0;const store={};
const root={dataset:new Proxy(store,{set(t,k,v){if(k==='glass')writes++;t[k]=v;return true},deleteProperty(t,k){if(k==='glass')writes++;delete t[k];return true}})};
globalThis.window=globalThis;globalThis.document={documentElement:root,addEventListener(){},hidden:false};
globalThis.sessionStorage={getItem:()=>null};globalThis.location={hash:'#/results'};
const m=await import(file);
const g=()=>store.glass??'default';const wait=ms=>new Promise(r=>setTimeout(r,ms));
const out=[];const t=(n,ok,d='')=>out.push((ok?'PASS ':'FAIL ')+n+(d?` (${d})`:''));
t('starts on default blue',g()==='default');
m.setGlassSelected('it');t('selected domain applies',g()==='it');
m.setGlassHover('finance');t('hover overrides the selected domain',g()==='finance');
m.setGlassHover(null);t('leave is debounced (still previewing at 0 ms)',g()==='finance');
await wait(220);t('after leave the SELECTED colour is restored',g()==='it',g());
m.setGlassSelected(null);t('no selection and no hover returns to default blue',g()==='default');
m.setGlassHover('people');m.setGlassHover(null);m.setGlassHover('operations');await wait(260);t('leave then enter inside the debounce never flashes default',g()==='operations',g());
m.setGlassHover(null);await wait(220);t('final leave returns to default',g()==='default');
m.setGlassHover('it');await wait(50);m.setGlassHover(null);await wait(120);m.setGlassHover('finance');await wait(300);t('card-to-card move with a 120 ms gap (slow frame) never flashes default',g()==='finance',g());m.setGlassHover(null);await wait(220);
m.setGlassSelected('marketing');const before=writes;m.setGlassSelected('marketing');m.setGlassHover('marketing');t('re-applying the same domain writes nothing (no style recalculation)',writes===before,`${writes-before} writes`);
console.log(out.join('\n'));fs.rmSync(tmp,{recursive:true,force:true});process.exit(out.some(x=>x.startsWith('FAIL'))?1:0);
