export type BillingPlanId='diagnostic';
export type BillingPlanCode='DIAGNOSTIC';
export const toBillingPlanCode=(_id:BillingPlanId):BillingPlanCode=>'DIAGNOSTIC';
export const fromBillingPlanCode=(_code:BillingPlanCode):BillingPlanId=>'diagnostic';

export type BillingPlan={
 id:BillingPlanId;
 name:string;
 eyebrow:string;
 description:string;
 billingLabel:string;
 features:string[];
 priceMnt:number|null;
};

function readPrice(name:string){
 const env=import.meta.env as Record<string,string|boolean|undefined>;
 const raw=typeof env[name]==='string'?(env[name] as string).trim():'';
 if(!raw)return null;
 const value=Number(raw.replace(/[^0-9.]/g,''));
 return Number.isFinite(value)&&value>0?Math.round(value):null;
}

export const billingPlans:BillingPlan[]=[
 {
  id:'diagnostic',
  name:'Сонгосон чиглэлийн оношилгоо',
  eyebrow:'Нэг удаагийн худалдан авалт',
  description:'Нэг байгууллагын сонгосон чиглэлийн оношилгоог бүрэн хийж, үр дүн, тэргүүлэх асуудал болон хэрэгжилтийн төлөвлөгөөг авна.',
  billingLabel:'Нэг удаа',
  features:[
   'Байгууллагын суурь мэдээлэл ба адаптив оношилгоо',
   '5 давуу, 5 сул тал ба 5 тэргүүлэх асуудал',
   '12 сарын төлөвлөгөө',
   '3 хуудасны мэргэжлийн PDF тайлан',
  ],
  priceMnt:readPrice('VITE_MMRI_DIAGNOSTIC_PRICE_MNT')??300000,
 },

];

export const selectedPlanStorageKey='mmri:selectedBillingPlan';
export const autoStartDiagnosticKey='mmri:autoStartDiagnostic';

export function chooseBillingPlan(id:BillingPlanId){
 sessionStorage.setItem(selectedPlanStorageKey,id);
}

export function formatMnt(value:number|null){
 if(value==null)return 'Үнийн санал авах';
 return `${new Intl.NumberFormat('mn-MN').format(value)} ₮`;
}
