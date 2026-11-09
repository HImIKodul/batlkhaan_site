export type GateLike={id?:string;status?:string};

export function compareSemver(a:string,b:string):number{
  const parse=(v:string)=>{const m=/^(\d+)\.(\d+)\.(\d+)$/.exec(v);if(!m)throw new Error(`Invalid semantic version: ${v}`);return [Number(m[1]),Number(m[2]),Number(m[3])] as const;};
  const x=parse(a),y=parse(b);for(let i=0;i<3;i++){if(x[i]!==y[i])return x[i]!>y[i]!?1:-1;}return 0;
}

export function evidenceGateMap(payload:unknown):Map<string,string>{
  const raw=(payload as any)?.gates;const gates=Array.isArray(raw)?raw:[];
  const entries:Array<[string,string]>=gates.map((g:any):[string,string]=>[String(g?.id??''),String(g?.status??'')]).filter(([id])=>Boolean(id));
  return new Map<string,string>(entries);
}

export function calibrationEvidenceReasons(input:{
  sourceVersion:string;proposedVersion:string;readyForReview:boolean;pilotDecisionStatus:string;
  gatePayload:unknown;evidenceGateIds:string[];
}):string[]{
  const reasons:string[]=[];
  try{if(compareSemver(input.proposedVersion,input.sourceVersion)<=0)reasons.push('PROPOSED_VERSION_NOT_HIGHER');}catch{reasons.push('INVALID_SEMVER');}
  if(!input.readyForReview)reasons.push('PILOT_NOT_READY_FOR_REVIEW');
  if(input.pilotDecisionStatus!=='APPROVE')reasons.push('PILOT_NOT_APPROVED');
  const gateMap=evidenceGateMap(input.gatePayload);
  if(!input.evidenceGateIds.length)reasons.push('NO_EVIDENCE_GATE_REFERENCES');
  for(const id of input.evidenceGateIds){if(!gateMap.has(id))reasons.push(`UNKNOWN_GATE:${id}`);else if(gateMap.get(id)!=='READY')reasons.push(`GATE_NOT_READY:${id}`);}
  return [...new Set(reasons)];
}

export function activationReasons(input:{
  proposalStatus:string;sourceStatus:string;candidateStatus:string;independentReview:boolean;
  latestAnalysisMatches:boolean;latestDecisionMatches:boolean;pilotDecisionStatus:string;
  candidateHashMatches:boolean;candidateImportPassed:boolean;candidateAssessmentCount:number;
}):string[]{
  const reasons:string[]=[];
  if(input.proposalStatus!=='APPROVED')reasons.push('PROPOSAL_NOT_APPROVED');
  if(input.sourceStatus!=='ACTIVE')reasons.push('SOURCE_NOT_ACTIVE');
  if(input.candidateStatus!=='VALIDATING')reasons.push('CANDIDATE_NOT_VALIDATING');
  if(!input.independentReview)reasons.push('INDEPENDENT_REVIEW_MISSING');
  if(!input.latestAnalysisMatches)reasons.push('PILOT_ANALYSIS_STALE');
  if(!input.latestDecisionMatches||input.pilotDecisionStatus!=='APPROVE')reasons.push('PILOT_APPROVAL_STALE');
  if(!input.candidateHashMatches)reasons.push('CANDIDATE_HASH_MISMATCH');
  if(!input.candidateImportPassed)reasons.push('CANDIDATE_IMPORT_NOT_PASS');
  if(input.candidateAssessmentCount!==0)reasons.push('CANDIDATE_ALREADY_REFERENCED');
  return reasons;
}
