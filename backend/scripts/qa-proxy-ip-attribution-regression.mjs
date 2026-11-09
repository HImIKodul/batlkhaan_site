// Proves client-IP attribution behind a reverse proxy (IIS/ARR, nginx). Two ISOLATED backend instances are required:
//   NO_TRUST_PORT: TRUST_PROXY=false (default)   TRUST_PORT: TRUST_PROXY=true TRUST_PROXY_HOPS=1
// 30 failed logins carrying 30 different X-Forwarded-For client IPs must NOT trip the per-IP limiter when the proxy is trusted.
// With TRUST_PROXY=false the limiter is shared by every visitor (the defect this script documents). Never point this at production.
const NO_TRUST=process.env.NO_TRUST_PORT,TRUST=process.env.TRUST_PORT,ORIGIN=process.env.ORIGIN??'http://127.0.0.1:5310';
if(!NO_TRUST||!TRUST)throw new Error('Set NO_TRUST_PORT and TRUST_PORT');
async function burst(port){let n401=0,n429=0;for(let i=1;i<=30;i++){const r=await fetch(`http://127.0.0.1:${port}/api/v1/auth/login`,{method:'POST',headers:{'Content-Type':'application/json',Origin:ORIGIN,'X-Forwarded-For':`203.0.113.${i}`},body:JSON.stringify({email:`nobody${i}@example.test`,password:'Wrong-Pass-12345!'})});if(r.status===401)n401++;else if(r.status===429)n429++}return{n401,n429}}
const a=await burst(NO_TRUST),b=await burst(TRUST);let fail=0;const t=(n,ok,d)=>{if(!ok)fail++;console.log((ok?'PASS ':'FAIL ')+n+' | '+d)};
t('trusted proxy: distinct client IPs are not throttled together',b.n429===0&&b.n401===30,JSON.stringify(b));
t('untrusted proxy: shared bucket is throttled (documents why TRUST_PROXY=true is mandatory behind IIS/ARR)',a.n429>0,JSON.stringify(a));
process.exit(fail?1:0);
