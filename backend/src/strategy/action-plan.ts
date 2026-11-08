import type { MethodologyDefinition, ProfileAnswer } from "../engine/types.js";
import type { ActionPlan, HorizonId, MilestoneStatus, PlanDependency, PlanMilestone, PlanProgress, Recommendation, RecommendationResult } from "./types.js";
import { selectRecommendationActions } from "./recommendations.js";

const horizonIds: HorizonId[] = ["H0","H1","H2","H3","H4"];
const horizonIndex = (h: HorizonId): number => horizonIds.indexOf(h);
const shiftHorizon = (h: HorizonId, n: number): HorizonId | "DEFERRED_BEYOND_V1" => {
  const idx = horizonIndex(h) + n;
  return idx >= 0 && idx < horizonIds.length ? horizonIds[idx] : "DEFERRED_BEYOND_V1";
};

export function currentHorizonFromDates(planStart: Date, now: Date = new Date()): HorizonId {
  const day = Math.max(0, Math.floor((now.getTime() - planStart.getTime()) / 86_400_000));
  if (day <= 14) return "H0";
  if (day <= 30) return "H1";
  if (day <= 90) return "H2";
  if (day <= 180) return "H3";
  return "H4";
}

function initialStart(type: string, band: string, matrix: any[]): { horizon: HorizonId; startDay: number } {
  const row = matrix.find(x => x.recommendationType === type && x.priorityBand === band);
  if (row) return { horizon: row.horizon, startDay: Number(row.startDay) };
  return { horizon: band === "P1" ? "H0" : band === "P2" ? "H1" : band === "P3" ? "H2" : "H3", startDay: 0 };
}

function scopesOf(rec: Recommendation): Array<{ categoryId: string; cellId: string }> {
  return rec.affectedScopes?.length
    ? rec.affectedScopes.map(x => ({ categoryId: x.categoryId, cellId: x.cellId }))
    : [{ categoryId: rec.categoryId, cellId: rec.cellId }];
}

function isDependency(upstream: Recommendation, downstream: Recommendation, rootContract: any): boolean {
  const up = scopesOf(upstream);
  const down = scopesOf(downstream);
  for (const u of up) for (const d of down) {
    if ((rootContract.categoryGraph?.edges ?? []).some((e: any) => e.prerequisite === u.categoryId && e.dependent === d.categoryId)) return true;
    if (u.categoryId === d.categoryId && (rootContract.cellGraph?.edges ?? []).some((e: any) => e.prerequisite === u.cellId && e.dependent === d.cellId)) return true;
  }
  return false;
}

function buildPlanDependencies(selected: Recommendation[], rootContract: any): PlanDependency[] {
  const out: PlanDependency[] = [];
  const add = (kind: PlanDependency["kind"], upstream: Recommendation, downstream: Recommendation) => {
    if (upstream.id === downstream.id) return;
    const id = `DEP-${kind}-${upstream.id}-${downstream.id}`;
    if (out.some(x => x.id === id)) return;
    out.push({
      id, kind, upstreamRecommendationId: upstream.id, downstreamRecommendationId: downstream.id,
      sourceTraceIds: [...new Set([...upstream.sourceTraceIds, ...downstream.sourceTraceIds, `dependency:${id}`])]
    });
  };
  const evidenceTypes = new Set(["VALIDATE_CAUSE","COLLECT_EVIDENCE","RESOLVE_EVIDENCE"]);
  /* Evidence collection/validation never waits for a root-cause fix: gathering facts about a capability has no causal prerequisite, and chaining it
     behind executions pushed every evidence action out of the 365-day window for evidence-poor assessments (F-ROADMAP). */
  for (const upstream of selected) for (const downstream of selected) {
    if (evidenceTypes.has(downstream.type)) continue;
    if (isDependency(upstream, downstream, rootContract)) add("ROOT_CAUSE_GRAPH", upstream, downstream);
  }
  for (const downstream of selected) {
    if (downstream.type !== "EXECUTION" && downstream.type !== "LOCAL_IMPROVEMENT") continue;
    for (const upstream of selected) {
      if (evidenceTypes.has(upstream.type) && upstream.findingId === downstream.findingId) add("SAME_FINDING_EVIDENCE", upstream, downstream);
    }
  }
  return out.sort((a,b) => a.upstreamRecommendationId.localeCompare(b.upstreamRecommendationId) || a.downstreamRecommendationId.localeCompare(b.downstreamRecommendationId) || a.kind.localeCompare(b.kind));
}

function firstHorizonFor(plan: ActionPlan, recommendationId: string): HorizonId | "DEFERRED_BEYOND_V1" | null {
  const rows = plan.milestones.filter(m => m.recommendationId === recommendationId);
  if (!rows.length) return null;
  return rows.map(m => m.horizon).sort((a,b) => {
    const ai = a === "DEFERRED_BEYOND_V1" ? 99 : horizonIndex(a);
    const bi = b === "DEFERRED_BEYOND_V1" ? 99 : horizonIndex(b);
    return ai-bi;
  })[0];
}

export function assertActionPlanIntegrity(methodology: MethodologyDefinition, recommendations: RecommendationResult, plan: ActionPlan): void {
  const contract = methodology.contracts.actionPlan;
  if (plan.windowDays !== 365) throw new Error(`Action plan window must be 365 days, got ${plan.windowDays}`);
  const horizons = plan.horizons;
  if (horizons.length !== 5 || horizons[0]?.dayStart !== 0 || horizons[horizons.length-1]?.dayEnd !== 365) throw new Error("Action plan horizons must cover day 0 through day 365");
  for (let i=0;i<horizons.length;i++) {
    const h = horizons[i];
    if (!horizonIds.includes(h.id) || h.dayEnd < h.dayStart) throw new Error(`Invalid action-plan horizon ${h.id}`);
    if (i>0 && horizons[i-1].dayEnd + 1 !== h.dayStart) throw new Error(`Action-plan horizons are not contiguous at ${h.id}`);
  }

  const expectedSelection = selectRecommendationActions(recommendations, Number(contract.inputs?.maximumExecutionLocalActions ?? 5), Number(contract.inputs?.maximumEvidenceValidationActions ?? 2)).planActions.map(x=>x.id);
  if (JSON.stringify(plan.includedRecommendationIds) !== JSON.stringify(expectedSelection)) throw new Error("Action plan included recommendations differ from authoritative selection");
  if (new Set(plan.includedRecommendationIds).size !== plan.includedRecommendationIds.length) throw new Error("Action plan contains duplicate recommendation IDs");
  const recById = new Map(recommendations.candidates.map(r=>[r.id,r]));
  const selectedIds = new Set(plan.includedRecommendationIds);
  for (const id of selectedIds) if (!recById.has(id)) throw new Error(`Action plan references unknown recommendation ${id}`);

  const roleIds = new Set((methodology.contracts.authority?.roles ?? []).map((r:any)=>String(r.id ?? "")).filter(Boolean));
  const milestoneIds = new Set<string>();
  const milestonesByRecommendation = new Map<string,PlanMilestone[]>();
  for (const m of plan.milestones) {
    if (milestoneIds.has(m.id)) throw new Error(`Duplicate action-plan milestone ${m.id}`);
    milestoneIds.add(m.id);
    const rec = recById.get(m.recommendationId);
    if (!rec || !selectedIds.has(m.recommendationId)) throw new Error(`Milestone ${m.id} references unselected recommendation ${m.recommendationId}`);
    if (m.findingId !== rec.findingId) throw new Error(`Milestone ${m.id} finding lineage mismatch`);
    if (m.ownerRoleId !== rec.ownerRoleId) throw new Error(`Milestone ${m.id} owner differs from recommendation owner`);
    if (roleIds.size && !roleIds.has(m.ownerRoleId)) throw new Error(`Milestone ${m.id} references unknown owner role ${m.ownerRoleId}`);
    if (!String(m.titleMn??"").trim() || !String(m.milestoneMn??"").trim() || !String(m.deliverableMn??"").trim() || !String(m.kpiMn??"").trim()) throw new Error(`Milestone ${m.id} has incomplete customer-facing content`);
    if (!Number.isInteger(m.phaseIndex) || m.phaseIndex < 1) throw new Error(`Milestone ${m.id} has invalid phase index`);
    if (!Number.isFinite(m.scheduleScore) || !Number.isFinite(m.recommendationPriority)) throw new Error(`Milestone ${m.id} has invalid scheduling values`);
    if (!m.sourceTraceIds.includes(`milestone:${m.id}`)) throw new Error(`Milestone ${m.id} is missing its own trace ID`);
    if (m.status !== "NOT_STARTED") throw new Error(`Generated milestone ${m.id} must start as NOT_STARTED`);
    const rows = milestonesByRecommendation.get(m.recommendationId) ?? []; rows.push(m); milestonesByRecommendation.set(m.recommendationId, rows);
  }
  for (const id of selectedIds) if (!(milestonesByRecommendation.get(id)?.length)) throw new Error(`Selected recommendation ${id} has no 365-day milestone`);
  for (const [id, rows] of milestonesByRecommendation) {
    rows.sort((a,b)=>a.phaseIndex-b.phaseIndex);
    const phases = rows.map(x=>x.phaseIndex);
    if (new Set(phases).size !== phases.length) throw new Error(`Recommendation ${id} has duplicate milestone phases`);
    for (let i=0;i<rows.length;i++) if (rows[i].phaseIndex !== i+1) throw new Error(`Recommendation ${id} has non-contiguous milestone phases`);
    let last=-1, deferred=false;
    for (const m of rows) {
      if (m.horizon === "DEFERRED_BEYOND_V1") { deferred=true; continue; }
      if (deferred) throw new Error(`Recommendation ${id} returns from deferred state into the 365-day window`);
      const idx=horizonIndex(m.horizon);
      if (idx < last) throw new Error(`Recommendation ${id} milestone horizons move backwards`);
      last=idx;
    }
  }

  const depIds = new Set<string>();
  for (const d of plan.dependencies) {
    if (depIds.has(d.id)) throw new Error(`Duplicate plan dependency ${d.id}`);
    depIds.add(d.id);
    if (d.upstreamRecommendationId === d.downstreamRecommendationId) throw new Error(`Self dependency ${d.id}`);
    if (!selectedIds.has(d.upstreamRecommendationId) || !selectedIds.has(d.downstreamRecommendationId)) throw new Error(`Dependency ${d.id} references an unselected recommendation`);
    const up=firstHorizonFor(plan,d.upstreamRecommendationId), down=firstHorizonFor(plan,d.downstreamRecommendationId);
    if (!up || !down) throw new Error(`Dependency ${d.id} cannot resolve recommendation start horizons`);
    if (up === "DEFERRED_BEYOND_V1" && down !== "DEFERRED_BEYOND_V1") throw new Error(`Dependency ${d.id} defers prerequisite beyond its dependent`);
    if (up !== "DEFERRED_BEYOND_V1" && down !== "DEFERRED_BEYOND_V1") {
      if (horizonIndex(up) > horizonIndex(down)) throw new Error(`Dependency ${d.id} starts prerequisite after dependent`);
      if (d.kind === "SAME_FINDING_EVIDENCE" && horizonIndex(up) >= horizonIndex(down)) throw new Error(`Evidence dependency ${d.id} must complete before execution starts`);
    }
  }

  const capacity = contract.capacity[String(plan.capacityLevel)] ?? contract.capacity["3"];
  const maxActive = Number(capacity.maxActiveActions ?? 3), maxHigh = Number(capacity.maxHighEffortActive ?? 2);
  for (const h of horizonIds) {
    const activeIds = new Set(plan.milestones.filter(m=>m.requirement==="Required"&&m.horizon===h).map(m=>m.recommendationId));
    const active = [...activeIds].map(id=>recById.get(id)!).filter(Boolean);
    if (active.length > maxActive) throw new Error(`Capacity overflow in ${h}: ${active.length} active actions > ${maxActive}`);
    if (active.filter(r=>r.effortLevel>=4).length > maxHigh) throw new Error(`High-effort capacity overflow in ${h}`);
  }

  const remeasurement = plan.remeasurementHorizons;
  if (new Set(remeasurement).size !== remeasurement.length || remeasurement.some(h=>!horizonIds.includes(h))) throw new Error("Invalid remeasurement horizons");
  for (let i=1;i<remeasurement.length;i++) if (horizonIndex(remeasurement[i-1]) >= horizonIndex(remeasurement[i])) throw new Error("Remeasurement horizons must be strictly increasing");
}

function activeRequiredHorizons(rec: Recommendation, start: HorizonId | "DEFERRED_BEYOND_V1", scheduleTemplates: Map<string, any[]>): Array<HorizonId> {
  if (start === "DEFERRED_BEYOND_V1") return [];
  if (rec.type !== "EXECUTION" && rec.type !== "LOCAL_IMPROVEMENT") return [start];
  const templates = scheduleTemplates.get(`${rec.cellId}:${rec.interventionCode}`) ?? [];
  if (!templates.length) return [start];
  const out: HorizonId[] = [];
  templates.forEach((t, phaseIndex) => {
    if (t.requirement !== "Required") return;
    const h = shiftHorizon(start, phaseIndex);
    if (h !== "DEFERRED_BEYOND_V1") out.push(h);
  });
  return out;
}

function specificMilestoneText(rec: Recommendation, template: string): string {
  const action = String(rec.actionMn ?? "").trim();
  const phase = String(template ?? "").trim();
  if (!action) return phase;
  if (!phase) return action;
  return `${action} ${phase}`;
}

function genericMilestoneText(type: string): { milestone: string; deliverable: string; kpi: string } {
  if (type === "VALIDATE_CAUSE") return {
    milestone: "Болзошгүй шалтгааныг үл хамаарах шууд нотолгоогоор шалгаж, баталгаажуулах эсвэл няцаах.",
    deliverable: "Баталгаажуулалтын тэмдэглэл ба нотолгооны лавлагаа",
    kpi: "Шалтгааны баталгаажуулалтын статус"
  };
  if (type === "COLLECT_EVIDENCE") return {
    milestone: "Үлдсэн шууд нотолгооны замуудын мэдээллийг бүрдүүлж, оношлох боломжтой төлөвт хүргэх.",
    deliverable: "Нотолгооны багц",
    kpi: "Хүчинтэй шууд нотолгооны замын тоо"
  };
  return {
    milestone: "Нээлттэй нягтлах шаардлагатай төлөв болон ноцтой зөрчлийг эх сурвалжийн шалгалтаар шийдвэрлэх.",
    deliverable: "Шийдвэрлэсэн нотолгооны бүртгэл",
    kpi: "Нээлттэй нотолгооны зөрчлийн тоо"
  };
}

export function buildActionPlan(
  methodology: MethodologyDefinition,
  recommendations: RecommendationResult,
  _profileAnswers?: ProfileAnswer[]
): ActionPlan {
  const contract = methodology.contracts.actionPlan;
  const rootContract = methodology.contracts.rootCause;
  if (!contract || !rootContract) throw new Error("Missing action-plan/root-cause contracts");

  const capacity = contract.capacity[String(recommendations.capacityLevel)] ?? contract.capacity["3"];
  const contractExecCap = Number(contract.inputs?.maximumExecutionLocalActions ?? 5);
  const contractEvidenceCap = Number(contract.inputs?.maximumEvidenceValidationActions ?? 2);
  const selection = selectRecommendationActions(recommendations, contractExecCap, contractEvidenceCap);
  const selected = selection.planActions;
  const evidenceIncluded = selected.filter(x => x.type === "VALIDATE_CAUSE" || x.type === "COLLECT_EVIDENCE" || x.type === "RESOLVE_EVIDENCE");
  const selectedP1 = selected.filter(x => x.priorityBand === "P1");
  const dependencies = buildPlanDependencies(selected, rootContract);

  const scheduleTemplates = new Map<string, any[]>();
  for (const row of contract.interventionSchedule ?? []) {
    const key = `${row.cell}:${row.interventionCode}`;
    const list = scheduleTemplates.get(key) ?? [];
    list.push(row);
    scheduleTemplates.set(key, list);
  }
  for (const list of scheduleTemplates.values()) list.sort((a,b) => horizonIndex(a.horizon)-horizonIndex(b.horizon));

  const startById = new Map<string, HorizonId | "DEFERRED_BEYOND_V1">();
  const scoreById = new Map<string, number>();
  for (const rec of selected) {
    let { horizon } = initialStart(rec.type, rec.priorityBand, contract.initialStartMatrix ?? []);
    const isPrereqP1 = dependencies.some(d => d.kind === "ROOT_CAUSE_GRAPH" && d.upstreamRecommendationId === rec.id && selectedP1.some(x => x.id === d.downstreamRecommendationId));
    const isPrereqOther = dependencies.some(d => d.kind === "ROOT_CAUSE_GRAPH" && d.upstreamRecommendationId === rec.id);
    const dependencyBoost = isPrereqP1 ? Number(contract.scheduling.dependencyBoost.prerequisiteToSelectedP1) : isPrereqOther ? Number(contract.scheduling.dependencyBoost.prerequisiteToOtherSelected) : 0;
    const evidenceUrgency = Number(contract.scheduling.evidenceUrgency[rec.type] ?? 0);
    const deadlineUrgency = rec.type === "EXECUTION" && rec.priorityBand === "P1"
      ? Number(contract.scheduling.deadlineUrgency.P1_EXECUTION ?? 5)
      : rec.type === "EXECUTION" && rec.priorityBand === "P2"
        ? Number(contract.scheduling.deadlineUrgency.P2_EXECUTION ?? 3)
        : 0;
    scoreById.set(rec.id, rec.priority + dependencyBoost + evidenceUrgency + deadlineUrgency);

    const evidenceForSameFinding = evidenceIncluded.find(e => e.findingId === rec.findingId);
    if ((rec.type === "EXECUTION" || rec.type === "LOCAL_IMPROVEMENT") && evidenceForSameFinding) {
      const evidenceStart = startById.get(evidenceForSameFinding.id) ?? initialStart(evidenceForSameFinding.type, evidenceForSameFinding.priorityBand, contract.initialStartMatrix ?? []).horizon;
      if (evidenceStart !== "DEFERRED_BEYOND_V1") {
        const minExecution = shiftHorizon(evidenceStart, 1);
        if (minExecution !== "DEFERRED_BEYOND_V1" && horizonIndex(horizon) <= horizonIndex(evidenceStart)) horizon = minExecution;
      }
    }
    startById.set(rec.id, horizon);
  }

  // Solve dependency and capacity constraints together. Capacity deferral can move a prerequisite/evidence
  // stream later, so dependency sequencing must be re-applied after every deferral until the schedule is stable.
  const maxActive = Number(capacity.maxActiveActions ?? 3);
  const maxHigh = Number(capacity.maxHighEffortActive ?? 2);
  const applyDependencyConstraints = (): boolean => {
    let changed = false;
    for (const dependency of dependencies) {
      const up = startById.get(dependency.upstreamRecommendationId)!;
      const down = startById.get(dependency.downstreamRecommendationId)!;
      if (down === "DEFERRED_BEYOND_V1") continue;
      if (up === "DEFERRED_BEYOND_V1") { startById.set(dependency.downstreamRecommendationId, "DEFERRED_BEYOND_V1"); changed = true; continue; }
      if (dependency.kind === "SAME_FINDING_EVIDENCE") {
        const minimumDownstream = shiftHorizon(up, 1);
        if (minimumDownstream === "DEFERRED_BEYOND_V1") { startById.set(dependency.downstreamRecommendationId, minimumDownstream); changed = true; continue; }
        if (horizonIndex(down) < horizonIndex(minimumDownstream)) { startById.set(dependency.downstreamRecommendationId, minimumDownstream); changed = true; }
      } else if (horizonIndex(down) < horizonIndex(up)) {
        startById.set(dependency.downstreamRecommendationId, up);
        changed = true;
      }
    }
    return changed;
  };

  let scheduleStable = false;
  for (let guard = 0; guard < Math.max(20, selected.length * 100); guard++) {
    let changed = applyDependencyConstraints();
    let violation: { horizon: HorizonId; active: Recommendation[] } | null = null;
    for (const h of horizonIds) {
      const active = selected.filter(r => activeRequiredHorizons(r, startById.get(r.id)!, scheduleTemplates).includes(h));
      if (active.length > maxActive || active.filter(r => r.effortLevel >= 4).length > maxHigh) { violation = { horizon: h, active }; break; }
    }
    if (violation) {
      const activeIds = new Set(violation.active.map(x=>x.id));
      const hasActiveDependent = (id:string) => dependencies.some(d => d.upstreamRecommendationId===id && activeIds.has(d.downstreamRecommendationId));
      const candidates = [...violation.active].sort((a,b) =>
        (Number(hasActiveDependent(a.id)) - Number(hasActiveDependent(b.id))) ||
        (scoreById.get(a.id)! - scoreById.get(b.id)!) ||
        (a.effortLevel - b.effortLevel) ||
        b.id.localeCompare(a.id)
      );
      const defer = candidates[0];
      const current = startById.get(defer.id)!;
      if (current !== "DEFERRED_BEYOND_V1") { startById.set(defer.id, shiftHorizon(current, 1)); changed = true; }
    }
    if (!changed) { scheduleStable = true; break; }
  }
  if (!scheduleStable) throw new Error("Action-plan scheduler could not satisfy dependency/capacity constraints deterministically");

  /* F-ROADMAP compaction. The overflow rule above only ever moves actions LATER, so free earlier horizons stayed empty while evidence-collection and
     validation actions ended up beyond day 365. Deterministic second pass: for every action (evidence/validation first, then by schedule score), take the EARLIEST horizon,
     earlier than its current start, that satisfies capacity and dependency ordering; this fills empty early horizons and rescues deferred actions. Executions never start before their contract start
     horizon; evidence/validation may start as early as H0. Scores, selection and capacity limits are untouched; nothing is invented. */
  const evidenceTypeSet = new Set(["VALIDATE_CAUSE","COLLECT_EVIDENCE","RESOLVE_EVIDENCE"]);
  const capacityHolds = (): boolean => {
    for (const h of horizonIds) {
      const active = selected.filter(r => activeRequiredHorizons(r, startById.get(r.id)!, scheduleTemplates).includes(h));
      if (active.length > maxActive || active.filter(r => r.effortLevel >= 4).length > maxHigh) return false;
    }
    return true;
  };
  const dependenciesHold = (): boolean => dependencies.every(d => {
    const up = startById.get(d.upstreamRecommendationId)!, down = startById.get(d.downstreamRecommendationId)!;
    if (up === "DEFERRED_BEYOND_V1") return down === "DEFERRED_BEYOND_V1";
    if (down === "DEFERRED_BEYOND_V1") return true;
    return d.kind === "SAME_FINDING_EVIDENCE" ? horizonIndex(up) < horizonIndex(down) : horizonIndex(up) <= horizonIndex(down);
  });
  const compactionOrder = [...selected].sort((a,b) =>
    (Number(evidenceTypeSet.has(b.type)) - Number(evidenceTypeSet.has(a.type))) ||
    (scoreById.get(b.id)! - scoreById.get(a.id)!) || (b.priority - a.priority) || a.id.localeCompare(b.id));
  for (const rec of compactionOrder) {
    const previous = startById.get(rec.id)!;
    const lowest = evidenceTypeSet.has(rec.type) ? 0 : horizonIndex(initialStart(rec.type, rec.priorityBand, contract.initialStartMatrix ?? []).horizon);
    // Take the earliest feasible horizon that is strictly earlier than the current start (a deferred action may use any horizon up to H4).
    const upTo = previous === "DEFERRED_BEYOND_V1" ? horizonIds.length - 1 : horizonIndex(previous) - 1;
    for (let i = lowest; i <= upTo; i++) {
      startById.set(rec.id, horizonIds[i]);
      if (capacityHolds() && dependenciesHold()) break;
      startById.set(rec.id, previous);
    }
  }

  const milestones: PlanMilestone[] = [];
  for (const rec of selected) {
    const start = startById.get(rec.id)!;
    const scheduleScore = scoreById.get(rec.id)!;
    if (rec.type === "EXECUTION" || rec.type === "LOCAL_IMPROVEMENT") {
      const templates = scheduleTemplates.get(`${rec.cellId}:${rec.interventionCode}`) ?? [];
      if (templates.length) {
        templates.forEach((t, phaseIndex) => {
          const h = start === "DEFERRED_BEYOND_V1" ? "DEFERRED_BEYOND_V1" : shiftHorizon(start, phaseIndex);
          milestones.push({
            id: `MS-${rec.id}-${phaseIndex+1}`,
            recommendationId: rec.id,
            findingId: rec.findingId,
            horizon: h,
            phaseIndex: phaseIndex+1,
            requirement: t.requirement,
            titleMn: rec.titleMn,
            milestoneMn: specificMilestoneText(rec, t.milestoneTemplate),
            deliverableMn: t.deliverable,
            kpiMn: t.kpi,
            ownerRoleId: rec.ownerRoleId,
            priorityBand: rec.priorityBand,
            recommendationPriority: rec.priority,
            scheduleScore,
            sourceTraceIds: [...rec.sourceTraceIds, `milestone:MS-${rec.id}-${phaseIndex+1}`],
            status: "NOT_STARTED"
          });
        });
      } else {
        milestones.push({
          id: `MS-${rec.id}-1`, recommendationId: rec.id, findingId: rec.findingId,
          horizon: start, phaseIndex: 1, requirement: "Required", titleMn: rec.titleMn,
          milestoneMn: rec.actionMn || rec.objectiveMn || rec.titleMn,
          deliverableMn: rec.deliverableMn || `${rec.titleMn} хэрэгжсэн үр дүн`,
          kpiMn: rec.kpiMn || `${rec.titleMn} хэрэгжилтийн түвшин`,
          ownerRoleId: rec.ownerRoleId, priorityBand: rec.priorityBand,
          recommendationPriority: rec.priority, scheduleScore,
          sourceTraceIds: [...rec.sourceTraceIds, `milestone:MS-${rec.id}-1`], status: "NOT_STARTED"
        });
      }
    } else {
      const t = genericMilestoneText(rec.type);
      milestones.push({
        id: `MS-${rec.id}-1`, recommendationId: rec.id, findingId: rec.findingId,
        horizon: start, phaseIndex: 1, requirement: "Required", titleMn: rec.titleMn,
        milestoneMn: rec.actionMn || t.milestone, deliverableMn: rec.deliverableMn || t.deliverable, kpiMn: rec.kpiMn || t.kpi,
        ownerRoleId: rec.ownerRoleId, priorityBand: rec.priorityBand,
        recommendationPriority: rec.priority, scheduleScore,
        sourceTraceIds: [...rec.sourceTraceIds, `milestone:MS-${rec.id}-1`], status: "NOT_STARTED"
      });
    }
  }

  milestones.sort((a,b) => {
    const ai = a.horizon === "DEFERRED_BEYOND_V1" ? 99 : horizonIndex(a.horizon);
    const bi = b.horizon === "DEFERRED_BEYOND_V1" ? 99 : horizonIndex(b.horizon);
    return ai-bi || b.scheduleScore-a.scheduleScore || a.id.localeCompare(b.id);
  });

  const plan: ActionPlan = {
    version: contract.version,
    capacityLevel: recommendations.capacityLevel,
    windowDays: 365,
    horizons: contract.planWindow.horizons,
    includedRecommendationIds: selected.map(x => x.id),
    dependencies,
    milestones,
    remeasurementHorizons: (contract.remeasurement ?? ["H2","H3","H4"]) as HorizonId[]
  };
  assertActionPlanIntegrity(methodology, recommendations, plan);
  return plan;
}

export function calculatePlanProgress(plan: ActionPlan, nowHorizon: HorizonId): PlanProgress {
  const required = plan.milestones.filter(m => m.requirement === "Required" && m.horizon !== "DEFERRED_BEYOND_V1");
  const byRec = new Map<string, PlanMilestone[]>();
  for (const m of required) (byRec.get(m.recommendationId) ?? byRec.set(m.recommendationId, []).get(m.recommendationId)!).push(m);
  const actionProgress: Record<string, number> = {};
  for (const [id, ms] of byRec) actionProgress[id] = ms.length ? ms.filter(x => x.status === "DONE").length / ms.length : 0;

  const denominator = required.reduce((s,m) => s + m.recommendationPriority/100, 0);
  const numerator = required.filter(m => m.status === "DONE").reduce((s,m) => s + m.recommendationPriority/100, 0);
  const planProgress = denominator ? numerator/denominator : 0;
  const currentIndex = horizonIndex(nowHorizon);
  const critical = required.filter(m => m.priorityBand === "P1" || m.priorityBand === "P2");
  const blockedCriticalMilestones = critical.filter(m => m.status === "BLOCKED").map(m => m.id);
  const skippedCriticalMilestones = critical.filter(m => m.status === "SKIPPED").map(m => m.id);
  const overdueCriticalMilestones = critical.filter(m => m.horizon !== "DEFERRED_BEYOND_V1" && horizonIndex(m.horizon) < currentIndex && !["DONE","SKIPPED"].includes(m.status)).map(m => m.id);
  const bad = new Set([...blockedCriticalMilestones, ...skippedCriticalMilestones, ...overdueCriticalMilestones]);
  const health = bad.size >= 2 ? "OFF_TRACK" : bad.size === 1 ? "AT_RISK" : "ON_TRACK";
  return { actionProgress, planProgress, health, overdueCriticalMilestones, blockedCriticalMilestones, skippedCriticalMilestones };
}
