#!/usr/bin/env python3
import json,re
from pathlib import Path
B=Path(__file__).resolve().parents[1]
M=B/'methodology'
FILES=[
 M/'MMRI_v3.0.2_QBANK_v3.1.2_FINAL_MONGOLIAN_STEP12.json',
 M/'businessmri-v2.2-runtime-bundles/MMRI_HRMRI_Methodology_4.1.2_BUSINESSMRI_V2.json',
 M/'businessmri-v2.2-runtime-bundles/MMRI_FINMRI_Methodology_4.2.2_BUSINESSMRI_V2.json',
 M/'businessmri-v2.2-runtime-bundles/MMRI_ISMRI_Methodology_4.3.2_BUSINESSMRI_V2.json',
 M/'businessmri-v2.2-runtime-bundles/MMRI_OPMRI_Methodology_4.4.2_BUSINESSMRI_V2.json',
]
TOK={
'Pilot':'туршилтын хэрэгжилт','gap':'зөрүү','Owner':'хариуцагч','time':'хугацаа','Insight':'дүгнэлт','activity':'үйл ажиллагаа','step':'алхам','Handoff':'ажил шилжүүлэлт','work':'ажил','competency':'ур чадвар','Backup':'орлох','Automation':'автоматжуулалт','Action':'арга хэмжээ','attainment':'биелэлт','Trend':'чиг хандлага','Pipeline':'борлуулалтын урсгал','experience':'туршлага','Lifecycle':'амьдралын мөчлөг','check':'шалгалт','volume':'давтамж','of':'','truth':'үнэн зөв','dashboard':'хяналтын самбар','log':'бүртгэл'
}
POST={
'хүчин чадал-г':'хүчин чадлыг','саад-ийг':'саадыг','замнал-г':'замналыг','хэмжилт-тай':'хэмжилттэй',
'нэвтрүүлэлт шалгалт':'нэвтрүүлэлтийн шалгалт','үе шаттай нэвтрүүлэлт зөрүү':'үе шаттай нэвтрүүлэлтийн зөрүү',
'хариуцагч тодорхой чухал үйл ажиллагаа-ийн хувь':'хариуцагч нь тодорхой чухал үйл ажиллагааны хувь',
'хариуцагч/ажил шилжүүлэлт тодорхой үйл явц алхам-ийн хувь':'хариуцагч, ажил шилжүүлэлт нь тодорхой үйл явцын алхмын хувь',
'хариуцагч/ажил шилжүүлэлт тодорхой үйл явцын алхам-ийн хувь':'хариуцагч, ажил шилжүүлэлт нь тодорхой үйл явцын алхмын хувь',
'ажил шилжүүлэлт алдаа/саатлын хувь':'ажил шилжүүлэлтийн алдаа, саатлын хувь',
'дундаж мөчлөг хугацаа-ийн бууралт':'мөчлөгийн дундаж хугацааны бууралт','дундаж мөчлөгийн хугацаа-ийн бууралт':'мөчлөгийн дундаж хугацааны бууралт',
'чухал ажил-ийн хүчин чадал хамрах хүрээ':'чухал ажлын хүчин чадлын хамрагдалт',
'зорилтот түвшин ур чадвар-д хүрсэн хүний хувь':'зорилтот ур чадварт хүрсэн хүний хувь',
'орлох хариуцагч-той чухал мэдлэг-ийн хувь':'орлох хариуцагчтай чухал мэдлэгийн хувь',
'чухал нөөц зөрүү-ийн хаагдсан хувь':'чухал нөөцийн зөрүүг хаасан хувь','чухал нөөцийн зөрүү-ийн хаагдсан хувь':'чухал нөөцийн зөрүүг хаасан хувь',
'чухал технологийн зөрүү-ийн хаагдсан хувь':'технологийн чухал зөрүүг хаасан хувь',
'өндөр-давтамж':'их давтамжтай','автоматжуулалт-аар':'автоматжуулалтаар','мөчлөг хугацаа':'мөчлөгийн хугацаа',
'эх үүсвэр--үнэн зөв':'үндсэн үнэн зөв эх үүсвэр','эх үүсвэр-үнэн зөв':'үндсэн үнэн зөв эх үүсвэр','эх үүсвэр- -үнэн зөв':'үндсэн үнэн зөв эх үүсвэр',
'хяналт-той':'хяналттай','шийдвэр бүртгэл':'шийдвэрийн бүртгэл',
'дүгнэлт болгон хөрвүүлсэн тэргүүлэх шинжилгээ-ийн хувь':'дүгнэлт болгон ашигласан тэргүүлэх шинжилгээний хувь',
'дүгнэлт лавлагаа-тэй стратегийн шийдвэр-ийн хувь':'дүгнэлтийн лавлагаатай стратегийн шийдвэрийн хувь',
'дүгнэлт лавлагаа-тэй стратегийн шийдвэрийн хувь':'дүгнэлтийн лавлагаатай стратегийн шийдвэрийн хувь',
'арга хэмжээ болгож хэрэгжсэн баталгаажсан сургамж-ийн хувь':'арга хэмжээ болгон хэрэгжүүлсэн баталгаажсан сургамжийн хувь',
'зорилтот түвшин биелэлт-ийн өсөлт':'зорилтот түвшний биелэлтийн өсөлт',
'чиг хандлага сэрэмжлүүлэг-д':'чиг хандлагын сэрэмжлүүлэгт',
'гүйцэтгэлийн гол үзүүлэлт-ийн':'гүйцэтгэлийн гол үзүүлэлтийн',
'туршилтын хэрэгжилт эсвэл эхний үе шаттай нэвтрүүлэлт-ийг':'туршилтын хэрэгжилт эсвэл эхний үе шаттай нэвтрүүлэлтийг',
'хариуцсан эзэмшил-ийг':'хариуцлагын эзэмшлийг','үр дүн-г':'үр дүнг','лавлагаа-тэй':'лавлагаатай',
'үйл явц алхам':'үйл явцын алхам','нөөц зөрүү':'нөөцийн зөрүү',
'борлуулалтын урсгал, хөрвөлт, таамаглал, хүчин чадал-г':'Борлуулалтын урсгал, хөрвөлт, таамаглал, хүчин чадлыг',
'амьдралын мөчлөг замнал':'амьдралын мөчлөгийн замнал',
'саад-ийг':'саадыг','туршлага-ийг':'туршлагыг','хяналт-тай':'хяналттай',
'дүгнэлт лавлагаа':'дүгнэлтийн лавлагаа','арга хэмжээ болгож':'арга хэмжээ болгон',
'гүйцэтгэлийн гол үзүүлэлт-ийн':'гүйцэтгэлийн гол үзүүлэлтийн','зөрүү-ийн':'зөрүүг',
'хариуцагч-той':'хариуцагчтай','мэдлэг-ийн':'мэдлэгийн','шинжилгээ-ийн':'шинжилгээний','шийдвэр-ийн':'шийдвэрийн',
'сэрэмжлүүлэг-д':'сэрэмжлүүлэгт','ур чадвар-д':'ур чадварт','алхам-ийн':'алхамын','үйл ажиллагаа-ийн':'үйл ажиллагааны',
}

def fix(s):
    if not isinstance(s,str) or not re.search(r'[A-Za-z]',s): return s
    s=re.sub(r'[A-Za-z]+',lambda m:TOK.get(m.group(0),m.group(0)),s)
    for a,b in POST.items(): s=s.replace(a,b)
    s=re.sub(r'\s{2,}',' ',s).strip()
    return s

def patch(d):
    c=d['contracts']
    rec=c['MMRI_FINAL_Recommendation_Engine_Contract.json']['composition']
    for x in rec['categoryObjectives']:
        for k in ('name','objective'): x[k]=fix(x.get(k))
    for x in rec['cellInterventions']:
        for k in ('title','action','deliverable','kpi'): x[k]=fix(x.get(k))
    for x in c['MMRI_FINAL_365_Day_Action_Plan_Contract.json']['interventionSchedule']:
        for k in ('title','milestoneTemplate','deliverable','kpi'): x[k]=fix(x.get(k))
    return d

def hits(d):
    out=[]; c=d['contracts']; rec=c['MMRI_FINAL_Recommendation_Engine_Contract.json']['composition']
    for typ,arr,ks in [('categoryObjectives',rec['categoryObjectives'],('name','objective')),('cellInterventions',rec['cellInterventions'],('title','action','deliverable','kpi')),('interventionSchedule',c['MMRI_FINAL_365_Day_Action_Plan_Contract.json']['interventionSchedule'],('title','milestoneTemplate','deliverable','kpi'))]:
        for i,x in enumerate(arr):
            for k in ks:
                v=x.get(k)
                if isinstance(v,str) and re.search(r'[A-Za-z]',v): out.append((typ,i,k,v))
    for i,x in enumerate(c['MMRI_FINAL_Report_Contract.json']['format']['sections']):
        v=x.get('name')
        if isinstance(v,str) and re.search(r'[A-Za-z]',v): out.append(('reportSection',i,'name',v))
    return out

for p in FILES:
    d=patch(json.load(open(p,encoding='utf-8')))
    h=hits(d)
    json.dump(d,open(p,'w',encoding='utf-8'),ensure_ascii=False,separators=(',',':'))
    print(p.name,'latin_hits',len(h))
    for row in h[:30]: print(' ',row)
    if h: raise SystemExit(2)
