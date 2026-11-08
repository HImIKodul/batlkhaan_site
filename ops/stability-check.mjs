const base=(process.env.MMRI_BASE_URL??'http://127.0.0.1:4000').replace(/\/$/,'');
const samples=Number(process.env.MMRI_STABILITY_SAMPLES??'6');const intervalMs=Number(process.env.MMRI_STABILITY_INTERVAL_MS??'5000');
if(!Number.isSafeInteger(samples)||samples<2||samples>60)throw new Error('MMRI_STABILITY_SAMPLES must be 2..60');
if(!Number.isSafeInteger(intervalMs)||intervalMs<10||intervalMs>60000)throw new Error('MMRI_STABILITY_INTERVAL_MS must be 10..60000');
const expected=(process.env.RELEASE_SHA??'').trim();const results=[];
for(let i=0;i<samples;i++){
  const started=Date.now();let live,ready;
  try{
    const [lr,rr]=await Promise.all([fetch(base+'/live',{redirect:'manual'}),fetch(base+'/ready',{redirect:'manual'})]);
    live={status:lr.status,body:await lr.json().catch(()=>null)};ready={status:rr.status,body:await rr.json().catch(()=>null)};
  }catch(error){throw new Error(`stability sample ${i+1} network failure: ${error}`)}
  const ok=live.status===200&&ready.status===200&&(!expected||(live.body?.releaseSha===expected&&ready.body?.releaseSha===expected));
  results.push({sample:i+1,ok,live:live.status,ready:ready.status,durationMs:Date.now()-started,releaseSha:ready.body?.releaseSha??null});
  if(!ok)throw new Error(`stability sample ${i+1} failed: ${JSON.stringify(results.at(-1))}`);
  if(i+1<samples)await new Promise(r=>setTimeout(r,intervalMs));
}
console.log(JSON.stringify({status:'PASS',base,samples,results},null,2));
