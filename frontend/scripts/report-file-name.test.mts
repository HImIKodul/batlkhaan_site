/* Unit test for the downloaded report file name. Run: cd backend && npx tsx ../../../10_INTEGRATED_FRONTEND/frontend/scripts/report-file-name.test.mts */
import {pdfDownloadName as f} from '../src/pages/reportFileName.ts';
let p=0,q=0;const t=(n:string,g:string,w:string)=>{g===w?p++:q++;console.log((g===w?'PASS ':'FAIL ')+n+(g===w?'':` | got ${g} want ${w}`))};
t('example from the brief','Бүргэд ХХК'&&f({company:'Бүргэд ХХК',area:{id:'marketing'},rawDate:'2026-05-04T05:00:00Z'}),'Бүргэд_ХХК_Маркетинг_тайлан_2026-05-04.pdf');
t('all five categories',['marketing','it','finance','people','operations'].map(a=>f({company:'А',area:{id:a},rawDate:'2026-11-20T01:00:00Z'})).join('|'),'А_Маркетинг_тайлан_2026-11-20.pdf|А_Мэдээллийн_технологи_тайлан_2026-11-20.pdf|А_Санхүү_тайлан_2026-11-20.pdf|А_Хүний_нөөц_тайлан_2026-11-20.pdf|А_Үйлдвэрлэл_үйл_ажиллагаа_тайлан_2026-11-20.pdf');
t('date uses Ulaanbaatar time (UTC+8): 18:30Z on the 20th is the 21st locally',f({company:'А',area:{id:'it'},rawDate:'2026-11-20T18:30:00Z'}),'А_Мэдээллийн_технологи_тайлан_2026-11-21.pdf');
t('reserved characters, quotes, slashes and commas are removed',f({company:'Э/Н: "Алтан"<гол>*?, ХХК',area:{id:'finance'},rawDate:'2026-01-02T00:00:00Z'}),'Э_Н_Алтан_гол_ХХК_Санхүү_тайлан_2026-01-02.pdf'.replace('Э_Н_Алтан_гол_ХХК','Э_Н_Алтан_гол_ХХК'));
t('control characters and path traversal cannot appear',f({company:'..\\..\\evil\n\t.pdf',area:{id:'it'},rawDate:'2026-01-02T00:00:00Z'}).includes('/')||f({company:'..\\..\\evil\n\t.pdf',area:{id:'it'},rawDate:'2026-01-02T00:00:00Z'}).includes('\\')?'unsafe':'safe','safe');
t('no product prefix, version or English identifier',/BusinessMRI|_v\d|MRI|[A-Za-z]{4,}/.test(f({company:'Бүргэд ХХК',area:{id:'marketing'},rawDate:'2026-05-04T05:00:00Z'}))?'leak':'clean','clean');
t('very long company names are capped',String(f({company:'А'.repeat(300),area:{id:'it'},rawDate:'2026-01-02T00:00:00Z'}).length<=120),'true');
t('missing company falls back to a simple Mongolian name with the date',f({company:'  ',area:{id:'it'},rawDate:'2026-01-02T00:00:00Z'}),'Оношилгооны_тайлан_2026-01-02.pdf');
t('invalid date falls back without a date',f({company:'А',area:{id:'it'},rawDate:'nonsense'}),'Оношилгооны_тайлан.pdf');
console.log(`RESULT pass=${p} fail=${q}`);process.exit(q?1:0)
