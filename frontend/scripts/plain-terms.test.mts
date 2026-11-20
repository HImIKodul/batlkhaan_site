/* Unit test for the plain-Mongolian display terms. Run: cd backend && npx tsx ../../../10_INTEGRATED_FRONTEND/frontend/scripts/plain-terms.test.mts */
import {plainMn,plainDeep} from '../src/data/plainTerms.ts';
let p=0,q=0;const t=(n:string,g:unknown,w:unknown)=>{const ok=JSON.stringify(g)===JSON.stringify(w);ok?p++:q++;console.log((ok?'PASS ':'FAIL ')+n+(ok?'':` | got ${JSON.stringify(g)} want ${JSON.stringify(w)}`))};
t('owner example 1',plainMn('Үүлэн үйлчилгээ ба программын үйлчилгээний багцын засаглал'),'Үүлэн болон программын үйлчилгээний удирдлага');
t('owner example 2',plainMn('Бага кодтой эсвэл кодгүй хөгжүүлэлт'),'Код бичихгүйгээр эсвэл бага кодоор программ бүтээх');
t('quoted name inside a definition is replaced too',plainMn('“Бага кодтой эсвэл кодгүй хөгжүүлэлт” гэдэг нь ажил'),'“Код бичихгүйгээр эсвэл бага кодоор программ бүтээх” гэдэг нь ажил');
t('general rule: nominative',plainMn('Санхүүгийн эрсдэлийн засаглал'),'Санхүүгийн эрсдэлийн удирдлага');
t('case endings stay grammatical',[plainMn('засаглалын'),plainMn('засаглалыг'),plainMn('засаглалд'),plainMn('засаглалаас'),plainMn('засаглалтай')],['удирдлагын','удирдлагыг','удирдлагад','удирдлагаас','удирдлагатай']);
t('capitalised form',plainMn('Засаглал ба хяналт'),'Удирдлага ба хяналт');
t('unrelated text is untouched',plainMn('Борлуулалтын төлөвлөгөө ба хяналт'),'Борлуулалтын төлөвлөгөө ба хяналт');
t('idempotent',plainMn(plainMn('Хүний нөөцийн өгөгдлийн засаглал')),'Хүний нөөцийн өгөгдлийн удирдлага');
const src={id:'ISMRI-C32',score:87.5,weight:0.0123,hash:'a3ee51eb1375998e22457ecbbadd19276718664b7fc78b6ebc34ff064279fe87',nameMn:'Мэдээллийн аюулгүй байдлын засаглал',flags:[true,null],items:[{k:'Өгөгдөл хамгаалалт ба нууцлалын засаглал'}]};
const out=plainDeep(src);
t('plainDeep keeps ids, numbers, hashes, booleans and null',[out.id,out.score,out.weight,out.hash,out.flags],[src.id,src.score,src.weight,src.hash,src.flags]);
t('plainDeep rewrites nested strings only',[out.nameMn,out.items[0].k],['Мэдээллийн аюулгүй байдлын удирдлага','Өгөгдөл хамгаалалт ба нууцлалын удирдлага']);
t('plainDeep does not mutate its input',src.nameMn,'Мэдээллийн аюулгүй байдлын засаглал');
console.log(`RESULT pass=${p} fail=${q}`);process.exit(q?1:0)
