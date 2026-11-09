import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const backend=path.resolve(here,'..');
const dir=path.join(backend,'prisma','migrations');
const names=fs.readdirSync(dir,{withFileTypes:true}).filter(x=>x.isDirectory()).map(x=>x.name).sort();
if(!names.length)throw new Error('No Prisma migrations found');
const h=crypto.createHash('sha256');
for(const name of names){const rel=`prisma/migrations/${name}/migration.sql`;h.update(`backend/${rel}`);h.update('\0');h.update(fs.readFileSync(path.join(backend,rel)));h.update('\0');}
const actual=h.digest('hex');
const expected=fs.readFileSync(path.join(backend,'prisma','MIGRATION_CHAIN_SHA256.txt'),'utf8').trim().split(/\s+/)[0];
if(actual!==expected){console.error(JSON.stringify({status:'FAIL',expected,actual,count:names.length},null,2));process.exit(1);}
console.log(JSON.stringify({status:'PASS',sha256:actual,count:names.length},null,2));
