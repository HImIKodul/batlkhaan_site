// WS-F regression: MMRI-09 (relocatable backup checksums) and MMRI-10 (report volume ownership).
// Synthetic only: stub pg_dump/pg_restore/psql, temp dirs, no database, no docker, no network.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));const repo=path.resolve(here,'../..');
const results=[];const add=(n,ok,d='')=>{results.push({n,ok:!!ok});console.log(`${ok?'PASS':'FAIL'} ${n}${ok||!d?'':' -- '+String(d).slice(0,200)}`)};
// ---------- MMRI-09
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'mmri-wsf-'));const bin=path.join(tmp,'bin');fs.mkdirSync(bin);
const exe=(n,b)=>{const p=path.join(bin,n);fs.writeFileSync(p,`#!/usr/bin/env bash\nset -euo pipefail\n${b}\n`);fs.chmodSync(p,0o755)};
exe('pg_dump',`out=''; for a in "$@"; do case "$a" in --file=*) out="\${a#--file=}";; esac; done; printf 'FAKE\\n' > "$out"`);
exe('pg_restore',`[[ "\${1:-}" == --list ]] && exit 0; exit 0`);exe('psql','echo 16.4');
const reports=path.join(tmp,'reports');fs.mkdirSync(reports);fs.writeFileSync(path.join(reports,'a.pdf'),'PDF');
const env={...process.env,PATH:`${bin}:${process.env.PATH}`,DATABASE_URL:'postgresql://x:y@db.invalid/m',MMRI_REPORT_STORAGE_DIR:reports,BACKUP_SET_DIR:path.join(tmp,'sets'),RELEASE_SHA:'wsf'};
const run=(c,a,x={})=>spawnSync(c,a,{cwd:repo,env:{...env,...x},encoding:'utf8'});
let r=run('bash',['ops/backup-all.sh']);const setDir=r.stdout.trim().split('\n').at(-1);add('backup set created',r.status===0&&fs.existsSync(setDir),r.stderr);
r=run('bash',['ops/verify-backup-set.sh',setDir]);add('original location verifies',r.status===0,r.stderr);
const moved=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'mmri-wsf-moved-')),'relocated-set');
spawnSync('cp',['-r',setDir,moved]);
fs.renameSync(setDir,setDir+'.gone'); // original path no longer exists, as on a recovery host
r=run('bash',['ops/verify-backup-set.sh',moved]);add('RELOCATED copy verifies (MMRI-09)',r.status===0,r.stderr);
r=run('bash',['ops/restore-backup-set.sh',moved],{ALLOW_DESTRUCTIVE_RESTORE:'YES',RECOVERY_DATABASE_URL:'postgresql://r:r@r.invalid/x',RECOVERY_REPORT_STORAGE_DIR:path.join(tmp,'recrep2')});
add('restore from RELOCATED set works (original gone)',r.status===0,r.stderr);fs.renameSync(setDir+'.gone',setDir);
let abs=[];for(const f of fs.readdirSync(setDir).filter(f=>f.endsWith('.sha256'))){const t=fs.readFileSync(path.join(setDir,f),'utf8');if(/\s\*?\//.test(t))abs.push(f)}
add('no sidecar/manifest checksum contains an absolute path',abs.length===0,abs.join(','));
// tamper detection must still work after relocation
const dump=fs.readdirSync(moved).find(f=>f.endsWith('.dump'));fs.appendFileSync(path.join(moved,dump),'X');
r=run('bash',['ops/verify-backup-set.sh',moved]);add('tampered relocated copy is rejected',r.status!==0);
// legacy absolute-path sidecars (made before the fix) must still verify in place
const legacy=path.join(tmp,'legacy');spawnSync('cp',['-r',setDir,legacy]);
for(const f of fs.readdirSync(legacy).filter(f=>f.endsWith('.sha256'))){const p=path.join(legacy,f);const t=fs.readFileSync(p,'utf8').replace(/^(\S+)\s+\*?(.+)$/,(m,h,n)=>`${h}  ${path.join(legacy,path.basename(n))}`);fs.writeFileSync(p,t)}
r=run('bash',['ops/verify-backup-set.sh',legacy]);add('legacy absolute-path set still verifies (backward compatible)',r.status===0,r.stderr);
const rr=path.join(tmp,'recrep');r=run('bash',['ops/restore-backup-set.sh',legacy],{ALLOW_DESTRUCTIVE_RESTORE:'YES',RECOVERY_DATABASE_URL:'postgresql://r:r@r.invalid/x',RECOVERY_REPORT_STORAGE_DIR:rr});
add('restore from legacy-relocated-style set works',r.status===0,r.stderr);
// ---------- MMRI-10
const read=p=>fs.readFileSync(path.join(repo,p),'utf8');
const py=spawnSync('python3',['-I','-c',`import yaml,json,sys;print(json.dumps(yaml.safe_load(open(sys.argv[1]))))`,path.join(repo,'deploy/docker-compose.production.yml')],{encoding:'utf8'});
const compose=JSON.parse(py.stdout||'{}');
const dfProd=read('backend/Dockerfile.production'),dfMig=read('backend/Dockerfile.migrate');
const mount=s=>{const v=(compose.services?.[s]?.volumes||[]).find(x=>x.startsWith('mmri_report_storage:'));return v&&v.split(':')[1]};
const apiMount=mount('api'),migMount=mount('migrate');
const apiEnvDir=compose.services?.api?.environment?.MMRI_REPORT_STORAGE_DIR;
add('compose parses; api mount equals MMRI_REPORT_STORAGE_DIR',apiMount&&apiMount===apiEnvDir,`${apiMount} vs ${apiEnvDir}`);
const mkdirsChown=(df,dir)=>{const mk=new RegExp(`mkdir[^\\n]*${dir}`).test(df.replace(/\\\n/g,' '));const ch=new RegExp(`chown[^\\n]*mmri:mmri[^\\n]*${dir}`).test(df.replace(/\\\n/g,' '));return mk&&ch};
add('API image creates AND chowns the mounted dir for runtime user',mkdirsChown(dfProd,apiMount||'?'));
add('API image ENV default storage dir equals compose mount',new RegExp(`MMRI_REPORT_STORAGE_DIR=${(apiMount||'?')}\\b`).test(dfProd));
add('API image runs as non-root user mmri (after chown)',/USER mmri/.test(dfProd)&&dfProd.indexOf('USER mmri')>dfProd.search(/chown[^\n]*mmri/));
add('migrate image creates AND chowns the mounted dir (it initialises the volume first)',migMount?mkdirsChown(dfMig,migMount):true,`migrate mount ${migMount}`);
add('migrate image runs non-root',/USER mmri/.test(dfMig));
add('compose does not force root user on api/migrate',!compose.services.api.user&&!compose.services.migrate.user||!/^(0|root)/.test(String(compose.services.api.user||'x')));
const bad=results.filter(x=>!x.ok).length;console.log(`WS-F ops: ${results.length-bad}/${results.length} PASS`);process.exit(bad?1:0);
