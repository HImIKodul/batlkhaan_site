#!/usr/bin/env node
/* Installs the five approved methodology bundles into an EMPTY (freshly migrated) database using ONLY files inside this release package.
   Cross-platform (Windows/Linux): node ops/provision-methodologies.mjs   (run from anywhere; paths are resolved from this file)
   Required environment (operator shell, never the service environment):
     DATABASE_URL                          owner/migration role URL (same URL used for `prisma migrate deploy`)
     MMRI_ENVIRONMENT                      e.g. production
     MMRI_PROVISION_FIVE_DOMAINS_OK=YES    acknowledgement of the target database
   Optional: MMRI_PROVISION_ACTIVATE=YES (+ MMRI_PRODUCTION_PROMOTION_OK=YES when MMRI_ENVIRONMENT=production) promotes the five bundles to ACTIVE.
   Idempotent: bundles are immutable; an identical re-import is a no-op. Never deletes or rewrites existing rows. Existing databases that already hold the methodologies need no provisioning. */
import {spawnSync} from 'node:child_process';import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
const BE=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','backend');
const need=n=>{if(!process.env[n]){console.error(`${n} is required.`);process.exit(2)}};
if(process.env.MMRI_PROVISION_FIVE_DOMAINS_OK!=='YES'){console.error('Set MMRI_PROVISION_FIVE_DOMAINS_OK=YES to acknowledge the target database.');process.exit(2)}
need('MMRI_ENVIRONMENT');need('DATABASE_URL');
const u=new URL(process.env.DATABASE_URL);console.log(`Target database: ${u.hostname}:${u.port||5432}${u.pathname}`);
const D='methodology/businessmri-v2.6-runtime-bundles/';
const steps=[
 {name:'Marketing 3.0.3',file:'methodology/MMRI_v3.0.3_QBANK_v3.1.3_STEP6_OF6_ACCEPTED_FINAL.json',env:{MMRI_EXPECT_METHODOLOGY_VERSION:'3.0.3',MMRI_EXPECT_QBANK_VERSION:'3.1.3',MMRI_IMPORT_TARGET_ONLY:'YES'}},
 {name:'People (HRMRI) 4.1.7',file:D+'MMRI_HRMRI_Methodology_4.1.7_BUSINESSMRI_V2.json',env:{MMRI_EXPECT_METHODOLOGY_VERSION:'4.1.7'}},
 {name:'Finance (FINMRI) 4.2.7',file:D+'MMRI_FINMRI_Methodology_4.2.7_BUSINESSMRI_V2.json',env:{MMRI_EXPECT_METHODOLOGY_VERSION:'4.2.7'}},
 {name:'Information Technology (ITMRI) 4.3.7',file:D+'MMRI_ISMRI_Methodology_4.3.7_BUSINESSMRI_V2.json',env:{MMRI_EXPECT_METHODOLOGY_VERSION:'4.3.7'}},
 {name:'Production & Operations (POMMRI) 4.4.7',file:D+'MMRI_OPMRI_Methodology_4.4.7_BUSINESSMRI_V2.json',env:{MMRI_EXPECT_METHODOLOGY_VERSION:'4.4.7'}},
];
for(const s of steps)if(!fs.existsSync(path.join(BE,s.file))){console.error('Missing packaged file: '+s.file);process.exit(3)}
const run=(label,script,env={},args=[])=>{console.log(`[${label}]`);const r=spawnSync(process.execPath,[path.join('dist',script),...args],{cwd:BE,env:{...process.env,...env},stdio:['ignore','pipe','pipe'],encoding:'utf8',maxBuffer:1<<28});
 const tail=(r.stdout+r.stderr).trim().split('\n').slice(-3).join('\n');console.log(tail);if(r.status!==0){console.error(`FAILED: ${label} (exit ${r.status})`);process.exit(r.status||1)}return r.stdout};
for(const s of steps)run(s.name,'import-methodology.js',s.env,[s.file]);
run('Verify structure (any status)','verify-five-domain-provisioning.js',{MMRI_EXPECT_DOMAIN_STATUS:'ANY'});
if(process.env.MMRI_PROVISION_ACTIVATE==='YES'){
 run('Activate','promote-five-domain-methodologies.js',{MMRI_FIVE_DOMAIN_PROMOTION_OK:'YES'});
 run('Verify ACTIVE','verify-five-domain-provisioning.js',{MMRI_EXPECT_DOMAIN_STATUS:'ACTIVE'});
}else console.log('Activation skipped (set MMRI_PROVISION_ACTIVATE=YES).');
console.log('PROVISIONING COMPLETE');
