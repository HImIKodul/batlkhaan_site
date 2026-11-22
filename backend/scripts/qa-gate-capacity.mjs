/* Bounded capacity probe on an ISOLATED staging API (NOT a load test and NOT representative of the i5/16 GB target): N concurrent full diagnoses + a burst of logo uploads. Reports wall time, per-request latency percentiles, API RSS. */
import {execFileSync} from 'node:child_process';
const R=new URL('./lib/',import.meta.url).pathname;const {customer,B}=await import(R+'admin-qa.mjs');const {journey,http}=await import(R+'qa-journey.mjs');
const N=Number(process.env.CAP_N||4);const lat=[];const timed=async(f)=>{const t=Date.now();const r=await f();lat.push(Date.now()-t);return r};
const rss=()=>{try{const pid=execFileSync('bash',['-c',`ss -ltnp | grep ":${new URL(B).port} " | grep -o "pid=[0-9]*" | head -n1 | cut -d= -f2`],{encoding:'utf8'}).trim();return Math.round(Number(execFileSync('bash',['-c',`awk '/VmRSS/{print $2}' /proc/${pid}/status`],{encoding:'utf8'}))/1024)}catch{return null}};
const before=rss();const t0=Date.now();
const users=await Promise.all(Array.from({length:N},(_,i)=>customer('cap'+i)));
const cos=await Promise.all(users.map(async(u,i)=>({u,cid:(await http(B,'POST','/companies',{tok:u.tok,body:{name:`Cap ${i} ХХК`}})).d.id})));
const domains=['marketing','finance','people','it','operations'];
const runs=await Promise.all(cos.map(({u,cid},i)=>{const t=Date.now();return journey(B,u.tok,cid,domains[i%5]).then(j=>({ok:!!j.a,ms:Date.now()-t,answers:j.answered})).catch(e=>({ok:false,ms:Date.now()-t,err:String(e).slice(0,80)}))}));
const peak=rss();console.log(`${N} concurrent full diagnoses: ${runs.filter(r=>r.ok).length}/${N} completed; each took ${runs.map(r=>Math.round(r.ms/1000)+'s').join(',')}; wall ${Math.round((Date.now()-t0)/1000)}s`);
runs.filter(r=>!r.ok).forEach(r=>console.log('  failed:',r.err));
// logo burst: 20 uploads across the users
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAUElEQVR4nO3PQQ0AAAjAMMC/5+GBQ7NK6KzZb2Yoqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq6gV2sAH+3p8mzwAAAABJRU5ErkJggg==','base64');
const tl=Date.now();const ups=await Promise.all(Array.from({length:20},(_,i)=>timed(()=>http(B,'PUT',`/companies/${cos[i%N].cid}/logo`,{tok:cos[i%N].u.tok,body:{dataBase64:png.toString('base64')}}))));
console.log(`logo burst 20 uploads: ${ups.filter(r=>r.s===200).length} x200, ${ups.filter(r=>r.s===429).length} x429, other ${ups.filter(r=>![200,429].includes(r.s)).length}; wall ${Date.now()-tl} ms`);
lat.sort((a,b)=>a-b);const pc=p=>lat[Math.min(lat.length-1,Math.floor(lat.length*p))];console.log(`logo request latency p50=${pc(.5)}ms p95=${pc(.95)}ms max=${lat[lat.length-1]}ms`);
console.log(`API RSS MB: before=${before} after=${rss()}`);
