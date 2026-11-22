/* HISTORICAL REPLAY (read-only). Recomputes every completed assessment found in an ISOLATED database from its stored answers and compares
   (1) the replay under the methodology version the assessment is pinned to with the STORED result, and (2) the replay under a CANDIDATE bundle with the stored result.
   Usage: DATABASE_NAME=<isolated db> npx tsx scripts/qa-historical-replay.mts <domain> <active bundle> <candidate bundle>. Refuses the primary `mmri` database. */
import fs from "node:fs";import {execFileSync} from "node:child_process";
import {buildDefinition} from "../src/engine/definition.js";import {calculateRuntimeSnapshot,evidenceFromAnswer} from "../src/engine/index.js";
const db=process.env.DATABASE_NAME??"";if(!db||db==="mmri"||!/qa|scratch|test/.test(db)){console.error("REFUSED: set DATABASE_NAME to an isolated QA/scratch database (never `mmri`)");process.exit(2)}
const [dom,activeFile,candFile]=process.argv.slice(2);
const sql=(q:string)=>execFileSync("docker",["exec","mmri-v3-local-postgres-1","psql","-U","mmri","-d",db,"-At","-F","\t","-c",q],{encoding:"utf8",maxBuffer:64<<20}).trim();
const load=(f:string)=>{const raw=JSON.parse(fs.readFileSync("methodology/"+f,"utf8"));return {raw,def:buildDefinition(raw) as any}};
const A=load(activeFile),C=load(candFile);
const asmts=sql(`select a.id, a."overallPartialScore", a.coverage, mv.version from assessments a join methodology_versions mv on mv.id=a."methodologyVersionId" where a.status in ('COMPLETED','COMPLETED_WITH_REVIEW','EXHAUSTED') and a."domainCode"='${dom}' order by a."createdAt"`).split("\n").filter(Boolean).map(l=>l.split("\t"));
let fail=0,n=0;const num=(x:string)=>x===""?null:Number(x);
const replay=(def:any,rows:string[][])=>{const ev:any[]=[];for(const [qid,oi,auth] of rows){const q=def.questionById.get(qid);if(!q)throw new Error("question missing "+qid);ev.push(evidenceFromAnswer({definition:def,question:q,optionIndex:Number(oi),explicitAuthority:Number(auth)||0.95,respondentRoleId:"R01"}))}return calculateRuntimeSnapshot(def,ev)};
for(const [id,partial,cov,ver] of asmts){
  const rows=sql(`select q."externalId", x."optionIndex", x.authority from answers x join questions q on q.id=x."questionId" where x."assessmentId"='${id}' and x.active and x."optionIndex" is not null order by x."createdAt", x.id`).split("\n").filter(Boolean).map(l=>l.split("\t"));
  const sa=replay(A.def,rows),sc=replay(C.def,rows);const oa=sa.overall,oc=sc.overall;
  const near=(a:number|null,b:number|null,t=0.01)=>a===b||(a!==null&&b!==null&&Math.abs(a-b)<=t);
  const storedP=num(partial),storedC=num(cov);
  const okStored=near(storedP,oa?.partialScore??null,0.05)&&near(storedC===null?null:storedC,oa?.coverage??null,0.0005);
  const cellsEq=[...sa.cells.entries()].every(([k,c]:any)=>{const d:any=sc.cells.get(k);return d&&d.status===c.status&&d.effectiveScore===c.effectiveScore&&d.effectiveConfidence===c.effectiveConfidence&&d.naClaimCount===c.naClaimCount});
  const okCand=near(oa?.partialScore??null,oc?.partialScore??null,0)&&near(oa?.coverage??null,oc?.coverage??null,0)&&cellsEq;
  console.log(`${okStored?"PASS":"FAIL"} ${id.slice(-6)} v${ver} answers=${rows.length}: replay(active) vs stored partial ${storedP} vs ${oa?.partialScore}, coverage ${storedC} vs ${oa?.coverage?.toFixed?.(4)}`);
  console.log(`${okCand?"PASS":"FAIL"} ${id.slice(-6)}: candidate replay identical to active replay (overall + every cell state/score/confidence)`);
  n++;if(!okStored||!okCand)fail++}
console.log(`RESULT assessments=${n} failing=${fail}`);process.exit(fail||!n?1:0);
