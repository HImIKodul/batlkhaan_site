import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type IntegratedDomainId='it'|'finance'|'people'|'operations';
export type IntegratedDomainQuestion={
 id:string;categoryId?:string|null;category?:string|null;module?:string|null;cellId?:string|null;dimensionId?:string|null;dimension?:string|null;
 variant?:string|null;role?:string|null;stage?:string|null;runtimePriority?:string|null;questionType?:string|null;answerShape?:string|null;
 question:string;options:string[];naAllowed?:string|null;answerDirection?:string|null;
};
export type IntegratedDomainBank={domain:IntegratedDomainId;release:string;frozen:true;questionCount:number;questions:IntegratedDomainQuestion[]};

const files:Record<IntegratedDomainId,string>={it:'it-1.5-repaired.json',finance:'finance-2.8.0-repaired.json',people:'people-18.4-repaired.json',operations:'operations-1.4-repaired.json'};
const cache=new Map<IntegratedDomainId,IntegratedDomainBank>();

function bankDir(){return process.env.MMRI_DOMAIN_QUESTION_BANK_DIR?.trim()||resolve(process.cwd(),'methodology','domain-question-banks')}
export function loadIntegratedDomainBank(domain:IntegratedDomainId):IntegratedDomainBank{
 const existing=cache.get(domain);if(existing)return existing;
 const raw=JSON.parse(readFileSync(resolve(bankDir(),files[domain]),'utf8')) as IntegratedDomainBank;
 if(raw.domain!==domain||!raw.frozen||raw.questionCount!==raw.questions.length)throw new Error(`Invalid integrated ${domain} question bank`);
 cache.set(domain,raw);return raw;
}
export function integratedDomainQuestionCount(domain:IntegratedDomainId){return loadIntegratedDomainBank(domain).questionCount}
export function integratedDomainQuestion(domain:IntegratedDomainId,id:string){return loadIntegratedDomainBank(domain).questions.find(q=>q.id===id)??null}
export function integratedDomainQuestions(domain:IntegratedDomainId){return loadIntegratedDomainBank(domain).questions}
