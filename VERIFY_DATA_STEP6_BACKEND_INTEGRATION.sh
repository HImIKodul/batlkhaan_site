#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
python3 - "$ROOT" <<'PYV'
from pathlib import Path
import csv,json,hashlib,re,sys
root=Path(sys.argv[1])
step=root/'backend/integration/step6'
can=step/'canonical'
errors=[]
def need(msg,cond):
    if not cond: errors.append(msg)
def sha(p):
    h=hashlib.sha256();
    with p.open('rb') as f:
        for c in iter(lambda:f.read(1024*1024),b''): h.update(c)
    return h.hexdigest()

# Frozen canonical file hashes from Step 5.
expected={
'MMRI_5_DOMAIN_CANONICAL_INTEGRATION_QUESTIONS.csv':'076804abec0d3e4683b08fc31e16e88d58d7d8fb5e8650fb2ffc7c21123828d2',
'MMRI_5_DOMAIN_CANONICAL_INTEGRATION_QUESTIONS.jsonl':'6de437ff29ea94c32313c6657d9d85637cf6624e98f1f24e635caf6368a0ac3c',
'MMRI_5_DOMAIN_CANONICAL_SCHEMA_v1.json':'8590783e1ede102cc6cd851d8a785308a25f0cca13dd4f078f05b88cfde922d0'}
for name,h in expected.items():
    p=can/name;need(f'missing canonical {name}',p.exists());
    if p.exists(): need(f'hash mismatch {name}',sha(p)==h)

# Canonical structure.
with (can/'MMRI_5_DOMAIN_CANONICAL_INTEGRATION_QUESTIONS.csv').open(encoding='utf-8-sig',newline='') as f:
    rows=list(csv.DictReader(f))
need('canonical row count != 61440',len(rows)==61440)
ids=[r['QuestionID'] for r in rows];need('canonical IDs not unique',len(set(ids))==61440)
for d in ['MARKETING','HRMRI','FINMRI','ISMRI','OPMRI']:
    dr=[r for r in rows if r['DomainCode']==d]
    need(f'{d} count != 12288',len(dr)==12288)
    need(f'{d} categories != 64',len({r['CategoryID'] for r in dr})==64)
    need(f'{d} dimensions != 48',len({r['DimensionID'] for r in dr})==48)

# Reconciliation completeness.
with (step/'MMRI_STEP6_OF_7_QUESTION_ID_RECONCILIATION.csv').open(encoding='utf-8-sig',newline='') as f:
    rec=list(csv.DictReader(f))
need('reconciliation row count != 61440',len(rec)==61440)
need('reconciliation ID set differs from canonical',set(r['QuestionID'] for r in rec)==set(ids))
mark=[r for r in rec if r['DomainCode']=='MARKETING']
need('Marketing ID match != 12288',sum(r['IdMatch']=='TRUE' for r in mark)==12288)
need('Marketing content conflict evidence missing',sum(r['ReconciliationStatus']=='ID_MATCH_CONTENT_VERSION_CONFLICT' for r in mark)==12288)
for d in ['HRMRI','FINMRI','ISMRI','OPMRI']:
    dr=[r for r in rec if r['DomainCode']==d]
    need(f'{d} should require new version',sum(r['ReconciliationStatus']=='CANONICAL_NEW_VERSION_NOT_IN_LEGACY_RUNTIME' for r in dr)==12288)

# Current runtime facts.
marketing=json.load((root/'backend/methodology/MMRI_v3.0.0_QBANK_v3.1.0_CELL_REACHABILITY_STEP05.json').open(encoding='utf-8'))
need('Marketing questions != 12288',len(marketing.get('questions',[]))==12288)
need('Marketing categories != 64',len(marketing.get('categories',[]))==64)
legacy={'it-1.5-repaired.json':3072,'finance-2.8.0-repaired.json':12288,'people-18.4-repaired.json':3072,'operations-1.4-repaired.json':3072}
for fn,n in legacy.items():
    d=json.load((root/'backend/methodology/domain-question-banks'/fn).open(encoding='utf-8'))
    need(f'{fn} count changed',len(d.get('questions',[]))==n)
hub=(root/'frontend/src/pages/DiagnosisHub.tsx').read_text(encoding='utf-8')
need('expected non-Marketing live lock not found',"if(id!=='marketing')return'locked'" in hub)
schema=(root/'backend/prisma/schema.prisma').read_text(encoding='utf-8')
need('Step6 must not silently add domainCode to schema','domainCode' not in schema)

# Pre-existing base file preservation.
manifest=step/'MMRI_STEP6_BASE_R17_21_4_PREEXISTING_SHA256.txt'
for line in manifest.read_text(encoding='utf-8').splitlines():
    if not line or line.startswith('#'): continue
    h,rel=line.split('  ',1);p=root/rel
    need(f'base file missing: {rel}',p.exists())
    if p.exists(): need(f'base file changed: {rel}',sha(p)==h)

if errors:
    print('MMRI DATA STEP 6/7 BACKEND INTEGRATION CONTRACT: FAIL')
    for e in errors: print(' -',e)
    raise SystemExit(1)
print('MMRI DATA STEP 6/7 BACKEND INTEGRATION CONTRACT: PASS')
print(' - 61,440 canonical questions verified')
print(' - 61,440 reconciliation rows verified')
print(' - Marketing runtime preserved')
print(' - non-Marketing legacy/runtime gap explicitly classified')
print(' - every pre-existing R17.21.4 Step08 file is byte-identical')
print(' - production activation remains intentionally deferred to Step 7/7')
PYV
