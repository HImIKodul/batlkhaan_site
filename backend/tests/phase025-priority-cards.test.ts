import { describe, it, expect } from "vitest";
import { buildFindingSet, type CapabilityResult } from "../src/strategy/proposed/phase025-priority-cards.js";

const mk = (n: number, f: (i: number) => Partial<CapabilityResult>): CapabilityResult[] =>
  Array.from({ length: n }, (_, i) => ({ id: `X-C${i + 1}`, nameMn: `Чадавх ${i + 1}`, weightPct: 100 / n, score: 50, applicableCellCount: 30, finalizedCellCount: 2, confirmedNotApplicable: false, ...f(i) }));
const obj = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`X-C${i + 1}`, { defaultOwner: "R1", sponsor: "R0", objective: `Зорилт ${i + 1}.` }]));
const roles = [{ id: "R1", label: "Эзэн" }];

describe("Phase 2.5 proposed finding/priority cards (B4)", () => {
  it("no verified strengths: reports none instead of fabricating", () => {
    const r = buildFindingSet(mk(10, () => ({ score: 10 })), obj(10), roles);
    expect(r.strengths).toHaveLength(0);
    expect(r.notices.join(" ")).toContain("давуу тал илрээгүй");
  });
  it("no meaningful weaknesses: never labels 92 as a weakness; uses SUSTAIN cards", () => {
    const r = buildFindingSet(mk(10, i => ({ score: 90 + i % 3 })), obj(10), roles);
    expect(r.verifiedWeaknesses).toHaveLength(0);
    expect(r.priorities.every(c => c.kind === "SUSTAIN")).toBe(true);
    expect(r.priorities.length).toBeLessThanOrEqual(5);
  });
  it("weakness with a high absolute score (>= 90) is never listed", () => {
    const r = buildFindingSet(mk(10, i => ({ score: i === 0 ? 55 : 95 })), obj(10), roles);
    expect(r.verifiedWeaknesses.map(w => w.score).every(s => s <= 60)).toBe(true);
    expect(r.verifiedWeaknesses).toHaveLength(1);
  });
  it("nearly all unknown: evidence-required cards are a separate kind, not weaknesses", () => {
    const r = buildFindingSet(mk(10, () => ({ score: null, finalizedCellCount: 0 })), obj(10), roles);
    expect(r.verifiedWeaknesses).toHaveLength(0);
    expect(r.priorities.every(c => c.kind === "EVIDENCE_REQUIRED")).toBe(true);
    expect(r.priorities[0].findingMn).toContain("баталгаажсан сул тал биш");
  });
  it("excluded capabilities get no card and are disclosed with their weight", () => {
    const caps = mk(10, i => (i < 4 ? { confirmedNotApplicable: true, score: null } : { score: 20 }));
    const r = buildFindingSet(caps, obj(10), roles);
    const ex = new Set(r.excluded.map(e => e.capabilityId));
    expect(ex.size).toBe(4);
    expect(r.priorities.some(c => ex.has(c.capabilityId))).toBe(false);
    expect(r.excludedWeightPct).toBeCloseTo(40, 6);
    expect(r.notices[0]).toContain("хамаарахгүй");
  });
  it("contradictory capability is CONTESTED, not a verified score", () => {
    const r = buildFindingSet(mk(6, i => (i === 0 ? { hardContradiction: true, score: 50 } : { score: 95 })), obj(6), roles);
    expect(r.verifiedWeaknesses.find(w => w.capabilityId === "X-C1")).toBeUndefined();
    expect(r.priorities.some(c => c.kind === "CONTESTED" && c.capabilityId === "X-C1")).toBe(true);
  });
  it("every card names its capability, has owner, KPI, horizon and >=2 trace ids; actions are capability-specific", () => {
    const r = buildFindingSet(mk(12, i => ({ score: i * 5 })), obj(12), roles);
    for (const c of r.priorities) {
      expect(c.findingMn).toContain(c.capabilityNameMn);
      expect(c.ownerLabelMn).toBe("Эзэн");
      expect(c.kpiMn.length).toBeGreaterThan(5);
      expect(c.sourceTraceIds.length).toBeGreaterThanOrEqual(2);
    }
    expect(new Set(r.priorities.map(c => c.actionMn)).size).toBe(r.priorities.length);
  });
  it("never invents an objective for a capability the contract does not define", () => {
    const r = buildFindingSet(mk(3, () => ({ score: 5 })), {}, roles);
    expect(r.priorities).toHaveLength(0);
  });
  it("deterministic regardless of input order", () => {
    const caps = mk(12, i => ({ score: (i * 7) % 50 }));
    expect(buildFindingSet(caps.slice().reverse(), obj(12), roles)).toEqual(buildFindingSet(caps, obj(12), roles));
  });
});
