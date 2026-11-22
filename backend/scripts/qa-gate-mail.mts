/* MAIL-01 on an ISOLATED staging DB: a verification code / reset link that was never delivered must not consume the cooldown or hourly budget. Uses the real services with a failing mailer. */
import {prisma} from "../src/db.js";import {loadApiConfig} from "../src/api/config.js";
import {EmailVerificationService} from "../src/api/auth/email-verification-service.js";import {PasswordResetService} from "../src/api/auth/password-reset-service.js";
import crypto from "node:crypto";
const db=new URL(process.env.DATABASE_URL!).pathname;if(!/stage|scratch|final|audit|qa_gate/.test(db)||/\/mmri$/.test(db))throw new Error("REFUSED: not a disposable database "+db);
let pass=0,fail=0;const rec=(n:string,ok:boolean,d="")=>{ok?pass++:fail++;console.log((ok?"PASS ":"FAIL ")+n+(d?" | "+d:""))};
const config:any=loadApiConfig();const sent:any[]=[];
const good:any={provider:"mock",async send(m:any){sent.push(m);return {delivered:true,provider:"mock"}}};
const down:any={provider:"gmail",async send(){throw new Error("provider outage")}};
const notDelivered:any={provider:"disabled",async send(){return {delivered:false,provider:"disabled"}}};
const email=`mail.gate.${Date.now()}.${crypto.randomBytes(2).toString("hex")}@mmri.test`;
const user=await prisma.user.create({data:{email,passwordHash:"x",displayName:"Mail gate",emailVerificationRequired:true,status:"ACTIVE"} as any});
const fp:any={ip:"127.0.0.1",userAgent:"qa"};
const tokens=(purpose:string)=>prisma.passwordResetToken.count({where:{userId:user.id,purpose}});
const EV="EMAIL_VERIFICATION";const purposeOf=async()=>{const t=await prisma.passwordResetToken.findFirst({where:{userId:user.id},orderBy:{createdAt:"desc"}});return t?.purpose};
const ev=new EmailVerificationService(config,good),evDown=new EmailVerificationService(config,down),evNot=new EmailVerificationService(config,notDelivered);
// outage x6 (the hourly cap is 5): none of them may consume the budget
let thrown=0;for(let i=0;i<6;i++){try{await evDown.requestCode(email,fp)}catch{thrown++}}
rec("outage: each failed send is reported to the caller",thrown===6);
const afterOutage=await prisma.passwordResetToken.count({where:{userId:user.id}});rec("outage: no undelivered code remains stored (nothing consumed the hourly budget)",afterOutage===0,`tokens=${afterOutage}`);
await evNot.requestCode(email,fp);rec("provider accepted nothing (not delivered): the code is not kept",(await prisma.passwordResetToken.count({where:{userId:user.id}}))===0);
await ev.requestCode(email,fp);rec("immediately after the outage a retry is allowed and a code is mailed",sent.length===1&&/\n\d{6}\n/.test(sent[0].text),`sent=${sent.length}`);
const live=await prisma.passwordResetToken.count({where:{userId:user.id,usedAt:null}});rec("exactly one live code exists after the successful retry",live===1);
await ev.requestCode(email,fp);rec("normal cooldown still applies after a SUCCESSFUL send (no second mail inside the cooldown)",sent.length===1);
// password reset
await prisma.user.update({where:{id:user.id},data:{emailVerifiedAt:new Date(),emailVerificationRequired:false}});
const pr=new PasswordResetService(config,good),prDown=new PasswordResetService(config,down);const before=sent.length;
let t2=0;for(let i=0;i<6;i++){try{await prDown.requestReset(email,fp)}catch{t2++}}
rec("reset outage: failures surface to the caller and leave no stored link",t2===6&&(await prisma.passwordResetToken.count({where:{userId:user.id,purpose:{not:"EMAIL_VERIFICATION"}}}))===0);
await pr.requestReset(email,fp);rec("reset retry right after the outage succeeds and mails a link",sent.length===before+1&&/reset-password\?token=/.test(sent[sent.length-1].text));
// MAIL-02 code-level
import fs from "node:fs";const src=fs.readFileSync(new URL("../src/api/mail/lifecycle-mail.ts",import.meta.url),"utf8");
rec("MAIL-02 (code-level): administrator recipient lookup failure now fails CLOSED (recipients emptied, alert deferred)",/admin_mail_eligibility_lookup_failed/.test(src)&&/recipients = \[\]; \}/.test(src)&&!/keep the configured list/.test(src));
await prisma.passwordResetToken.deleteMany({where:{userId:user.id}});await prisma.user.delete({where:{id:user.id}}).catch(()=>undefined);
console.log(`RESULT pass=${pass} fail=${fail}`);await prisma.$disconnect();process.exit(fail?1:0);
