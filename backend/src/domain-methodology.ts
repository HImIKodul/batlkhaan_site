import { TARGET_METHODOLOGY_BUNDLE_SHA256, TARGET_METHODOLOGY_VERSION, TARGET_QUESTION_BANK_VERSION } from "./methodology-target.js";
export const DOMAIN_CODES=["marketing","it","finance","people","operations"] as const; export type DomainCode=typeof DOMAIN_CODES[number];
export interface DomainMethodologyTarget{domainCode:DomainCode;methodologyVersion:string;questionBankVersion:string;bundleSha256:string;engineKind:"MARKETING_V3"|"BUSINESSMRI_V2"}
const T:Record<DomainCode,DomainMethodologyTarget>={
marketing:{domainCode:"marketing",methodologyVersion:TARGET_METHODOLOGY_VERSION,questionBankVersion:TARGET_QUESTION_BANK_VERSION,bundleSha256:TARGET_METHODOLOGY_BUNDLE_SHA256,engineKind:"MARKETING_V3"},
people:{domainCode:"people",methodologyVersion:"4.1.7",questionBankVersion:"BUSINESSMRI-v2.5-HRMRI",bundleSha256:"dc67054fc5b225cdf9db928934e863e29ae1dcb01cc8f8f4500885cd2f6c614e",engineKind:"BUSINESSMRI_V2"},
finance:{domainCode:"finance",methodologyVersion:"4.2.7",questionBankVersion:"BUSINESSMRI-v2.5-FINMRI",bundleSha256:"aee57b0dc1f37fda8f6738fb3c94d01eba765b5fb3e4c591c70d6f4c4f1a6c5a",engineKind:"BUSINESSMRI_V2"},
it:{domainCode:"it",methodologyVersion:"4.3.7",questionBankVersion:"BUSINESSMRI-v2.5-ISMRI",bundleSha256:"b01c2609cfa2b288c28d2443825251d7e1d68c671b6b1b91fdfaddfba1797795",engineKind:"BUSINESSMRI_V2"},
operations:{domainCode:"operations",methodologyVersion:"4.4.7",questionBankVersion:"BUSINESSMRI-v2.5-OPMRI",bundleSha256:"8cc7ad98d281caae3770a16420d0f9f69fc543e4065de715ffb8731ffe9f5a7a",engineKind:"BUSINESSMRI_V2"}};
export function normalizeDomainCode(v:unknown):DomainCode{const c=String(v??"marketing").trim().toLowerCase();if(!(DOMAIN_CODES as readonly string[]).includes(c))throw new Error(`Unsupported MMRI domain '${c}'`);return c as DomainCode}
export function methodologyTargetForDomain(v:unknown){return T[normalizeDomainCode(v)]} export function allDomainMethodologyTargets(){return DOMAIN_CODES.map(c=>T[c])}
