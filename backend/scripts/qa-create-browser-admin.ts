/** Owned disposable flow database only; stores generated credentials privately, prints none. */
import fs from 'node:fs';import path from 'node:path';import {randomBytes} from 'node:crypto';
import {prisma} from '../src/db.js';import {loadApiConfig} from '../src/api/config.js';import {AdminService} from '../src/api/admin/admin-service.js';
const target=new URL(process.env.DATABASE_URL??'postgresql://invalid/invalid'),dest=process.env.ADMIN_CREDENTIAL_FILE||'';
if(!/^\/mmri_acceptance_flow_[0-9]{14}$/.test(target.pathname)||!['127.0.0.1','localhost'].includes(target.hostname)||target.port!=='55432'||!dest.includes('/CODEX_PROGRESS/')||!dest.includes('/private/')||fs.existsSync(dest))throw new Error('Owned flow target and new private credential file required');
try{
 const email=`admin.qa.browser.${Date.now()}@example.invalid`,password=randomBytes(24).toString('base64url')+'Aa1!';
 const admin=await new AdminService(loadApiConfig()).createAdmin({email,password,role:'SUPER_ADMIN'});
 fs.mkdirSync(path.dirname(dest),{recursive:true,mode:0o700});fs.writeFileSync(dest,JSON.stringify({email,password,totpSecret:admin.totpSecret})+'\n',{mode:0o600,flag:'wx'});
 console.log('Created one disposable SUPER_ADMIN browser fixture; credentials saved privately');
}finally{await prisma.$disconnect()}
