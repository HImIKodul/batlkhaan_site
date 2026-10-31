const REPLACEMENTS:Array<[RegExp,string]>=[
 [/Segment performance/gi,'Хэрэглэгчийн бүлэг бүрийн үр дүн'],
 [/Experiment backlog/gi,'Турших ажлын жагсаалт'],
 [/Test-to-scale rate/gi,'Амжилттай туршилтыг өргөжүүлсэн хувь'],
 [/Lead follow[- ]?up/gi,'Боломжит хэрэглэгчтэй эргэн холбогдох'],
 [/diagnostic priority/gi,'оношилгооны эрэмбэ'],
 [/weak[- ]?cell/gi,'сул үзүүлэлт'],
 [/hard contradiction/gi,'ноцтой зөрчил'],
 [/evidence conflict/gi,'нотолгооны зөрчил'],
 [/evidence path/gi,'нотолгооны зам'],
 [/value coverage/gi,'мэдээллийн хамралт'],
 [/REVIEW_REQUIRED/g,'нягтлах шаардлагатай'],
 [/QUICK_LIMIT_REACHED/g,'урьдчилсан үнэлгээний хязгаарт хүрсэн'],
 [/QUICK/g,'урьдчилсан'],
 [/FULL/g,'бүрэн'],
 [/Capability score/gi,'Дэд чиглэлийн оноо'],
 [/capability/gi,'дэд чиглэл'],
 [/diagnostic/gi,'оношилгооны'],
 [/canonical/gi,'баталгаажсан'],
 [/confidence/gi,'найдвартай байдал'],
 [/coverage/gi,'мэдээллийн хамралт'],
 [/applicable/gi,'хамаарах'],
 [/Deliverable/gi,'Гарах үр дүн'],
 [/resolver/gi,'шийдвэрлэх шалгалт'],
 [/Segment/gi,'Хэрэглэгчийн бүлэг'],
 [/funnel/gi,'борлуулалтын үе шат'],
 [/Insight/gi,'Хэрэглэгчийн ойлголт'],
 [/register/gi,'бүртгэл'],
 [/dashboard/gi,'хяналтын самбар'],
 [/Experiment/gi,'Туршилт'],
 [/campaign/gi,'сурталчилгааны ажил'],
 [/content/gi,'агуулга'],
 [/website/gi,'цахим хуудас'],
 [/application/gi,'хэрэглүүр'],
 [/baseline/gi,'суурь үзүүлэлт'],
 [/benchmark/gi,'жишиг үзүүлэлт'],
 [/priority/gi,'эрэмбэ'],
 [/status/gi,'төлөв'],
 [/target/gi,'зорилтот утга'],
 [/progress/gi,'ахиц'],
 [/owner/gi,'хариуцагч'],
 [/framework/gi,'аргачлал'],
 [/workflow/gi,'ажлын урсгал'],
 [/report/gi,'тайлан'],
 [/strategy/gi,'стратеги'],
 [/assessment/gi,'үнэлгээ'],
 [/score/gi,'оноо'],
 [/Сегмент/gi,'Хэрэглэгчийн бүлэг'],
 [/сегмент/gi,'хэрэглэгчийн бүлэг'],
 [/Дижитал/gi,'Цахим'],
 [/дижитал/gi,'цахим'],
 [/Контент/gi,'Агуулга'],
 [/контент/gi,'агуулга'],
 [/Аналитик/gi,'Шинжилгээ'],
 [/аналитик/gi,'шинжилгээ'],
 [/Календарь/gi,'Хуваарь'],
 [/календарь/gi,'хуваарь'],
 [/Мессеж/gi,'Гол санаа'],
 [/мессеж/gi,'гол санаа'],
 [/Кампанит/gi,'Сурталчилгааны'],
 [/кампанит/gi,'сурталчилгааны'],
 [/\bKPI\b/gi,'Хэмжих үзүүлэлт'],
 [/\bCRM\b/gi,'Харилцагчийн мэдээллийн систем'],
 [/\bROI\b/gi,'Хөрөнгө оруулалтын өгөөж'],
 [/\bROAS\b/gi,'Зар сурталчилгааны зардлын өгөөж'],
 [/\bCAC\b/gi,'Нэг шинэ хэрэглэгч авах зардал'],
 [/\bLTV\b/gi,'Хэрэглэгчийн нийт хугацааны үнэ цэнэ'],
 [/\bCTR\b/gi,'Дарсан хэрэглэгчийн хувь'],
 [/\bCPL\b/gi,'Нэг боломжит харилцагч авах зардал'],
 [/\bSEO\b/gi,'Хайлтын системийн харагдац'],
];

export function mnText(value:string|null|undefined,fallback='Мэдээлэл бүрдээгүй'){
 let text=(value??'').trim();
 if(!text)return fallback;
 for(const [pattern,replacement] of REPLACEMENTS)text=text.replace(pattern,replacement);
 // Backend/internal identifiers must never leak to customer-facing copy.
 text=text.replace(/\b(?:resultHash|strategyHash|planHash|bindingHash|schemaVersion|methodologyVersion)\b/gi,'')
   .replace(/\b[A-Za-z][A-Za-z0-9+._/-]*\b/g,'')
   .replace(/\s+([,.;:!?])/g,'$1')
   .replace(/\s{2,}/g,' ')
   .trim();
 return /[А-Яа-яӨөҮү]/.test(text)?text:fallback;
}

export function rootClassMn(value:string|null|undefined){
 const labels:Record<string,string>={
  PRIMARY_ROOT_CAUSE:'Гол суурь шалтгаан',
  CONTRIBUTING_CAUSE:'Нөлөөлж буй шалтгаан',
  POSSIBLE_CAUSE:'Болзошгүй шалтгаан',
  EVIDENCE_GAP:'Мэдээлэл дутуу хэсэг',
  ISOLATED_WEAKNESS:'Тусгаарлагдсан сул тал',
  LIKELY_SYMPTOM:'Илэрч буй шинж',
  WEAKNESS_ONLY:'Сул тал',
 };
 return labels[value??'']??'Суурь нөхцөл';
}
