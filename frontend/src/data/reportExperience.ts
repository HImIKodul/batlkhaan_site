import type { BusinessAreaId } from './businessEvaluation';
import { domainVisualTokens } from '../design/tokens';

const labels: Record<BusinessAreaId,string> = {
  marketing:'Marketing MRI',
  it:'Information Technology MRI',
  finance:'Finance MRI',
  people:'Human Resources MRI',
  operations:'Production & Operations MRI',
};

export const areaReportPalette:Record<BusinessAreaId,{accent:string;soft:string;ink:string;label:string;secondary:string;deep:string}> = Object.fromEntries(
  (Object.keys(labels) as BusinessAreaId[]).map(id=>[
    id,
    { ...domainVisualTokens[id], label:labels[id] },
  ]),
) as Record<BusinessAreaId,{accent:string;soft:string;ink:string;label:string;secondary:string;deep:string}>;

export { demoCapabilityNames } from './canonicalCapabilities';
