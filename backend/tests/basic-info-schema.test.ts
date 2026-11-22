import {describe,it,expect} from 'vitest';import fs from 'node:fs';import path from 'node:path';
import {BASIC_INFO_SCHEMA,validateBasicInfoAnswer} from '../src/company/basic-info-schema.js';
describe('DX-02 basic-information answer schema',()=>{
 it('accepts exactly one in-range option for each question',()=>{for(const [id,spec] of Object.entries(BASIC_INFO_SCHEMA)){expect(validateBasicInfoAnswer(id,[1])).toEqual([1]);expect(validateBasicInfoAnswer(id,[spec.options])).toEqual([spec.options])}});
 it('rejects out-of-range, zero, negative, fractional, string, duplicate, empty and multiple selections',()=>{
  expect(validateBasicInfoAnswer('B01',[6])).toBeNull();expect(validateBasicInfoAnswer('B09',[8])).toBeNull();expect(validateBasicInfoAnswer('B09',[7])).toEqual([7]);
  for(const bad of [[0],[-1],[1.5],['1'],[null],[],[1,1],[1,2],'1',undefined,{}])expect(validateBasicInfoAnswer('B01',bad as any)).toBeNull();
  expect(validateBasicInfoAnswer('B99',[1])).toBeNull();
 });
 it('matches the frontend question definitions (drift guard)',()=>{
  const f=path.resolve(__dirname,'../../frontend/src/data/basicInfoQuestions.ts');if(!fs.existsSync(f))return;const src=fs.readFileSync(f,'utf8');
  for(const [id,spec] of Object.entries(BASIC_INFO_SCHEMA)){const i=src.indexOf(`id:"${id}"`);expect(i).toBeGreaterThan(-1);const end=src.indexOf('{id:"B',i+5);const block=src.slice(i,end>0?end:undefined);expect((block.match(/optionIndex:/g)||[]).length).toBe(spec.options);expect(block).toContain(spec.type==='SINGLE_SELECT'?"'SINGLE_SELECT'":"'MULTI_SELECT'")}
 });
});
