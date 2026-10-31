import { createHash } from "node:crypto";
import { prisma } from "../db.js";
import { badRequest, conflict, forbidden, notFound } from "../api/errors.js";
import { requireStudyCreator } from "../pilot/pilot-service.js";
import { activationReasons, calibrationEvidenceReasons, compareSemver, evidenceGateMap } from "./policy.js";

const CHANGE_KINDS=["CONTRIBUTION_STRENGTH","CONFIDENCE_EVIDENCE_UNIT","ADAPTIVE_ROUTING_COEFFICIENT","STOP_THRESHOLD","INFORMATION_VALUE_PRIOR","PROFILE_FIT_MULTIPLIER","UNCERTAINTY_BAND","QUESTION_WORDING","QUESTION_MAPPING","CATEGORY_WEIGHT","CELL_WEIGHT","SCORING_RULE","OTHER_SEMANTIC"] as const;
const REVIEW_DECISIONS=["APPROVE","REVISE","REJECT"] as const;

function stable(v:unknown):string{if(v===null||typeof v!=="object")return JSON.stringify(v);if(Array.isArray(v))return `[${v.map(stable).join(",")}]`;const o=v as Record<string,unknown>;return `{${Object.keys(o).sort().map(k=>`${JSON.stringify(k)}:${stable(o[k])}`).join(",")}}`;}
function sha(v:unknown){return createHash("sha256").update(stable(v)).digest("hex");}
function txt(v:unknown,min:number,max:number,name:string){const s=String(v??"").trim();if(s.length<min||s.length>max)throw badRequest(`${name} must be ${min}-${max} characters`);return s;}
function enumValue<T extends readonly string[]>(v:unknown,allowed:T,name:string):T[number]{const s=String(v??"") as T[number];if(!allowed.includes(s))throw badRequest(`Invalid ${name}`);return s;}
function safePath(v:unknown){const s=txt(v,2,240,"sourcePath");if(!/^[A-Za-z0-9_.:\-/\[\]]+$/.test(s))throw badRequest("sourcePath contains unsupported characters");return s;}
function shaInput(v:unknown,name:string){const s=String(v??"").trim().toLowerCase();if(!/^[a-f0-9]{64}$/.test(s))throw badRequest(`${name} must be a SHA-256 hex digest`);return s;}

async function approvedPilotEvidence(userId:string,studyId:string){
  const study=await requireStudyCreator(userId,studyId);
  if(study.status!=="READY_FOR_REVIEW"&&study.status!=="CLOSED")throw conflict("Pilot study is not at an evidence-review state");
  if(study.methodologyVersion.status!=="ACTIVE")throw conflict("Pilot source methodology is no longer ACTIVE; create calibration from the currently governed evidence/version chain");
  const latestAnalysis=await prisma.pilotAnalysisRun.findFirst({where:{studyId},orderBy:{createdAt:"desc"}});
  if(!latestAnalysis)throw conflict("No real-company pilot analysis exists; calibration is blocked");
  const gatePayload=latestAnalysis.gates as any;
  if(!gatePayload?.readyForReview)throw conflict("Pilot evidence gates are not READY; calibration is blocked");
  const latestDecision=await prisma.pilotGateDecision.findFirst({where:{studyId},orderBy:{createdAt:"desc"}});
  if(!latestDecision||latestDecision.analysisRunId!==latestAnalysis.id||latestDecision.status!=="APPROVE")throw conflict("Latest pilot evidence has not received an APPROVE decision; calibration is blocked");
  return {study,latestAnalysis,latestDecision,gatePayload};
}

export async function createCalibrationProposal(userId:string,input:any){
  const studyId=txt(input.studyId,1,128,"studyId");
  const {study,latestAnalysis,latestDecision,gatePayload}=await approvedPilotEvidence(userId,studyId);
  const proposedVersion=txt(input.proposedVersion,5,32,"proposedVersion");
  let versionCmp:number;try{versionCmp=compareSemver(proposedVersion,study.methodologyVersion.version);}catch{throw badRequest("proposedVersion must use x.y.z semantic versioning");}
  if(versionCmp<=0)throw badRequest("proposedVersion must be higher than the source methodology version");
  const reviewerUserId=txt(input.reviewerUserId,1,128,"reviewerUserId"); if(reviewerUserId===userId)throw badRequest("Calibration reviewer must be independent from the proposal creator");
  const reviewer=await prisma.user.findUnique({where:{id:reviewerUserId},select:{id:true,status:true}});if(!reviewer||reviewer.status!=="ACTIVE")throw notFound("Independent calibration reviewer not found or inactive");
  const title=txt(input.title,5,160,"title"),summary=txt(input.summary,20,4000,"summary");
  const raw=Array.isArray(input.changes)?input.changes:[];if(raw.length<1||raw.length>100)throw badRequest("changes must contain 1-100 semantic calibration changes");
  const gateMap=evidenceGateMap(gatePayload);const changes=raw.map((c:any,i:number)=>{
    const kind=enumValue(c.kind,CHANGE_KINDS,"calibration change kind"),sourcePath=safePath(c.sourcePath),rationale=txt(c.rationale,20,2000,"change rationale");
    if(c.beforeValue===undefined||c.proposedValue===undefined)throw badRequest("beforeValue and proposedValue are required");
    if(stable(c.beforeValue)===stable(c.proposedValue))throw badRequest("A calibration change must actually change a value");
    const evidenceGateIds:string[]=[...new Set<string>((Array.isArray(c.evidenceGateIds)?c.evidenceGateIds:[]).map((x:unknown)=>String(x).trim()).filter((x:string)=>x.length>0))];
    const reasons=calibrationEvidenceReasons({sourceVersion:study.methodologyVersion.version,proposedVersion,readyForReview:Boolean(gatePayload.readyForReview),pilotDecisionStatus:latestDecision.status,gatePayload,evidenceGateIds});
    if(reasons.length)throw conflict(`Calibration change ${i+1} is not evidence-governed: ${reasons.join(", ")}`);
    for(const id of evidenceGateIds)if(gateMap.get(id)!=="READY")throw conflict(`Evidence gate ${id} is not READY`);
    return {orderIndex:i+1,kind,sourcePath,beforeValue:c.beforeValue,proposedValue:c.proposedValue,rationale,evidenceGateIds};
  });
  const evidenceSha256=sha({studyId,analysisRunId:latestAnalysis.id,analysisSha256:latestAnalysis.inputSha256,pilotDecisionId:latestDecision.id,sourceVersion:study.methodologyVersion.version,proposedVersion,changes});
  return prisma.calibrationProposal.create({data:{
    studyId,analysisRunId:latestAnalysis.id,pilotDecisionId:latestDecision.id,sourceMethodologyVersionId:study.methodologyVersionId,proposedVersion,title,summary,evidenceSha256,createdByUserId:userId,reviewerUserId,
    changes:{create:changes.map((c:any)=>({...c,evidenceGateIds:c.evidenceGateIds as any,beforeValue:c.beforeValue as any,proposedValue:c.proposedValue as any}))}
  },include:{changes:true,sourceMethodology:{select:{version:true,bundleSha256:true,status:true}},reviewer:{select:{id:true,displayName:true}}}});
}

export async function listCalibrationProposals(userId:string){return prisma.calibrationProposal.findMany({where:{OR:[{createdByUserId:userId},{reviewerUserId:userId}]},include:{sourceMethodology:{select:{version:true,status:true}},candidateMethodology:{select:{version:true,status:true,bundleSha256:true}},_count:{select:{changes:true,reviews:true}}},orderBy:{createdAt:"desc"}});}

export async function getCalibrationProposal(userId:string,proposalId:string){const p=await prisma.calibrationProposal.findFirst({where:{id:proposalId,OR:[{createdByUserId:userId},{reviewerUserId:userId}]},include:{changes:true,reviews:{orderBy:{createdAt:"asc"}},sourceMethodology:{select:{version:true,status:true,bundleSha256:true}},candidateMethodology:{select:{version:true,status:true,bundleSha256:true}},release:true}});if(!p)throw notFound("Calibration proposal not found");return p;}

export async function submitCalibrationProposal(userId:string,proposalId:string,input:any){
  const p=await getCalibrationProposal(userId,proposalId);if(p.createdByUserId!==userId)throw forbidden("Only the proposal creator may submit calibration");if(p.status!=="DRAFT"&&p.status!=="REVISE_REQUIRED")throw conflict("Calibration proposal is not submit-ready");
  const candidateBundleSha256=shaInput(input.candidateBundleSha256,"candidateBundleSha256");
  const candidate=await prisma.methodologyVersion.findUnique({where:{version:p.proposedVersion}});if(!candidate)throw conflict("Candidate methodology version must be imported and validated before submission");
  if(candidate.id===p.sourceMethodologyVersionId)throw conflict("Candidate methodology must be a new immutable version");
  if(candidate.status!=="VALIDATING")throw conflict("Candidate methodology must remain VALIDATING until evidence-gated activation");
  if(candidate.bundleSha256.toLowerCase()!==candidateBundleSha256)throw conflict("Candidate bundle SHA-256 does not match the imported immutable candidate");
  const importPass=await prisma.importRun.findFirst({where:{methodologyVersionId:candidate.id,bundleSha256:candidate.bundleSha256,status:"PASS"},orderBy:{finishedAt:"desc"}});if(!importPass)throw conflict("Candidate methodology import/validation has not passed");
  return prisma.calibrationProposal.update({where:{id:proposalId},data:{candidateMethodologyVersionId:candidate.id,candidateBundleSha256,status:"SUBMITTED",submittedAt:new Date()},include:{changes:true,candidateMethodology:{select:{version:true,status:true,bundleSha256:true}}}});
}

export async function reviewCalibrationProposal(userId:string,proposalId:string,input:any){
  const p=await getCalibrationProposal(userId,proposalId);if(p.reviewerUserId!==userId)throw forbidden("Only the nominated independent reviewer may review this calibration proposal");if(p.createdByUserId===userId)throw forbidden("Calibration review must be independent");if(p.status!=="SUBMITTED")throw conflict("Calibration proposal is not awaiting review");
  const decision=enumValue(input.decision,REVIEW_DECISIONS,"calibration review decision"),rationale=txt(input.rationale,20,4000,"review rationale");
  const review=await prisma.calibrationReview.create({data:{proposalId,reviewerUserId:userId,decision,rationale}});
  const status=decision==="APPROVE"?"APPROVED":decision==="REVISE"?"REVISE_REQUIRED":"REJECTED";
  await prisma.calibrationProposal.update({where:{id:proposalId},data:{status,approvedAt:decision==="APPROVE"?new Date():null}});
  return {review,proposalStatus:status,automaticActivation:false};
}

export async function activateCalibrationProposal(userId:string,proposalId:string){
  const p=await prisma.calibrationProposal.findFirst({where:{id:proposalId,createdByUserId:userId},include:{candidateMethodology:true,sourceMethodology:true,reviews:{orderBy:{createdAt:"desc"},take:1}}});if(!p)throw notFound("Calibration proposal not found");
  if(!p.candidateMethodology||!p.candidateBundleSha256)throw conflict("Calibration candidate has not been submitted");
  const latestAnalysis=await prisma.pilotAnalysisRun.findFirst({where:{studyId:p.studyId},orderBy:{createdAt:"desc"}}),latestDecision=await prisma.pilotGateDecision.findFirst({where:{studyId:p.studyId},orderBy:{createdAt:"desc"}}),lastReview=p.reviews[0];
  const importPass=await prisma.importRun.findFirst({where:{methodologyVersionId:p.candidateMethodology.id,bundleSha256:p.candidateMethodology.bundleSha256,status:"PASS"},orderBy:{finishedAt:"desc"}});
  const candidateAssessmentCount=await prisma.assessment.count({where:{methodologyVersionId:p.candidateMethodology.id}});
  const activeMethodologies=await prisma.methodologyVersion.findMany({where:{status:"ACTIVE",domainCode:"marketing"},select:{id:true}});
  const reasons=activationReasons({proposalStatus:p.status,sourceStatus:p.sourceMethodology.status,candidateStatus:p.candidateMethodology.status,independentReview:Boolean(lastReview&&lastReview.decision==="APPROVE"&&lastReview.reviewerUserId===p.reviewerUserId&&p.reviewerUserId!==p.createdByUserId),latestAnalysisMatches:latestAnalysis?.id===p.analysisRunId,latestDecisionMatches:latestDecision?.id===p.pilotDecisionId,pilotDecisionStatus:latestDecision?.status??"",candidateHashMatches:p.candidateMethodology.bundleSha256.toLowerCase()===p.candidateBundleSha256.toLowerCase(),candidateImportPassed:Boolean(importPass),candidateAssessmentCount});
  if(activeMethodologies.length!==1||activeMethodologies[0]?.id!==p.sourceMethodologyVersionId)reasons.push("ACTIVE_METHODOLOGY_SET_INVALID");
  if(reasons.length)throw conflict(`Calibration activation blocked: ${reasons.join(", ")}`);
  const releaseSha256=sha({proposalId:p.id,evidenceSha256:p.evidenceSha256,sourceBundleSha256:p.sourceMethodology.bundleSha256,candidateBundleSha256:p.candidateMethodology.bundleSha256,analysisRunId:p.analysisRunId,pilotDecisionId:p.pilotDecisionId,reviewId:lastReview!.id});
  return prisma.$transaction(async tx=>{
    const source=await tx.methodologyVersion.findUnique({where:{id:p.sourceMethodologyVersionId}}),candidate=await tx.methodologyVersion.findUnique({where:{id:p.candidateMethodologyVersionId!}});const activeCount=await tx.methodologyVersion.count({where:{status:"ACTIVE",domainCode:"marketing"}});if(source?.status!=="ACTIVE"||source.domainCode!=="marketing"||candidate?.status!=="VALIDATING"||candidate.domainCode!=="marketing"||activeCount!==1)throw conflict("Methodology activation state changed; retry after review");
    await tx.methodologyVersion.update({where:{id:source.id},data:{status:"ARCHIVED"}});
    await tx.methodologyVersion.update({where:{id:candidate.id},data:{status:"ACTIVE",activatedAt:new Date()}});
    const release=await tx.calibrationRelease.create({data:{proposalId:p.id,sourceMethodologyVersionId:source.id,candidateMethodologyVersionId:candidate.id,activatedByUserId:userId,releaseSha256}});
    await tx.calibrationProposal.update({where:{id:p.id},data:{status:"ACTIVATED",activatedAt:release.activatedAt}});
    return {release,sourceVersion:p.sourceMethodology.version,candidateVersion:p.candidateMethodology!.version,releaseSha256,automaticActivation:false};
  });
}

export async function calibrationManifest(userId:string,proposalId:string){
  const p=await getCalibrationProposal(userId,proposalId);return {schemaVersion:"MMRI-CALIBRATION-MANIFEST-1.0",proposalId:p.id,status:p.status,sourceVersion:p.sourceMethodology.version,proposedVersion:p.proposedVersion,evidenceSha256:p.evidenceSha256,candidateBundleSha256:p.candidateBundleSha256??null,changes:p.changes.map((c:any)=>({orderIndex:c.orderIndex,kind:c.kind,sourcePath:c.sourcePath,beforeValue:c.beforeValue,proposedValue:c.proposedValue,rationale:c.rationale,evidenceGateIds:c.evidenceGateIds})),reviews:p.reviews.map((r:any)=>({decision:r.decision,rationale:r.rationale,createdAt:r.createdAt})),release:p.release?{releaseSha256:p.release.releaseSha256,activatedAt:p.release.activatedAt}:null,governance:{sourceImmutable:true,newVersionRequired:true,automaticCalibration:false,automaticActivation:false,realPilotEvidenceRequired:true}};}
