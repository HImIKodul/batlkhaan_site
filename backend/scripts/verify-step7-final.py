#!/usr/bin/env python3
import json,glob,hashlib,collections,re,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]; B=ROOT/'backend'; banks=B/'methodology/domain-question-banks-businessmri-v2.0'; bundles=B/'methodology/businessmri-v2-runtime-bundles'; failures=[]
def ck(name,ok,detail=''):
 print(('PASS' if ok else 'FAIL'),name,detail)
 if not ok:failures.append(name)
manifest=json.load(open(bundles/'manifest-step7-five-domain-runtime.json'))
ck('canonical SHA',manifest['canonicalContentSHA256']=='34337d26022965045515d57030ba1f1d2b01a1df5642c77a87d2890a12acac25')
for domain,x in manifest['domains'].items():
 p=bundles/x['file']; raw=p.read_bytes(); b=json.loads(raw); h=hashlib.sha256(raw).hexdigest()
 ck(domain+' bundle SHA',h==x['sha256'],h); ck(domain+' structure',len(b['categories'])==64 and len(b['cellInstances'])==3072 and len(b['questions'])==12288 and len(b['runtimePolicy']['questionPolicies'])==12288 and len(b['runtimePolicy']['cellPolicies'])==3072)
 mods=collections.defaultdict(float)
 for c in b['categories']:mods[c['Module']]+=float(c['Category weight %'])
 ck(domain+' five goals',len(mods)==5 and all(abs(v-20)<1e-6 for v in mods.values()),dict(mods))
 cells=collections.defaultdict(float)
 for c in b['cellInstances']:cells[c['categoryId']]+=float(c.get('weightPctOverride') or 0)
 ck(domain+' capability cell weights',len(cells)==64 and all(abs(v-100)<1e-6 for v in cells.values()))
 ck(domain+' Q3/Q4 non-scoring',all(all(o['score'] is None for o in q['explicitOptions']) for q in b['questions'] if q['path'] in (3,4)))
mp=B/'methodology/MMRI_v3.0.0_QBANK_v3.1.0_CELL_REACHABILITY_STEP05.json'; mh=hashlib.sha256(mp.read_bytes()).hexdigest();ck('Marketing frozen runtime preserved',mh=='2dab0a3b313d018bc57f28f798b92a31738e4b33e99f3e7adc5e9422fc8b9ed0',mh)
ck('domain migration present',(B/'prisma/migrations/20261010090000_step7_five_domain_integration/migration.sql').exists())
ck('promotion guard present','MMRI_PRODUCTION_PROMOTION_OK' in (B/'src/promote-five-domain-methodologies.ts').read_text())
print(json.dumps({'status':'PASS' if not failures else 'FAIL','checksFailed':failures},ensure_ascii=False))
sys.exit(1 if failures else 0)
