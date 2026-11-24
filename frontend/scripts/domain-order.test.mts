/* Unit test for the shared domain order and names. Run: cd backend && npx tsx ../../../10_INTEGRATED_FRONTEND/frontend/scripts/domain-order.test.mts */
import {DOMAIN_ORDER,DOMAIN_NAME_MN,DOMAIN_HERO_LABEL,sortByDomain,domainNameMn} from '../src/data/domainOrder.ts';
let p=0,q=0;const t=(n:string,g:unknown,w:unknown)=>{const ok=JSON.stringify(g)===JSON.stringify(w);ok?p++:q++;console.log((ok?'PASS ':'FAIL ')+n+(ok?'':` | got ${JSON.stringify(g)} want ${JSON.stringify(w)}`))};
t('internal ids in the required order',[...DOMAIN_ORDER],['marketing','it','finance','people','operations']);
t('display names in the required order',DOMAIN_ORDER.map(d=>DOMAIN_NAME_MN[d]),['Маркетинг','Мэдээллийн технологи','Санхүү','Хүний нөөц','Үйлдвэрлэл ба үйл ажиллагаа']);
t('hero labels carry the approved abbreviations',DOMAIN_ORDER.map(d=>DOMAIN_HERO_LABEL[d]),['МАРКЕТИНГ (MMRI)','МЭДЭЭЛЛИЙН ТЕХНОЛОГИ (ITMRI)','САНХҮҮ (FINMRI)','ХҮНИЙ НӨӨЦ (HRMRI)','ҮЙЛДВЭРЛЭЛ БА ҮЙЛ АЖИЛЛАГАА (POMMRI)']);
const old=[{id:'it'},{id:'marketing'},{id:'finance'},{id:'people'},{id:'operations'}];
t('the previous catalogue order (IT first) sorts into the standard order',sortByDomain(old,r=>r.id).map(r=>r.id),['marketing','it','finance','people','operations']);
t('sorting does not mutate its input',old.map(r=>r.id),['it','marketing','finance','people','operations']);
t('unknown ids go last and keep their relative order',sortByDomain([{id:'x'},{id:'operations'},{id:'y'},{id:'marketing'}],r=>r.id).map(r=>r.id),['marketing','operations','x','y']);
t('sorting is stable for repeated domains',sortByDomain([{id:'it',k:1},{id:'marketing',k:2},{id:'it',k:3}],r=>r.id).map(r=>r.k),[2,1,3]);
t('domainNameMn falls back to the id for unknown codes',[domainNameMn('finance'),domainNameMn('zzz')],['Санхүү','zzz']);
console.log(`RESULT pass=${p} fail=${q}`);process.exit(q?1:0)
