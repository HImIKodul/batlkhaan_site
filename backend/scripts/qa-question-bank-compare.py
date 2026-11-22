#!/usr/bin/env python3
"""READ-ONLY comparison of the five ACTIVE methodology bundles with the approved Marketing benchmark and with the four audited domain workbooks.
No rewriting, no database access. Usage: qa-question-bank-compare.py <out.json> [--workbooks DIR] [--csv DIR]
Reports facts only: identity/hashes, structure, mapping integrity, text findings F02-F05 (from the independent audit), option vocabulary, and bundle-vs-workbook differences."""
import json,sys,os,re,hashlib,zipfile,html,collections
HERE=os.path.dirname(os.path.abspath(__file__));M=os.path.join(HERE,'..','methodology')
ACTIVE={ # domain -> (file, DB methodology version recorded in the QA database)
 'marketing':('MMRI_v3.0.3_QBANK_v3.1.3_STEP6_OF6_ACCEPTED_FINAL.json','3.0.3'),
 'finance':('businessmri-v2.6-runtime-bundles/MMRI_FINMRI_Methodology_4.2.7_BUSINESSMRI_V2.json','4.2.7'),
 'people':('businessmri-v2.6-runtime-bundles/MMRI_HRMRI_Methodology_4.1.7_BUSINESSMRI_V2.json','4.1.7'),
 'it':('businessmri-v2.6-runtime-bundles/MMRI_ISMRI_Methodology_4.3.7_BUSINESSMRI_V2.json','4.3.7'),
 'operations':('businessmri-v2.6-runtime-bundles/MMRI_OPMRI_Methodology_4.4.7_BUSINESSMRI_V2.json','4.4.7')}
CANDIDATE=('marketing-3.0.4-candidate','MMRI_v3.0.4_QBANK_v3.1.4_FINAL_61440_REPAIRED.json')
WB={'people':'02_Human_Resources_Questions_Answers_64_Categories.xlsx','finance':'03_Finance_Questions_Answers_64_Categories.xlsx','it':'04_Information_Technology_Questions_Answers_64_Categories.xlsx','operations':'05_Production_Operations_Questions_Answers_64_Categories.xlsx'}
def xl(path):
    z=zipfile.ZipFile(path);ss=[]
    x=z.read('xl/sharedStrings.xml').decode('utf8')
    for si in re.findall(r'<si>(.*?)</si>',x,flags=re.S):ss.append(html.unescape(''.join(re.findall(r'<t[^>]*>(.*?)</t>',si,flags=re.S))))
    names=re.findall(r'<sheet [^>]*?name="([^"]+)"',z.read('xl/workbook.xml').decode());out={}
    for i,n in enumerate(names,1):
        rows=[]
        for r in re.findall(r'<row [^>]*>(.*?)</row>',z.read(f'xl/worksheets/sheet{i}.xml').decode('utf8'),flags=re.S):
            row={}
            for m in re.finditer(r'<c r="([A-Z]+)\d+"([^>]*?)(?:/>|>(.*?)</c>)',r,flags=re.S):
                col,attr,body=m.group(1),m.group(2),m.group(3) or '';v=re.search(r'<v>(.*?)</v>',body,flags=re.S);t=re.search(r'<is>.*?<t[^>]*>(.*?)</t>',body,flags=re.S)
                if v:row[col]=ss[int(v.group(1))] if 't="s"' in attr else html.unescape(v.group(1))
                elif t:row[col]=html.unescape(t.group(1))
            rows.append(row)
        out[html.unescape(n)]=rows
    return out
norm=lambda s:re.sub(r'\s+',' ',str(s)).strip()
def sha(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for b in iter(lambda:f.read(1<<20),b''):h.update(b)
    return h.hexdigest()
GENERIC_NA=re.compile(r'(Үгүй,? ?(манай байгууллагад )?(энэ чиглэл )?хамаарахгүй|Тийм,? хамаарна)')
def analyse(name,rel):
    p=os.path.join(M,rel);d=json.load(open(p,encoding='utf8'));qs=d['questions'];cats=d['categories'];cells=d['cellInstances']
    cat_ids={c['ID'] for c in cats};ids=[q['questionId'] for q in qs];stems=collections.Counter(norm(q['textMn']) for q in qs)
    per_cell=collections.Counter((q['categoryId'],q['cellId']) for q in qs);paths=collections.Counter(q['path'] for q in qs)
    cell_keys=set()
    for c in cells:
        cell_keys.add((c.get('categoryId') or c.get('CategoryID') or c.get('categoryID'),c.get('cellId') or c.get('CellID')))
    optn=collections.Counter(len(q['optionsMn']) for q in qs);states=collections.Counter(o['state'] for q in qs for o in q['explicitOptions'])
    c01=[q for q in qs if q['cellId']=='C01'];c01_opts=collections.Counter(tuple(o['state'] for o in q['explicitOptions']) for q in c01)
    scored_wo_score=sum(1 for q in qs for o in q['explicitOptions'] if o['state']=='SCORED' and o['score'] is None)
    dnk_scored=sum(1 for q in qs for o in q['explicitOptions'] if o['state'] in('DNK','N_A_CLAIM') and o['score'] is not None)
    r={'name':name,'file':rel,'fileSha256':sha(p),'bundleVersion':d.get('bundleVersion'),'methodologyVersion':d.get('methodologyVersion'),'questionBankVersion':d.get('questionBankVersion'),'releaseStatus':d.get('releaseStatus'),'domainCode':d.get('domainCode'),
     'counts':{'categories':len(cats),'cellInstances':len(cells),'questions':len(qs),'profileQuestions':len(d.get('profileQuestions',[])),'distinctCells':len(per_cell)},
     'mapping':{'duplicateQuestionIds':len(ids)-len(set(ids)),'questionsWithUnknownCategory':sum(1 for q in qs if q['categoryId'] not in cat_ids),'cellsWithoutFourPaths':sum(1 for v in per_cell.values() if v!=4),'pathValues':dict(sorted(paths.items())),'categoriesWithout192Questions':sum(1 for c in cats if sum(1 for q in qs if q['categoryId']==c['ID'])!=192)},
     'textFindings':{'F02_duplicateStems':sum(1 for v in stems.values() if v>1),'F02_duplicateStemQuestions':sum(v for v in stems.values() if v>1),'F03_missingFinalQuestionMark':sum(1 for q in qs if not norm(q['textMn']).endswith('?')),'F04_doubleOrEdgeSpaces':sum(1 for q in qs if re.search(r'  |^\s|\s$',q['textMn'])),'longStems_over_220_chars':sum(1 for q in qs if len(q['textMn'])>220),'maxStemChars':max(len(q['textMn']) for q in qs),'latinLetterShareOfStems_pct':round(100*sum(len(re.findall(r'[A-Za-z]',q['textMn'])) for q in qs)/max(1,sum(len(q['textMn']) for q in qs)),3)},
     'options':{'optionCountDistribution':dict(sorted(optn.items())),'stateVocabulary':dict(states),'F05_questionsWithGenericApplicabilityPhrase':sum(1 for q in qs if any(GENERIC_NA.search(o) for o in q['optionsMn'])),'questionsWithDontKnowOption':sum(1 for q in qs if any('Мэдэхгүй' in o for o in q['optionsMn'])),'scoredOptionWithoutScore':scored_wo_score,'dnkOrNaOptionWithScore':dnk_scored,'C01_applicabilityPatterns':{'+'.join(k):v for k,v in c01_opts.most_common(6)}},
     'categoryNames':{c['ID']:c['Category'] for c in cats}}
    return r,{q['questionId']:q for q in qs}
def diff_workbook(dom,qmap,cats,wbdir,csvdir=None):
    w=xl(os.path.join(wbdir,WB[dom]));rows=w['Questions & Answers'][1:];wcat={r['B']:r['C'] for r in w['64 Categories'][1:] if 'B' in r}
    wq={r['A']:r for r in rows if 'A' in r};ids_w,ids_b=set(wq),set(qmap)
    same_t=same_o=0;ex_t=[];ex_o=[];cat_name_diff=0;cat_mismatch_rows=0
    import csv
    fh=open(os.path.join(csvdir,f'{dom}-active-vs-audited-workbook.csv'),'w',encoding='utf-8-sig',newline='') if csvdir else None
    cw=csv.writer(fh) if fh else None
    if cw:cw.writerow(['questionId','categoryId','textSame','answersSame','workbookQuestion','activeQuestion','workbookAnswers','activeAnswers'])
    for i in sorted(ids_w&ids_b):
        r=wq[i];q=qmap[i]
        tsame=norm(r.get('D',''))==norm(q['textMn'])
        if tsame:same_t+=1
        elif len(ex_t)<3:ex_t.append({'id':i,'workbook':norm(r.get('D',''))[:140],'bundle':norm(q['textMn'])[:140]})
        wopts=[norm(re.sub(r'^\s*\d+\.\s*','',x)) for x in str(r.get('E','')).replace('\r','').split('\n') if x.strip()]
        osame=wopts==[norm(o) for o in q['optionsMn']]
        if cw and not(tsame and osame):cw.writerow([i,q['categoryId'],tsame,osame,norm(r.get('D','')),norm(q['textMn']),' | '.join(wopts),' | '.join(q['optionsMn'])])
        if osame:same_o+=1
        elif len(ex_o)<3:ex_o.append({'id':i,'workbook':wopts,'bundle':q['optionsMn']})
        if norm(r.get('C',''))!=norm(wcat.get(r.get('B'),'')):cat_mismatch_rows+=1
    for cid,name in cats.items():
        if cid in wcat and norm(wcat[cid])!=norm(name):cat_name_diff+=1
    if fh:fh.close()
    return {'workbook':WB[dom],'workbookQuestions':len(ids_w),'idsOnlyInWorkbook':len(ids_w-ids_b),'idsOnlyInBundle':len(ids_b-ids_w),'sameQuestionText':same_t,'differentQuestionText':len(ids_w&ids_b)-same_t,'sameAnswerList':same_o,'differentAnswerList':len(ids_w&ids_b)-same_o,
      'F01_workbookRowsWhoseCategoryNameDiffersFromItsOwnCategorySheet':cat_mismatch_rows,'categoryNamesDifferingBundleVsWorkbookSheet':cat_name_diff,'textExamples':ex_t,'answerExamples':ex_o}
def main():
    out=sys.argv[1];wbdir=os.path.expanduser('~/Downloads')
    if '--workbooks' in sys.argv:wbdir=sys.argv[sys.argv.index('--workbooks')+1]
    csvdir=sys.argv[sys.argv.index('--csv')+1] if '--csv' in sys.argv else None
    if csvdir:os.makedirs(csvdir,exist_ok=True)
    res={'generatedBy':'qa-question-bank-compare.py (read-only)','active':{}, 'candidate':None}
    for dom,(rel,dbver) in ACTIVE.items():
        r,qmap=analyse(dom,rel);r['recordedActiveVersionInQaDatabase']=dbver;r['versionMatchesDatabase']=str(r['methodologyVersion'])==dbver
        if dom in WB and os.path.exists(os.path.join(wbdir,WB[dom])):r['vsAuditedWorkbook']=diff_workbook(dom,qmap,r['categoryNames'],wbdir,csvdir)
        res['active'][dom]=r
    r,cq=analyse(CANDIDATE[0],CANDIDATE[1]);res['candidate']={k:r[k] for k in('file','fileSha256','methodologyVersion','questionBankVersion','releaseStatus','counts','textFindings')}
    base={k:v for k,v in {q:'' for q in []}.items()}
    json.dump(res,open(out,'w',encoding='utf8'),ensure_ascii=False,indent=1);print('written',out)
if __name__=='__main__':main()
