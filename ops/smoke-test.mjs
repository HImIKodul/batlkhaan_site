const base=(process.env.MMRI_BASE_URL??'http://127.0.0.1:4000').replace(/\/$/,'');
const metricsToken=process.env.METRICS_TOKEN??'';
const expectedRelease=(process.env.RELEASE_SHA??'').trim();
const checks=[];
async function check(name,path,{status=200,headers={}}={}){try{const r=await fetch(base+path,{headers,redirect:'manual'}); const body=await r.text(); const ok=r.status===status; checks.push({name,ok,status:r.status}); if(!ok)throw new Error(`${name}: ${r.status} ${body.slice(0,120)}`); return body;}catch(e){checks.push({name,ok:false,error:String(e)}); throw e;}}
const liveBody=await check('live','/live'); const healthBody=await check('health','/health'); const readyBody=await check('ready','/ready');
if(expectedRelease){for(const [name,body] of [['live',liveBody],['health',healthBody],['ready',readyBody]]){let parsed;try{parsed=JSON.parse(body)}catch{throw new Error(`${name} did not return JSON`)}if(parsed.releaseSha!==expectedRelease)throw new Error(`${name} release mismatch: expected ${expectedRelease}, got ${parsed.releaseSha}`);}}
await check('metrics unauthorized','/metrics',{status:401}); if(metricsToken){const body=await check('metrics authorized','/metrics',{headers:{'x-metrics-token':metricsToken}}); if(!body.includes('mmri_up 1'))throw new Error('metrics payload missing mmri_up');}
console.log(JSON.stringify({status:'PASS',checks},null,2));
