import "dotenv/config";
import path from "node:path";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { prisma } from "./db.js";
import { loadApiConfig } from "./api/config.js";

type RoleRow={current_user:string;rolsuper:boolean;rolcreaterole:boolean;rolcreatedb:boolean;rolreplication:boolean;rolbypassrls:boolean;can_create_public:boolean;can_use_public:boolean};

async function main(){
  if((process.env.NODE_ENV??"").trim().toLowerCase()!=="production")throw new Error("NODE_ENV=production is required for production security verification");
  loadApiConfig();
  const rows=await prisma.$queryRawUnsafe<RoleRow[]>(`SELECT current_user, r.rolsuper, r.rolcreaterole, r.rolcreatedb, r.rolreplication, r.rolbypassrls, has_schema_privilege(current_user,'public','CREATE') AS can_create_public, has_schema_privilege(current_user,'public','USAGE') AS can_use_public FROM pg_roles r WHERE r.rolname=current_user`);
  const role=rows[0];if(!role)throw new Error("Cannot resolve PostgreSQL runtime role");
  if(role.rolsuper||role.rolcreaterole||role.rolcreatedb||role.rolreplication||role.rolbypassrls)throw new Error(`Runtime PostgreSQL role ${role.current_user} has administrative privileges`);
  if(role.can_create_public)throw new Error(`Runtime PostgreSQL role ${role.current_user} must not have CREATE privilege on public schema`);
  if(!role.can_use_public)throw new Error(`Runtime PostgreSQL role ${role.current_user} requires USAGE on public schema`);

  type TablePrivilegeRow={table_name:string;can_select:boolean;can_insert:boolean;can_update:boolean;can_delete:boolean};
  const tablePrivileges=await prisma.$queryRawUnsafe<TablePrivilegeRow[]>(`SELECT table_name, has_table_privilege(current_user, quote_ident(table_schema)||'.'||quote_ident(table_name), 'SELECT') AS can_select, has_table_privilege(current_user, quote_ident(table_schema)||'.'||quote_ident(table_name), 'INSERT') AS can_insert, has_table_privilege(current_user, quote_ident(table_schema)||'.'||quote_ident(table_name), 'UPDATE') AS can_update, has_table_privilege(current_user, quote_ident(table_schema)||'.'||quote_ident(table_name), 'DELETE') AS can_delete FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name <> '_prisma_migrations' ORDER BY table_name`);
  const missingTables=tablePrivileges.filter(row=>!row.can_select||!row.can_insert||!row.can_update||!row.can_delete);
  if(missingTables.length)throw new Error(`Runtime PostgreSQL role ${role.current_user} lacks required DML privileges on: ${missingTables.map(x=>x.table_name).join(', ')}`);
  type SequencePrivilegeRow={sequence_name:string;can_usage:boolean;can_select:boolean;can_update:boolean};
  const sequencePrivileges=await prisma.$queryRawUnsafe<SequencePrivilegeRow[]>(`SELECT sequence_name, has_sequence_privilege(current_user, quote_ident(sequence_schema)||'.'||quote_ident(sequence_name), 'USAGE') AS can_usage, has_sequence_privilege(current_user, quote_ident(sequence_schema)||'.'||quote_ident(sequence_name), 'SELECT') AS can_select, has_sequence_privilege(current_user, quote_ident(sequence_schema)||'.'||quote_ident(sequence_name), 'UPDATE') AS can_update FROM information_schema.sequences WHERE sequence_schema='public' ORDER BY sequence_name`);
  const missingSequences=sequencePrivileges.filter(row=>!row.can_usage||!row.can_select||!row.can_update);
  if(missingSequences.length)throw new Error(`Runtime PostgreSQL role ${role.current_user} lacks required sequence privileges on: ${missingSequences.map(x=>x.sequence_name).join(', ')}`);

  const root=path.resolve(process.env.MMRI_REPORT_STORAGE_DIR??"");
  await mkdir(root,{recursive:true,mode:0o700});
  const info=await stat(root);if(!info.isDirectory())throw new Error("MMRI_REPORT_STORAGE_DIR is not a directory");
  if((info.mode&0o002)!==0)throw new Error("MMRI_REPORT_STORAGE_DIR must not be world-writable");
  const probe=path.join(root,`.security-probe-${randomUUID()}`);
  await writeFile(probe,"mmri",{mode:0o600});await rm(probe,{force:true});
  console.log(JSON.stringify({status:"PASS",runtimeDatabaseRole:role.current_user,roleAdministrative:false,publicSchemaCreate:false,applicationTablesVerified:tablePrivileges.length,sequencesVerified:sequencePrivileges.length,reportStorageWritable:true},null,2));
}
main().finally(()=>prisma.$disconnect()).catch(error=>{console.error(JSON.stringify({status:"FAIL",error:error instanceof Error?error.message:String(error)},null,2));process.exit(1)});
