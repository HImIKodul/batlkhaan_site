import { createHash } from "node:crypto";
import { conflict } from "../api/errors.js";

export const PERSISTENCE_CONTRACT_VERSION = "PERSIST-v1.0-STEP11";
export const WRITER_LEASE_TTL_MS = 120_000;
export const WRITER_LEASE_HEARTBEAT_MS = 30_000;

export type PersistenceWriteGuard = {
  writerLeaseId: string;
  expectedAssessmentRevision: number;
};

export type AnswerWriteGuard = PersistenceWriteGuard & {
  clientRequestId: string;
  questionIssueId: string;
};

export function requireWriterId(value: string | undefined | null): string {
  const id = value?.trim();
  if (!id || id.length > 160) throw conflict("A valid writer lease id is required");
  return id;
}

export function assertRevision(actual: number, expected: number): void {
  if (!Number.isInteger(expected) || expected !== actual) {
    throw conflict(`Assessment revision conflict: expected ${expected}, current ${actual}`);
  }
}

export function assertWriterLease(assessment: { activeWriterLeaseId?: string | null; writerLeaseExpiresAt?: Date | null }, writerLeaseId: string, now = new Date()): void {
  if (assessment.activeWriterLeaseId !== writerLeaseId || !assessment.writerLeaseExpiresAt || assessment.writerLeaseExpiresAt.getTime() <= now.getTime()) {
    throw conflict("Writer lease is missing, expired, or owned by another client");
  }
}

export function leaseExpiry(now = new Date()): Date {
  return new Date(now.getTime() + WRITER_LEASE_TTL_MS);
}

export function canonicalJson(value: unknown): string {
  const normalize = (v: any): any => {
    if (Array.isArray(v)) return v.map(normalize);
    if (v && typeof v === "object" && !(v instanceof Date)) {
      return Object.fromEntries(Object.keys(v).sort().map(k => [k, normalize(v[k])]));
    }
    return v instanceof Date ? v.toISOString() : v;
  };
  return JSON.stringify(normalize(value));
}

export function sha256Canonical(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
