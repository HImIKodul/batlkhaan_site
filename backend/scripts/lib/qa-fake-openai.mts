/* LOCAL fake of the OpenAI Responses endpoint for the isolated report end-to-end gate. Narrative requests get the deterministic fallback narrative (a TEST DOUBLE, not an AI);
   12-month plan requests get the simulated plan model. Counts every request; GET /__hits returns {narrative,plan}. Nothing leaves the machine. */
import http from 'node:http';import {execFileSync} from 'node:child_process';import {sim} from './annual-plan-sim.mts';
const {deterministicFallbackNarrative}=await import(new URL('../../dist-strategy/report/index.js',import.meta.url).href);
const PORT=Number(process.argv[2]||4398),DB=process.env.PGDATABASE!;const hits={narrative:0,plan:0};
const q=(s:string)=>execFileSync('docker',['exec','mmri-v3-local-postgres-1','psql','-U','mmri','-d',DB,'-At','-c',s],{encoding:'utf8'}).trim();
http.createServer(async(req,res)=>{if(req.method==='GET'){res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify(hits));return}
 let b='';for await(const c of req)b+=c;let inp='';
 try{const j=JSON.parse(b);inp=String(j.input);const pm=/DIAGNOSIS_JSON\n(\{.*?\})(?:\nThe previous draft failed|$)/s.exec(inp);const rm=/\nPREVIOUS_DRAFT\n(\{.*\})\nISSUES\n(\[.*\])$/s.exec(inp);
  if(pm){hits.plan++;let out:any=await sim.generate(JSON.parse(pm[1]),'');
   if(rm){out={draft:JSON.parse(rm[1])}}  /* the v2 test planner already follows the validated rules; a repair simply returns the previous draft so a failing plan stays UNAVAILABLE and is reported */(await import('node:fs')).writeFileSync(`${process.env.E2E_OUT||'/tmp/claude-1000/e2e'}/plan-${hits.plan}.json`,JSON.stringify({input:JSON.parse(pm[1]),draft:out.draft}));res.writeHead(200,{'content-type':'application/json','x-request-id':'fake-plan-'+hits.plan}).end(JSON.stringify({status:'completed',output_text:JSON.stringify(out.draft),usage:{input_tokens:9000,output_tokens:2500}}));return}
  const m=/"assessmentId":"([^"]+)"/.exec(inp);if(!m)throw new Error('unrecognised request');hits.narrative++;
  const payload=JSON.parse(q(`select payload::text from report_snapshots where "assessmentId"='${m[1]}' limit 1`));
  res.writeHead(200,{'content-type':'application/json','x-request-id':'fake-narr-'+hits.narrative}).end(JSON.stringify({status:'completed',output_text:JSON.stringify(deterministicFallbackNarrative(payload)),usage:{input_tokens:30000,output_tokens:4000}}));
 }catch(e:any){console.error('fake model error:',String(e?.message||e),'| len',inp.length,'| head',JSON.stringify(inp.slice(0,160)),'| tail',JSON.stringify(inp.slice(-160)));res.writeHead(400,{'content-type':'application/json'}).end(JSON.stringify({error:{code:'bad_request',message:String(e.message)}}))}}).listen(PORT,'127.0.0.1',()=>console.log('fake openai on',PORT));
