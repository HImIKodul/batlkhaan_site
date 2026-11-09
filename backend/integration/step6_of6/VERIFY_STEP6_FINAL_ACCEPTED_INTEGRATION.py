#!/usr/bin/env python3
import csv,json,hashlib,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]; M=ROOT/'methodology'; MASTER=ROOT/'integration'/'step6_of6'/'MMRI_STEP5_OF6_ACCEPTED_5_DOMAIN_MASTER_61440.csv'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
rows=list(csv.DictReader(MASTER.open(encoding='utf-8-sig'))); assert len(rows)==61440
assert len({(r['DomainCode'],r['QuestionID']) for r in rows})==61440
files=[('MARKETING',M/'MMRI_v3.0.3_QBANK_v3.1.3_STEP6_OF6_ACCEPTED_FINAL.json','3.0.3'),('HRMRI',M/'businessmri-v2.4-runtime-bundles/MMRI_HRMRI_Methodology_4.1.4_BUSINESSMRI_V2.json','4.1.4'),('FINMRI',M/'businessmri-v2.4-runtime-bundles/MMRI_FINMRI_Methodology_4.2.4_BUSINESSMRI_V2.json','4.2.4'),('ISMRI',M/'businessmri-v2.4-runtime-bundles/MMRI_ISMRI_Methodology_4.3.4_BUSINESSMRI_V2.json','4.3.4'),('OPMRI',M/'businessmri-v2.4-runtime-bundles/MMRI_OPMRI_Methodology_4.4.4_BUSINESSMRI_V2.json','4.4.4')]
for dom,p,ver in files:
 d=json.load(p.open(encoding='utf8')); assert len(d['questions'])==12288
 assert d['methodologyVersion']==ver
 qids={q.get('questionId') for q in d['questions']}; assert len(qids)==12288
 src={r['QuestionID']:r for r in rows if r['DomainCode']==dom}; assert set(src)==qids
 for q in d['questions']:
  r=src[q['questionId']]; assert q['textMn']==r['Question']; aa=[r[f'Answer{i}'] for i in range(1,9) if r[f'Answer{i}']]; assert q['optionsMn']==aa; assert len(q['explicitOptions'])==len(aa)
  assert all(o['labelMn']==aa[i] for i,o in enumerate(q['explicitOptions']))
print(json.dumps({'status':'PASS','rows':61440,'domains':5,'questionsPerDomain':12288},ensure_ascii=False))
