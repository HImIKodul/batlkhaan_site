import type { BusinessAreaId } from './businessEvaluation';
export { testQuestionSets } from './domainQuestionSamples';
export type { TestQuestion } from './domainQuestionSamples';

export const TEST_AREA_KEY='business:testQuestionArea';
export const REPORT_AREA_KEY='business:reportArea';
export const REPORT_TAB_KEY='business:reportTab';
export const TEST_PROGRESS_PREFIX='mmri.testQuestionProgress.';
export const TEST_ANSWERS_PREFIX='mmri.testQuestionAnswers.';
export const EXPLICIT_DEMO_MODE_KEY='mmri.explicitDemoMode';

// Demo surfaces are never activated from a business name alone. A developer/test session
// must opt in explicitly, preventing a legitimate company name from receiving synthetic data.
export const isTestBusiness=(name?:string|null)=>{
  if(typeof window==='undefined')return false;
  return sessionStorage.getItem(EXPLICIT_DEMO_MODE_KEY)==='1'&&/өрнөх|demo|test|туршилт/i.test(name||'');
};

export const areaGrammar:Record<BusinessAreaId,{work:string;roadmap:string}>={
 marketing:{work:'Маркетингийн 5–10 тэргүүлэх ажил',roadmap:'12 сарын маркетингийн хөгжлийн төлөвлөгөө'},
 it:{work:'Мэдээллийн технологийн 5–10 тэргүүлэх ажил',roadmap:'12 сарын мэдээллийн технологийн хөгжлийн төлөвлөгөө'},
 finance:{work:'Санхүүгийн 5–10 тэргүүлэх ажил',roadmap:'12 сарын санхүүгийн хөгжлийн төлөвлөгөө'},
 people:{work:'Хүний нөөцийн 5–10 тэргүүлэх ажил',roadmap:'12 сарын хүний нөөцийн хөгжлийн төлөвлөгөө'},
 operations:{work:'Үйл ажиллагааны 5–10 тэргүүлэх ажил',roadmap:'12 сарын үйл ажиллагааны хөгжлийн төлөвлөгөө'},
};

