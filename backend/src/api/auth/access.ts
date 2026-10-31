import { prisma } from "../../db.js";
import type { ApiConfig } from "../config.js";
import { forbidden, notFound, unauthorized } from "../errors.js";
import { verifyAccessToken } from "./crypto.js";

export type CompanyRole = "OWNER" | "ADMIN" | "ASSESSOR" | "CONSULTANT" | "VIEWER";
export interface Principal { userId: string; email: string; tokenVersion: number; }

export async function authenticate(authorization: string | undefined, config: ApiConfig): Promise<Principal> {
  const match = /^Bearer\s+(.+)$/i.exec(authorization ?? "");
  if (!match) throw unauthorized();
  const claims = verifyAccessToken(match[1], config);
  const user = await prisma.user.findUnique({ where: { id: claims.sub }, select: { id:true,email:true,status:true,tokenVersion:true } });
  if (!user || user.status !== "ACTIVE" || user.tokenVersion !== claims.tv) throw unauthorized("Session is no longer valid");
  return { userId: user.id, email: user.email, tokenVersion: user.tokenVersion };
}

export async function requireCompanyRole(userId: string, companyId: string, allowed: readonly CompanyRole[]) {
  const membership = await prisma.companyMembership.findUnique({ where: { companyId_userId: { companyId, userId } } });
  if (!membership || !allowed.includes(membership.role as CompanyRole)) throw forbidden();
  return membership;
}

export async function assessmentAccess(userId: string, assessmentId: string, allowed: readonly CompanyRole[]) {
  const assessment = await prisma.assessment.findFirst({
    where: {
      id: assessmentId,
      company: { memberships: { some: { userId, role: { in: [...allowed] as any } } } }
    },
    select: { id:true,companyId:true,methodologyVersionId:true,status:true,mode:true,routingState:true }
  });
  if (!assessment) throw notFound("Assessment not found");
  const membership = await prisma.companyMembership.findUnique({ where: { companyId_userId: { companyId: assessment.companyId, userId } } });
  if (!membership || !allowed.includes(membership.role as CompanyRole)) throw notFound("Assessment not found");
  return { assessment, membership };
}

export async function billingInvoiceAccess(userId:string,invoiceId:string,allowed:readonly CompanyRole[]){
  const invoice=await prisma.billingInvoice.findFirst({
    where:{id:invoiceId,company:{memberships:{some:{userId,role:{in:[...allowed] as any}}}}},
    select:{id:true,companyId:true}
  });
  if(!invoice)throw notFound("Billing invoice not found");
  return invoice;
}

export async function pilotEnrollmentAccess(userId:string,enrollmentId:string,allowed:readonly CompanyRole[]){
  const enrollment=await prisma.pilotEnrollment.findFirst({
    where:{id:enrollmentId,company:{memberships:{some:{userId,role:{in:[...allowed] as any}}}}},
    select:{id:true,companyId:true}
  });
  if(!enrollment)throw notFound("Pilot enrollment not found");
  return enrollment;
}

export function requireOperator(principal:Principal,config:ApiConfig):void{
  if(!config.operatorEmails.has(principal.email.trim().toLowerCase()))throw notFound("Route not found");
}
