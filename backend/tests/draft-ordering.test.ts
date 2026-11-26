import { describe, expect, it, vi } from "vitest";

const store: { draft: any } = { draft: null };
const tx = {
  assessment: {
    findUnique: async () => ({ id: "a1", status: "IN_PROGRESS", assessmentRevision: 3, activeWriterLeaseId: "w1", writerLeaseExpiresAt: new Date(Date.now() + 60_000), currentQuestionIssueId: "i1", methodologyVersionId: "m1" }),
    update: async () => ({})
  },
  assessmentAskedQuestion: { findUnique: async () => ({ id: "i1", assessmentId: "a1", status: "ISSUED", questionId: "q:Q1" }) },
  responseDraft: {
    findUnique: async () => store.draft,
    update: async ({ data }: any) => (store.draft = { ...store.draft, ...data, draftRevision: store.draft.draftRevision + 1, serverAckAt: new Date(), id: "d1" }),
    create: async ({ data }: any) => (store.draft = { ...data, id: "d1", serverAckAt: new Date() })
  },
  auditEvent: { create: async () => ({}) },
  $queryRaw: async () => []
};
vi.mock("../src/db.js", () => ({ prisma: { $transaction: async (fn: any) => fn(tx) } }));
vi.mock("../src/lib/ids.js", async (orig) => ({ ...(await orig<any>()), questionId: (_v: string, q: string) => `q:${q}` }));
vi.mock("../src/services/methodology-cache.js", () => ({ MethodologyDefinitionCache: class { get = async () => ({ version: "v" }); } }));

import { PrismaAssessmentEngine, publicDraftValue } from "../src/services/prisma-assessment-engine.js";

const save = (engine: any, optionIndex: number, clientSequence?: number) =>
  engine.saveDraft("a1", { questionIssueId: "i1", questionId: "Q1", draft: { optionIndex }, expectedAssessmentRevision: 3, writerLeaseId: "w1", clientSequence });

describe("draft ordering", () => {
  it("a delayed older request never replaces the newer stored selection", async () => {
    store.draft = null;
    const engine: any = new PrismaAssessmentEngine();
    expect((await save(engine, 3, 200)).saved).toBe(true);
    const late = await save(engine, 2, 100);
    expect(late.saved).toBe(false);
    expect(late.stale).toBe(true);
    expect(publicDraftValue(store.draft.draft)).toEqual({ optionIndex: 3 });
  });
  it("same sequence replay (delayed retry) is ignored, a newer one wins, clear-selection is ordered too", async () => {
    store.draft = null;
    const engine: any = new PrismaAssessmentEngine();
    await save(engine, 1, 10);
    expect((await save(engine, 1, 10)).saved).toBe(false);
    expect((await save(engine, 4, 11)).saved).toBe(true);
    expect(publicDraftValue(store.draft.draft)).toEqual({ optionIndex: 4 });
    const cleared = await engine.saveDraft("a1", { questionIssueId: "i1", questionId: "Q1", draft: {}, expectedAssessmentRevision: 3, writerLeaseId: "w1", clientSequence: 12 });
    expect(cleared.saved).toBe(true);
    expect(publicDraftValue(store.draft.draft)).toEqual({});
    expect((await save(engine, 2, 11)).saved).toBe(false);
  });
  it("legacy clients without a sequence keep last-write behavior", async () => {
    store.draft = null;
    const engine: any = new PrismaAssessmentEngine();
    await save(engine, 1);
    expect((await save(engine, 2)).saved).toBe(true);
  });
});
