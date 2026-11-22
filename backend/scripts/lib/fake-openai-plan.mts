/* LOCAL fake of the OpenAI Responses endpoint for end-to-end QA of the real provider/HTTP path. Answers every plan request from the simulated model. Never leaves the machine. */
import http from 'node:http';import {sim} from './annual-plan-sim.mts';
const PORT=Number(process.argv[2]||4390);let n=0;
http.createServer(async(req,res)=>{let b='';for await(const c of req)b+=c;
 try{const j=JSON.parse(b);const m=/DIAGNOSIS_JSON\n(\{.*?\})(?:\nPREVIOUS_DRAFT|$)/s.exec(String(j.input));if(!m)throw new Error('no diagnosis json');
  const out=await sim.generate(JSON.parse(m[1]),'');n++;console.log(`plan request ${n}`);
  res.writeHead(200,{'content-type':'application/json','x-request-id':'fake-'+n}).end(JSON.stringify({status:'completed',output_text:JSON.stringify(out.draft)}));
 }catch(e:any){res.writeHead(400,{'content-type':'application/json'}).end(JSON.stringify({error:{code:'bad_request',message:String(e.message)}}))}
}).listen(PORT,'127.0.0.1',()=>console.log('fake model listening',PORT));
