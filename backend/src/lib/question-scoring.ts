export type ImportedOption = { score: number | null; state: string; scoringProfileCode: string };

const DNK = "Мэдэхгүй эсвэл баттай хариулж чадахгүй.";
const NA = "Хамаарахгүй.";

export function scoringForQuestion(cellId: string, options: string[]): ImportedOption[] {
  if (cellId === "C01") {
    if (options.length !== 5 || options.at(-1) !== DNK) throw new Error(`Unexpected C01 option set`);
    return [
      { score: null, state: "N_A_CLAIM", scoringProfileCode: "AT-APPLICABILITY-4" },
      { score: null, state: "PARTIAL_APPLICABILITY", scoringProfileCode: "AT-APPLICABILITY-4" },
      { score: null, state: "MOSTLY_APPLICABLE", scoringProfileCode: "AT-APPLICABILITY-4" },
      { score: null, state: "APPLICABLE", scoringProfileCode: "AT-APPLICABILITY-4" },
      { score: null, state: "DNK", scoringProfileCode: "AT-APPLICABILITY-4" }
    ];
  }

  if (cellId === "C02") {
    if (options.length !== 5 || options.at(-1) !== DNK) throw new Error(`Unexpected C02 option set`);
    const scores = [0, 33.3333, 66.6667, 100, null];
    return scores.map((score, i) => ({ score, state: i === 4 ? "DNK" : "SCORED", scoringProfileCode: "AT-IMPLEMENTATION-4" }));
  }

  if (cellId === "C42") {
    if (options.length !== 4 || options.at(-1) !== DNK) throw new Error(`Unexpected C42 option set`);
    const scores = [0, 50, 100, null];
    return scores.map((score, i) => ({ score, state: i === 3 ? "DNK" : "SCORED", scoringProfileCode: "AT-TREND3" }));
  }

  if (options.at(-1) !== DNK) throw new Error(`DNK must be final option for ${cellId}`);

  if (options.length === 6) {
    const profile = scoringProfileForSixOptionCell(cellId);
    const scores = [0, 25, 50, 75, 100, null];
    return scores.map((score, i) => ({ score, state: i === 5 ? "DNK" : "SCORED", scoringProfileCode: profile }));
  }

  if (options.length === 7) {
    const sixth = options[5];
    const profile = cellId === "C44" && sixth !== NA ? "AT-BENCHMARK-POSITION5-COND" : "AT-MAT5-COND";
    const sixthState = sixth === NA ? "N_A_CLAIM" : "UNAVAILABLE";
    const scores: Array<number | null> = [0, 25, 50, 75, 100, null, null];
    return scores.map((score, i) => ({
      score,
      state: i === 5 ? sixthState : i === 6 ? "DNK" : "SCORED",
      scoringProfileCode: profile
    }));
  }

  throw new Error(`Unsupported option count ${options.length} for ${cellId}`);
}

function scoringProfileForSixOptionCell(cellId: string): string {
  if (["C06", "C15"].includes(cellId)) return "AT-PCT5";
  if (["C12", "C17", "C40"].includes(cellId)) return "AT-FREQ-FIT5";
  if (cellId === "C18") return "AT-TIME5";
  if (cellId === "C41") return "AT-RESULT5";
  if (cellId === "C44") return "AT-BENCHMARK-QUALITY5";
  return "AT-MAT5";
}
