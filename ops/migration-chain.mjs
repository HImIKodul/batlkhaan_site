import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(here,'..');
const migrationsDir=path.join(repo,'backend','prisma','migrations');
const entries=fs.readdirSync(migrationsDir,{withFileTypes:true})
  .filter(x=>x.isDirectory())
  .map(x=>x.name)
  .sort();
if(!entries.length)throw new Error('No Prisma migrations found');
const hash=crypto.createHash('sha256');
const files=[];
for(const name of entries){
  const rel=`backend/prisma/migrations/${name}/migration.sql`;
  const full=path.join(repo,rel);
  if(!fs.existsSync(full))throw new Error(`Missing ${rel}`);
  const body=fs.readFileSync(full);
  hash.update(rel);hash.update('\0');hash.update(body);hash.update('\0');
  files.push({path:rel,sha256:crypto.createHash('sha256').update(body).digest('hex')});
}
const digest=hash.digest('hex');
const expectedFile=path.join(repo,'deploy','MIGRATION_CHAIN_SHA256.txt');
const expected=fs.existsSync(expectedFile)?fs.readFileSync(expectedFile,'utf8').trim().split(/\s+/)[0]:'';
if(process.argv.includes('--verify')){
  if(!expected)throw new Error('deploy/MIGRATION_CHAIN_SHA256.txt is missing or empty');
  if(expected!==digest)throw new Error(`Migration chain mismatch: expected ${expected}, got ${digest}`);
}
if(process.argv.includes('--json'))console.log(JSON.stringify({sha256:digest,count:files.length,files},null,2));
else console.log(digest);
