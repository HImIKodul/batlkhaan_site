/* Creates ONE local QA customer (+ a clearly synthetic QA company with an OWNER membership) in an ISOLATED QA database, using the application's own password hashing.
   - The password is typed privately at the terminal prompt (hidden, asked twice). It is never an argument, never written to a file or a log, and never printed.
   - Refuses: the primary `mmri` database, any non-loopback host, production, an e-mail that already has an account (nothing is ever overwritten or reset), a weak password.
   - The account is marked e-mail verified because the QA mail safety filter cannot deliver the verification code to this address (it is the owner's own address; recorded in the audit table).
   - Afterwards it logs in once through the QA frontend proxy and prints only the HTTP status.
   Usage (from backend/): (set -a; . ~/mmri-qa-runtime/qa-backend.env; set +a; DOTENV_CONFIG_PATH=~/mmri-qa-runtime/empty.env npx tsx scripts/qa-create-local-customer.mts <email>) */
import fs from "node:fs";import tty from "node:tty";
import {prisma} from "../src/db.js";import {hashPassword,validatePasswordPolicy} from "../src/api/auth/crypto.js";
const email=String(process.argv[2]??"").trim().toLowerCase();
if(!/^[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)){console.error("REFUSED: pass the customer e-mail as the first argument");process.exit(2)}
let u:URL;try{u=new URL(process.env.DATABASE_URL??"")}catch{console.error("REFUSED: DATABASE_URL missing");process.exit(2)}
const db=decodeURIComponent(u.pathname.slice(1));
if(!["127.0.0.1","localhost","::1","[::1]"].includes(u.hostname)||db==="mmri"||!/^mmri_[a-z0-9_]*qa[a-z0-9_]*$/.test(db)||/prod/i.test(`${process.env.NODE_ENV}|${process.env.MMRI_ENVIRONMENT}`)){console.error(`REFUSED: ${db} on ${u.hostname} is not an isolated local QA database`);process.exit(2)}
const pepper=(process.env.PASSWORD_PEPPER??"").trim();if(!pepper){console.error("REFUSED: PASSWORD_PEPPER missing (source the QA backend env)");process.exit(2)}
const ask=(label:string)=>new Promise<string>((resolve,reject)=>{let fd:number;try{fd=fs.openSync("/dev/tty","r+")}catch{return reject(new Error("no terminal available: run this command from your own terminal"))}
  const inp=new tty.ReadStream(fd);const out=new tty.WriteStream(fd);out.write(label);inp.setRawMode(true);inp.resume();inp.setEncoding("utf8");let buf="";
  inp.on("data",(c:string)=>{for(const ch of c){if(ch==="\r"||ch==="\n"||ch==="\u0004"){inp.setRawMode(false);inp.pause();out.write("\n");inp.destroy();return resolve(buf)}if(ch==="\u0003"){inp.setRawMode(false);out.write("\n");process.exit(130)}if(ch==="\u007f"){buf=buf.slice(0,-1)}else buf+=ch}})});
const existing=await prisma.user.findUnique({where:{email},select:{id:true,status:true,emailVerifiedAt:true}});
if(existing){console.error(`REFUSED: an account for ${email} already exists in ${db} (status ${existing.status}, verified ${Boolean(existing.emailVerifiedAt)}). Nothing was changed; use the password-reset procedure instead.`);await prisma.$disconnect();process.exit(3)}
const p1=await ask("New password (hidden): ");const p2=await ask("Repeat password (hidden): ");
if(p1!==p2){console.error("REFUSED: the two entries differ; nothing was created");process.exit(4)}
try{validatePasswordPolicy(p1)}catch(e:any){console.error("REFUSED: password does not meet the policy: "+String(e?.message??e));process.exit(4)}
const passwordHash=await hashPassword(p1,pepper);
const created=await prisma.$transaction(async tx=>{
  const user=await tx.user.create({data:{email,displayName:"Batkhaan (local QA customer)",passwordHash,status:"ACTIVE",emailVerificationRequired:true,emailVerifiedAt:new Date()}});
  const company=await tx.company.create({data:{name:"QA Synthetic ХХК (local owner test)",country:"Монгол",profile:{qaLocal:true,qaTag:"owner-local-customer",descriptionMn:"Зөвхөн локал QA-д зориулсан синтетик компани. Бодит өгөгдөл биш."}}});
  await tx.companyMembership.create({data:{companyId:company.id,userId:user.id,role:"OWNER"}});
  await tx.authAuditEvent.create({data:{userId:user.id,eventType:"LOCAL_QA_ACCOUNT_CREATED",metadata:{note:"LOCAL_QA_ACCOUNT_CREATED_BY_OWNER_SCRIPT",database:db,emailMarkedVerifiedByOwnerScript:true}} as any}).catch(()=>undefined);
  return {userId:user.id,companyId:company.id}});
console.log(`CREATED customer ${email} in database ${db} (user ${created.userId.slice(0,8)}…, synthetic company ${created.companyId.slice(0,8)}…, role OWNER)`);
if(process.env.QA_CUSTOMER_SKIP_LOGIN_CHECK!=="1"){
  const r=await fetch("http://127.0.0.1:5180/api/v1/auth/login",{method:"POST",headers:{"content-type":"application/json",origin:"http://localhost:5180"},body:JSON.stringify({email,password:p1})});
  const j:any=await r.json().catch(()=>({}));console.log(`LOGIN CHECK through http://localhost:5180 (frontend proxy to backend): HTTP ${r.status}${r.status===200?` — signed in as ${j?.data?.user?.email}`:""}`);
  if(r.status!==200)process.exitCode=5}
await prisma.$disconnect();
