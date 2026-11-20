/**
 * PHASE 2.5 — PROPOSED capability-specific findings / priority cards (policy B4).
 *
 * ISOLATED: nothing imports this file; report generation is unchanged. It consumes only data that the results payload
 * and the per-domain recommendation contract (`categoryObjectives`, `roles`) already contain, and invents no company facts.
 * Text templates are Mongolian drafts that need editorial review before any activation.
 */

export interface CapabilityResult {
  id: string;
  nameMn: string;
  weightPct: number;
  /** null when no scored evidence exists. */
  score: number | null;
  applicableCellCount: number;
  finalizedCellCount: number;
  confirmedNotApplicable: boolean;
  hardContradiction?: boolean;
}

export interface CategoryObjective { defaultOwner: string; sponsor: string; objective: string }
export interface RoleLabel { id: string; label: string }

export interface CardPolicy {
  /** existing contract value: rootCauses.weaknessThreshold */
  weaknessMax: number;
  strengthMin: number;
  /** a capability needs at least this many scored cells before its score may be called a verified strength/weakness. */
  minScoredCells: number;
  targetGain: number;
  /** Phase 2.7: how many more directly-answered indicators an evidence-gathering card asks for. Configurable proposal parameter, NOT a frozen methodology value. */
  evidenceTargetIncrease: number;
}
export const DEFAULT_CARD_POLICY: CardPolicy = { weaknessMax: 60, strengthMin: 75, minScoredCells: 1, targetGain: 25, evidenceTargetIncrease: 3 };

export type FindingKind = "VERIFIED_WEAKNESS" | "EVIDENCE_REQUIRED" | "CONTESTED" | "SUSTAIN";

export interface PriorityCard {
  kind: FindingKind;
  capabilityId: string;
  capabilityNameMn: string;
  findingMn: string;
  reasonMn: string;
  actionMn: string;
  ownerRoleId: string;
  ownerLabelMn: string;
  sponsorRoleId: string;
  /** resolved from the permitted role list (authority contract roles + domain contract roles); empty only if the role is undefined there */
  sponsorLabelMn: string;
  kpiMn: string;
  horizon: "H0" | "H1" | "H2" | "H3" | "H4";
  sourceTraceIds: string[];
}

export interface FindingSet {
  strengths: Array<{ capabilityId: string; nameMn: string; score: number; scoredCells: number }>;
  verifiedWeaknesses: Array<{ capabilityId: string; nameMn: string; score: number; scoredCells: number }>;
  priorities: PriorityCard[];
  excluded: Array<{ capabilityId: string; nameMn: string; weightPct: number }>;
  excludedWeightPct: number;
  /** Explicit statements replacing silent padding of the 5/5 contract. */
  notices: string[];
}

const HORIZONS: PriorityCard["horizon"][] = ["H0", "H1", "H2", "H3", "H4"];
/** Phase 2.7 horizon proposal: contested evidence is settled first, evidence gathering next, verified weaknesses by severity rank, maintenance last. */
function horizonFor(kind: FindingKind, rankWithinKind: number): PriorityCard["horizon"] {
  if (kind === "CONTESTED") return "H0";
  if (kind === "EVIDENCE_REQUIRED") return "H1";
  if (kind === "VERIFIED_WEAKNESS") return HORIZONS[Math.min(4, 1 + Math.floor(rankWithinKind / 2))] ?? "H2";
  return "H4";
}
const r0 = (v: number) => Math.round(v);

export function buildFindingSet(
  caps: CapabilityResult[],
  objectives: Record<string, CategoryObjective>,
  roles: RoleLabel[],
  policy: CardPolicy = DEFAULT_CARD_POLICY
): FindingSet {
  const roleOrEmpty = (id: string) => roles.find(r => r.id === id)?.label ?? "";
  const notices: string[] = [];
  const excluded = caps.filter(c => c.confirmedNotApplicable);
  const live = caps.filter(c => !c.confirmedNotApplicable);
  const excludedWeightPct = excluded.reduce((s, c) => s + c.weightPct, 0);
  if (excluded.length) notices.push(`${excluded.length} чадавхи (жингийн ${excludedWeightPct.toFixed(1)}%) «хамаарахгүй» гэж тооцогдсон тул оноонд ороогүй. Эдгээрт арга хэмжээ санал болгоогүй.`);

  const scoredCells = (c: CapabilityResult) => c.finalizedCellCount;
  const evidenced = live.filter(c => c.score !== null && scoredCells(c) >= policy.minScoredCells && !c.hardContradiction);
  const strengths = evidenced.filter(c => (c.score as number) >= policy.strengthMin)
    .sort((a, b) => (b.score as number) - (a.score as number) || b.weightPct - a.weightPct || a.id.localeCompare(b.id))
    .slice(0, 5).map(c => ({ capabilityId: c.id, nameMn: c.nameMn, score: c.score as number, scoredCells: scoredCells(c) }));
  const weakAll = evidenced.filter(c => (c.score as number) <= policy.weaknessMax)
    .sort((a, b) => (a.score as number) - (b.score as number) || b.weightPct - a.weightPct || a.id.localeCompare(b.id));
  const verifiedWeaknesses = weakAll.slice(0, 5).map(c => ({ capabilityId: c.id, nameMn: c.nameMn, score: c.score as number, scoredCells: scoredCells(c) }));

  if (strengths.length < 5) notices.push(strengths.length === 0 ? "Баталгаажсан давуу тал илрээгүй." : `Баталгаажсан давуу тал ${strengths.length} байна (5 хүртэл дүүргэхийн тулд дутуу оноог давуу тал гэж харуулаагүй).`);
  if (verifiedWeaknesses.length === 0) notices.push("Хангалттай нотолгоотой, мэдэгдэхүйц сул тал илрээгүй.");
  else if (verifiedWeaknesses.length < 5) notices.push(`Баталгаажсан сул тал ${verifiedWeaknesses.length} байна (өндөр оноотой чадавхийг сул тал гэж харуулаагүй).`);

  const cards: PriorityCard[] = [];
  const mk = (kind: FindingKind, c: CapabilityResult, findingMn: string, reasonMn: string, actionMn: string, kpiMn: string): PriorityCard => {
    const o = objectives[c.id];
    const rank = cards.filter(x => x.kind === kind).length;
    return {
      kind, capabilityId: c.id, capabilityNameMn: c.nameMn, findingMn, reasonMn, actionMn,
      ownerRoleId: o?.defaultOwner ?? "", ownerLabelMn: o ? roleOrEmpty(o.defaultOwner) : "", sponsorRoleId: o?.sponsor ?? "", sponsorLabelMn: o ? roleOrEmpty(o.sponsor) : "", kpiMn,
      horizon: horizonFor(kind, rank),
      sourceTraceIds: [`category:${c.id}`, `capability-card:${c.id}:${kind}`]
    };
  };

  for (const c of verifiedWeaknesses.map(w => live.find(x => x.id === w.capabilityId)!)) {
    const o = objectives[c.id];
    if (!o) continue; // no contract objective => never invent one
    const target = Math.min(100, r0((c.score as number) + policy.targetGain));
    cards.push(mk("VERIFIED_WEAKNESS", c,
      `«${c.nameMn}» чадавхийн оноо ${r0(c.score as number)}/100 (${scoredCells(c)} бодитоор үнэлэгдсэн үзүүлэлт).`,
      `Оноо нь сул талын босго (${policy.weaknessMax})-оос доогуур бөгөөд нийт жингийн ${c.weightPct.toFixed(1)}%-ийг эзэлнэ.`,
      `Зорилт: ${o.objective}`,
      `Дахин хэмжилтээр «${c.nameMn}» оноо ${r0(c.score as number)}-аас ${target} хүртэл өсөх.`));
  }

  const contested = live.filter(c => c.hardContradiction);
  for (const c of contested) {
    if (cards.length >= 5) break;
    const o = objectives[c.id]; if (!o) continue;
    cards.push(mk("CONTESTED", c,
      `«${c.nameMn}» чадавхийн хариултууд хоорондоо зөрчилдсөн тул оноо баталгаажаагүй.`,
      "Нэг үзүүлэлтэд эрс ялгаатай хариулт өгсөн (≥50 нэгж зөрүү).",
      "Зөрчилдсөн хариултыг бодит бүртгэл, баримтаар шалгаж, аль нь үнэн болохыг тогтоох.",
      "Зөрчилтэй үзүүлэлтийн тоо 0 болох."));
  }

  if (cards.length < 5) {
    // Evidence-required cards are a DIFFERENT, clearly labelled kind and only for applicable, under-evidenced capabilities.
    const needEv = live.filter(c => (c.score === null || scoredCells(c) < policy.minScoredCells) && !c.hardContradiction)
      .sort((a, b) => b.weightPct - a.weightPct || a.id.localeCompare(b.id));
    for (const c of needEv) {
      if (cards.length >= 5) break;
      const o = objectives[c.id]; if (!o) continue;
      cards.push(mk("EVIDENCE_REQUIRED", c,
        `«${c.nameMn}» чадавхийн талаар оноо тооцоход хангалттай нотолгоо алга (баталгаажсан сул тал биш).`,
        "Нотолгоо дутуу тул дүгнэлт хийхгүй.",
        `Дараах зорилтын хэрэгжилтийг бодит бүртгэлээр шалгах: ${o.objective}`,
        `Дараагийн оношилгоонд «${c.nameMn}» чадавхийн шууд хариулттай үзүүлэлтийн тоо ${c.finalizedCellCount}-аас ${c.finalizedCellCount + policy.evidenceTargetIncrease} болох.`));
    }
  }

  if (cards.length < 5 && verifiedWeaknesses.length === 0) {
    const sustain = evidenced.slice().sort((a, b) => (a.score as number) - (b.score as number) || a.id.localeCompare(b.id));
    for (const c of sustain) {
      if (cards.length >= 5) break;
      const o = objectives[c.id]; if (!o) continue;
      cards.push(mk("SUSTAIN", c,
        `«${c.nameMn}» чадавхийн оноо ${r0(c.score as number)}/100 — сул тал биш, харин дотроо хамгийн доод түвшний чадавхийн нэг.`,
        "Мэдэгдэхүйц сул тал байхгүй тул хамгийн бага оноотой чадавхийг тогтвортой хадгалах хэрэгтэй.",
        `Хэвийн түвшинг хадгалах: ${o.objective}`,
        `Дахин хэмжилтээр «${c.nameMn}» оноо ${r0(c.score as number)}-аас буурахгүй байх.`));
    }
  }
  if (cards.length < 5) notices.push(`Тэргүүлэх чиглэл ${cards.length} байна: хангалттай нотолгоотой, нэр хүндтэй дүгнэлт хийх боломжтой чадавх энэ тооноос олон байсангүй.`);

  return {
    strengths, verifiedWeaknesses, priorities: cards,
    excluded: excluded.map(c => ({ capabilityId: c.id, nameMn: c.nameMn, weightPct: c.weightPct })),
    excludedWeightPct, notices
  };
}
