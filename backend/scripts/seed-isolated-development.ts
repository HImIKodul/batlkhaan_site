/** Creates one synthetic company only in a fresh, explicitly selected scratch database. */
import fs from 'node:fs';
import {randomBytes} from 'node:crypto';
import {prisma} from '../src/db.js';
import {loadApiConfig} from '../src/api/config.js';
import {hashPassword} from '../src/api/auth/crypto.js';
const target=new URL(process.env.DATABASE_URL??'');
if(!/^\/mmri_codexfix_release_[0-9]+$/.test(target.pathname)||!['127.0.0.1','localhost'].includes(target.hostname))throw new Error('Refusing non-release scratch database');
const destination=process.env.MMRI_SYNTHETIC_CREDENTIAL_FILE;
if(!destination||!destination.startsWith('/tmp/')||fs.existsSync(destination))throw new Error('A new /tmp credential file is required');
try{
 if(await prisma.user.count()||await prisma.company.count())throw new Error('Scratch dataset is not empty; existing data preserved');
 const password=randomBytes(24).toString('base64url')+'Aa1!';
 const passwordHash=await hashPassword(password,loadApiConfig().passwordPepper);
 const email='synthetic-owner@businessmri.invalid';
 await prisma.$transaction(async tx=>{
  const user=await tx.user.create({data:{email,passwordHash,displayName:'Synthetic release test owner'}});
  await tx.company.create({data:{name:'BusinessMRI.mn синтетик тест компани',memberships:{create:{userId:user.id,role:'OWNER'}}}});
 });
 fs.writeFileSync(destination,JSON.stringify({email,password})+'\n',{mode:0o600,flag:'wx'});
 console.log(JSON.stringify({database:target.pathname.slice(1),users:await prisma.user.count(),companies:await prisma.company.count(),synthetic:true}));
}finally{await prisma.$disconnect()}
