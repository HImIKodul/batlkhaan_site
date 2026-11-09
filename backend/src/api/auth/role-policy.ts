import { conflict } from "../errors.js";

export type MembershipRole = "OWNER" | "ADMIN" | "ASSESSOR" | "CONSULTANT" | "VIEWER";

export function assertOwnerTransitionAllowed(existingRole:MembershipRole|undefined,nextRole:MembershipRole,ownerCount:number){
  if(existingRole==="OWNER"&&nextRole!=="OWNER"&&ownerCount<=1){
    throw conflict("A company must retain at least one OWNER");
  }
}
