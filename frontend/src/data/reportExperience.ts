import type { BusinessAreaId } from './businessEvaluation';
import { domainVisualTokens } from '../design/tokens';

const labels: Record<BusinessAreaId,string> = {
  marketing:'Маркетингийн менежмент',
  it:'Мэдээллийн технологийн менежмент',
  finance:'Санхүүгийн менежмент',
  people:'Хүний нөөцийн менежмент',
  operations:'Үйлдвэрлэл ба үйл ажиллагааны менежмент',
};

export const areaReportPalette:Record<BusinessAreaId,{accent:string;soft:string;ink:string;label:string;secondary:string;deep:string}> = Object.fromEntries(
  (Object.keys(labels) as BusinessAreaId[]).map(id=>[
    id,
    { ...domainVisualTokens[id], label:labels[id] },
  ]),
) as Record<BusinessAreaId,{accent:string;soft:string;ink:string;label:string;secondary:string;deep:string}>;

export { demoCapabilityNames } from './canonicalCapabilities';
