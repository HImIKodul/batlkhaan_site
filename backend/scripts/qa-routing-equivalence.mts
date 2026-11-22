/* PERF-02 safety proof: the memoised adaptive router must choose EXACTLY the same questions as the pre-optimisation router (git rev given as argv[2], default 064e5fb)
   for every ACTIVE bundle (five domains) in FULL and QUICK mode. Read-only: no DB, no network. The old router is checked out to a temporary file next to routing.ts and removed afterwards. */
import fs from "node:fs";import crypto from "node:crypto";import {execFileSync} from "node:child_process";
import {buildDefinition} from "../src/engine/definition.js";import {calculateRuntimeSnapshot,evidenceFromAnswer} from "../src/engine/index.js";
import {routeAdaptiveV13 as routeNew,hasAdaptiveV13Policy} from "../src/engine/routing.js";
const rev=process.argv[2]??"064e5fb";const OLD="src/engine/.routing-old-for-equivalence.ts";
fs.writeFileSync(OLD,execFileSync("git",["show",`${rev}:backend/src/engine/routing.ts`],{encoding:"utf8"}));
const {routeAdaptiveV13:routeOld}=await import("../"+OLD.replace(/\.ts$/,".js"));
const B:[string,string][]=[["marketing","methodology/MMRI_v3.0.3_QBANK_v3.1.3_STEP6_OF6_ACCEPTED_FINAL.json"],["finance","methodology/businessmri-v2.6-runtime-bundles/MMRI_FINMRI_Methodology_4.2.7_BUSINESSMRI_V2.json"],["people","methodology/businessmri-v2.6-runtime-bundles/MMRI_HRMRI_Methodology_4.1.7_BUSINESSMRI_V2.json"],["it","methodology/businessmri-v2.6-runtime-bundles/MMRI_ISMRI_Methodology_4.3.7_BUSINESSMRI_V2.json"],["operations","methodology/businessmri-v2.6-runtime-bundles/MMRI_OPMRI_Methodology_4.4.7_BUSINESSMRI_V2.json"]];
const h=(s:string)=>parseInt(crypto.createHash("sha256").update(s).digest("hex").slice(0,8),16)>>>0;
const profile=Array.from({length:20},(_,i)=>({questionId:`P${String(i+1).padStart(2,"0")}`,optionIndexes:[i===4?5:i===19?1:2]}));
let fail=0,steps=0;const ms={old:0,new:0};
try{for(const [name,file] of B){const def:any=buildDefinition(JSON.parse(fs.readFileSync(file,"utf8")));if(!hasAdaptiveV13Policy(def)){console.log("SKIP",name,"no adaptive policy");continue}
  for(const mode of ["FULL","QUICK"] as const)for(const target of (process.env.EQ_TARGETS??"45").split(",").map(Number)){
    const gates=new Map();def.categories.forEach((c:any,i:number)=>gates.set(`${c.id}:CAPABILITY_RELEVANT`,i<20?"TRUE":"FALSE"));
    const evidence:any[]=[],asked=new Set<string>();let snap:any=calculateRuntimeSnapshot(def,evidence);let same=true,n=0;
    for(let guard=0;guard<700;guard++){const input:any={mode,snapshot:snap,evidence,askedQuestionIds:asked,profileAnswers:profile,diagnosticQuestionCount:evidence.length,relevantCapabilityCount:20,applicabilityByGate:gates};
      let t=process.hrtime.bigint();const a:any=routeOld(def,input);ms.old+=Number(process.hrtime.bigint()-t)/1e6;t=process.hrtime.bigint();const b:any=routeNew(def,input);ms.new+=Number(process.hrtime.bigint()-t)/1e6;
      if(a.state!==b.state||a.stopReason!==b.stopReason||a.nextQuestion?.question?.id!==b.nextQuestion?.question?.id||JSON.stringify(a.nextQuestion?.reasons??null)!==JSON.stringify(b.nextQuestion?.reasons??null)){same=false;console.log("DIFF",name,mode,target,"step",n,a.nextQuestion?.question?.id,b.nextQuestion?.question?.id);break}
      steps++;if(!b.nextQuestion)break;const q=b.nextQuestion.question;asked.add(q.id);n++;
      const want=target-20+(h(`${name}:${q.categoryId}`)%41);const sc=q.options.filter((o:any)=>o.state==="SCORED"&&o.score!==null);
      const oi=sc.length?sc.reduce((p:any,o:any)=>Math.abs(o.score-want)<Math.abs(p.score-want)?o:p).optionIndex:(q.options.find((o:any)=>o.state!=="DNK"&&o.state!=="UNAVAILABLE")?.optionIndex??q.options[0].optionIndex);
      evidence.push(evidenceFromAnswer({definition:def,question:q,optionIndex:oi,explicitAuthority:.95,respondentRoleId:"R01"}));snap=calculateRuntimeSnapshot(def,evidence)}
    if(!same)fail++;console.log(`${same?"PASS":"FAIL"} ${name} ${mode} profile~${target}: ${n} questions chosen identically`)}}
}finally{fs.rmSync(OLD,{force:true})}
console.log(`RESULT identical_decisions=${steps} failing_runs=${fail} routerMs old=${ms.old.toFixed(0)} new=${ms.new.toFixed(0)}`);process.exit(fail?1:0);
