#!/usr/bin/env python3
import csv,hashlib,json,re,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
B=ROOT/'backend'; M=B/'methodology'; STEP=B/'integration'/'step10'
MASTER=STEP/'MMRI_STEP09_FINAL_MONGOLIAN_QA_VERIFIED_61440.csv'
OLD={
'marketing':('MMRI_v3.0.0_QBANK_v3.1.0_CELL_REACHABILITY_STEP05.json','2dab0a3b313d018bc57f28f798b92a31738e4b33e99f3e7adc5e9422fc8b9ed0'),
'people':('businessmri-v2-runtime-bundles/MMRI_HRMRI_Methodology_4.1.0_BUSINESSMRI_V2.json','a395964a7a7900c384e0f64ae6b5aa38a4a05c2ab0631429b588b08dd64cb44a'),
'finance':('businessmri-v2-runtime-bundles/MMRI_FINMRI_Methodology_4.2.0_BUSINESSMRI_V2.json','ba6705fc1d53582bf60704585fc860b54a416bea530775e9ee62f830b8b550a8'),
'it':('businessmri-v2-runtime-bundles/MMRI_ISMRI_Methodology_4.3.0_BUSINESSMRI_V2.json','d72219b0ac35ac590f4e54c3d56805432b03e9b5536a2e20d6146096552e6976'),
'operations':('businessmri-v2-runtime-bundles/MMRI_OPMRI_Methodology_4.4.0_BUSINESSMRI_V2.json','587f6c38896716b4f135c1847692362b54b65c94457d4e53567c80fd935f9de4')}
NEW={
'marketing':'MMRI_v3.0.1_QBANK_v3.1.1_MONGOLIAN_WORDING_STEP10.json',
'people':'businessmri-v2.1-runtime-bundles/MMRI_HRMRI_Methodology_4.1.1_BUSINESSMRI_V2.json',
'finance':'businessmri-v2.1-runtime-bundles/MMRI_FINMRI_Methodology_4.2.1_BUSINESSMRI_V2.json',
'it':'businessmri-v2.1-runtime-bundles/MMRI_ISMRI_Methodology_4.3.1_BUSINESSMRI_V2.json',
'operations':'businessmri-v2.1-runtime-bundles/MMRI_OPMRI_Methodology_4.4.1_BUSINESSMRI_V2.json'}
BANK_OLD={'people':'people-businessmri-v2.0-canonical-frozen.json','finance':'finance-businessmri-v2.0-canonical-frozen.json','it':'it-businessmri-v2.0-canonical-frozen.json','operations':'operations-businessmri-v2.0-canonical-frozen.json'}
BANK_NEW={'people':'people-businessmri-v2.1-mongolian-wording.json','finance':'finance-businessmri-v2.1-mongolian-wording.json','it':'it-businessmri-v2.1-mongolian-wording.json','operations':'operations-businessmri-v2.1-mongolian-wording.json'}
DOMAIN_CODE={'marketing':'MARKETING','people':'HRMRI','finance':'FINMRI','it':'ISMRI','operations':'OPMRI'}
PROHIBITED=['AI','API','KPI','workflow','analytics','benchmark','baseline','Treasury','S&OP','HRIS','onboarding','dashboard','platform','ecosystem','экосистем','интеграц','каталог','процесс','платформ','логистик','архитектур','аппликейшн','вэбсайт']
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def load(p): return json.load(open(p,encoding='utf-8'))
def fail(msg): print('FAIL',msg); raise SystemExit(2)
def ok(msg): print('PASS',msg)
# Step9 master.
rows={d:{} for d in DOMAIN_CODE.values()};cats={d:{} for d in DOMAIN_CODE.values()};dims={d:{} for d in DOMAIN_CODE.values()}
with MASTER.open(encoding='utf-8-sig',newline='') as f:
 for r in csv.DictReader(f): rows[r['DomainCode']][r['QuestionID']]=r;cats[r['DomainCode']][r['CategoryID']]=r['CategoryName'];dims[r['DomainCode']][r['DimensionID']]=r['DimensionName']
if sum(len(x) for x in rows.values())!=61440: fail('Step9 master row count')
ok('Step9 master 61,440 rows')
# Rollback source hashes preserved.
for dom,(rel,expect) in OLD.items():
 p=M/rel
 if sha(p)!=expect: fail(f'{dom} rollback runtime hash changed')
ok('all five original runtime files remain byte-identical for rollback')
# Bundle-by-bundle wording and semantic invariance.
for dom,newrel in NEW.items():
 old=load(M/OLD[dom][0]); new=load(M/newrel); md=DOMAIN_CODE[dom]
 if len(new['questions'])!=12288 or len(new['categories'])!=64: fail(f'{dom} new counts')
 qmap=rows[md]
 oldq={q['questionId']:q for q in old['questions']};newq={q['questionId']:q for q in new['questions']}
 if set(oldq)!=set(newq) or set(newq)!=set(qmap): fail(f'{dom} question IDs')
 for qid,nq in newq.items():
  r=qmap[qid]; aa=[r[f'Answer{i}'] for i in range(1,8) if r.get(f'Answer{i}')]
  if nq['textMn']!=r['QuestionText'] or nq['optionsMn']!=aa: fail(f'{dom} wording mismatch {qid}')
  oq=oldq[qid]
  # Scoring/runtime fields must be unchanged except visible labels.
  o_sem={k:v for k,v in oq.items() if k not in ('textMn','optionsMn')}
  n_sem={k:v for k,v in nq.items() if k not in ('textMn','optionsMn')}
  if 'explicitOptions' in o_sem:
   o_sem['explicitOptions']=[{k:v for k,v in x.items() if k!='labelMn'} for x in o_sem['explicitOptions']]
   n_sem['explicitOptions']=[{k:v for k,v in x.items() if k!='labelMn'} for x in n_sem['explicitOptions']]
  if o_sem!=n_sem: fail(f'{dom} runtime semantic drift {qid}')
 for c in new['categories']:
  if c['Category']!=cats[md][c['ID']]: fail(f'{dom} category label mismatch {c["ID"]}')
 visible=[]
 for c in new['categories']: visible += [c['Category'],c['Module']]
 for c in new['cellTemplates']: visible += [c['Diagnostic cell']]
 for q in new['questions']: visible += [q['textMn'],*q['optionsMn']]
 for pq in new['profileQuestions']: visible += [pq['questionMn'],*pq['optionsMn']]
 if any(re.search(r'[A-Za-z]',x) for x in visible): fail(f'{dom} raw Latin remains in visible methodology text')
 for t in PROHIBITED:
  if any(t.lower() in x.lower() for x in visible): fail(f'{dom} prohibited visible term remains: {t}')
 ok(f'{dom} 12,288 wording rows integrated; scoring/state semantics unchanged')
# Canonical BusinessMRI banks preserve code/value/state metadata.
for dom in ('people','finance','it','operations'):
 ob=load(M/'domain-question-banks-businessmri-v2.0'/BANK_OLD[dom]);nb=load(M/'domain-question-banks-businessmri-v2.1'/BANK_NEW[dom]);md=DOMAIN_CODE[dom]
 oq={q['id']:q for q in ob['questions']};nq={q['id']:q for q in nb['questions']}
 if set(oq)!=set(nq): fail(f'{dom} canonical ID drift')
 for qid,q in nq.items():
  r=rows[md][qid]
  if q['question']!=r['QuestionText'] or q['options']!=[r[f'Answer{i}'] for i in range(1,8) if r.get(f'Answer{i}')]: fail(f'{dom} canonical wording {qid}')
  for key in ['optionCodes','canonicalValues','runtimeStates','scoringEnabled','answerDirection','normalizedWeight','periodMode','evidencePath','applicability','naAllowed']:
   if q.get(key)!=oq[qid].get(key): fail(f'{dom} canonical semantic drift {qid}:{key}')
ok('four canonical BusinessMRI v2.1 banks preserve runtime code/value/state semantics')
# Target bindings and UI context path.
target=(B/'src/methodology-target.ts').read_text();domain=(B/'src/domain-methodology.ts').read_text();start=(ROOT/'START_LOCAL.sh').read_text()
for token in ['3.0.3','3.1.3','MMRI_v3.0.3_QBANK_v3.1.3_STEP6_OF6_ACCEPTED_FINAL.json']:
 if token not in target+start: fail('target/start missing '+token)
for v in ['4.1.4','4.2.4','4.3.4','4.4.4']:
 if v not in domain+start+(B/'scripts/import-five-domain-candidates.sh').read_text(): fail('domain target missing '+v)
qs=(B/'src/api/services/query-service.ts').read_text();types=(ROOT/'frontend/src/api/types.ts').read_text();ui=(ROOT/'frontend/src/components/AssessmentInline.tsx').read_text();css=(ROOT/'frontend/src/pages/questionnaire.css').read_text()
for token in ['contextMn:row.question.category.nameMn','contextMn:open.contextMn']:
 if token not in qs: fail('query context missing '+token)
if 'contextMn?:string|null' not in types or 'question.contextMn' not in ui or 'mmri-questionnaire__context' not in css: fail('frontend separate context path missing')
if '—' in ui[ui.find('question.contextMn')-200:ui.find('question.contextMn')+400]: fail('context reattached with em dash')
ok('DisplayContext is rendered separately from question text')
# Frontend static capability/demo surfaces.
cap=(ROOT/'frontend/src/data/canonicalCapabilities.ts').read_text();samples=(ROOT/'frontend/src/data/domainQuestionSamples.ts').read_text()
for t in ['workflow','analytics','Treasury','S&OP']:
 if re.search(r'\b'+re.escape(t)+r'\b',cap+samples,re.I): fail('frontend static raw term '+t)
if samples.count('"id":')!=320: fail('demo sample count changed')
ok('frontend static capability and 320 demo sample surfaces reconciled')
print('PASS STEP10_INTEGRATION')
