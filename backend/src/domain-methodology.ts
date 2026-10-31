import { TARGET_METHODOLOGY_BUNDLE_SHA256, TARGET_METHODOLOGY_VERSION, TARGET_QUESTION_BANK_VERSION } from "./methodology-target.js";
export const DOMAIN_CODES=["marketing","it","finance","people","operations"] as const; export type DomainCode=typeof DOMAIN_CODES[number];
export interface DomainMethodologyTarget{domainCode:DomainCode;methodologyVersion:string;questionBankVersion:string;bundleSha256:string;engineKind:"MARKETING_V3"|"BUSINESSMRI_V2"}
const T:Record<DomainCode,DomainMethodologyTarget>={
marketing:{domainCode:"marketing",methodologyVersion:TARGET_METHODOLOGY_VERSION,questionBankVersion:TARGET_QUESTION_BANK_VERSION,bundleSha256:TARGET_METHODOLOGY_BUNDLE_SHA256,engineKind:"MARKETING_V3"},
people:{domainCode:"people",methodologyVersion:"4.1.5",questionBankVersion:"BUSINESSMRI-v2.5-HRMRI",bundleSha256:"635d538a4043a5c62e18c0ebfeda1730c380015b3070cb39bc8d1305ba572439",engineKind:"BUSINESSMRI_V2"},
finance:{domainCode:"finance",methodologyVersion:"4.2.5",questionBankVersion:"BUSINESSMRI-v2.5-FINMRI",bundleSha256:"7c7b930f40d388844c6347e15d2b9e6eeeb0dd85683e88ab29bcf9a34c693ff7",engineKind:"BUSINESSMRI_V2"},
it:{domainCode:"it",methodologyVersion:"4.3.5",questionBankVersion:"BUSINESSMRI-v2.5-ISMRI",bundleSha256:"263953ab18d4b2d22ee94c01bc76685092d46fef5e1e1588d222789b32b3351b",engineKind:"BUSINESSMRI_V2"},
operations:{domainCode:"operations",methodologyVersion:"4.4.5",questionBankVersion:"BUSINESSMRI-v2.5-OPMRI",bundleSha256:"63ce59dfc7ffdde1590c25de4127e1048cffb422f1a568c0bee2af69fdaf77a1",engineKind:"BUSINESSMRI_V2"}};
export function normalizeDomainCode(v:unknown):DomainCode{const c=String(v??"marketing").trim().toLowerCase();if(!(DOMAIN_CODES as readonly string[]).includes(c))throw new Error(`Unsupported MMRI domain '${c}'`);return c as DomainCode}
export function methodologyTargetForDomain(v:unknown){return T[normalizeDomainCode(v)]} export function allDomainMethodologyTargets(){return DOMAIN_CODES.map(c=>T[c])}
