/* Pure test of the login-page fact deck: usage (from backend/): npx tsx ../frontend/scripts/test-fact-deck.mts */
import { businessFacts, FACT_IDS, advance, newCycle, shuffle, type DeckState } from "../src/data/factDeck.ts";
let fail = 0; const ok = (n: string, c: unknown, d: unknown = "") => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"} ${n}${c ? "" : " " + JSON.stringify(d).slice(0, 200)}`); };
ok("all 100 facts are loaded, unique ids and non-empty text", businessFacts.length === 100 && new Set(FACT_IDS).size === 100 && businessFacts.every(f => typeof f.text === "string" && f.text.trim().length > 10));
ok("the data carries no source/date field that could be shown", businessFacts.every(f => Object.keys(f).every(k => ["id", "category", "text"].includes(k))));
let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
let st: DeckState | null = null; const seq: number[] = []; for (let i = 0; i < 100 * 25; i++) { st = advance(st, FACT_IDS, rnd); seq.push(st.current!); }
let cyclesOk = true, boundaryOk = true; for (let c = 0; c < 25; c++) { const block = seq.slice(c * 100, c * 100 + 100); if (new Set(block).size !== 100 || block.some(x => !FACT_IDS.includes(x))) cyclesOk = false; if (c > 0 && seq[c * 100] === seq[c * 100 - 1]) boundaryOk = false; }
ok("25 consecutive cycles each contain exactly 100 unique facts (every fact once before any repeat)", cyclesOk);
ok("the first fact of a new cycle never equals the last fact of the previous cycle", boundaryOk);
const refreshed = advance(JSON.parse(JSON.stringify({ queue: seq.slice(0, 0), current: seq[99] })), FACT_IDS, rnd); ok("after exactly 100 facts the next call starts a NEW shuffled cycle", refreshed.queue.length === 99 && refreshed.current !== seq[99]);
const mid = advance(advance(null, FACT_IDS, rnd), FACT_IDS, rnd); const restored = JSON.parse(JSON.stringify(mid)); ok("state survives serialisation (page refresh): the same fact is current and the queue continues", restored.current === mid.current && advance(restored, FACT_IDS, rnd).current === mid.queue[0]);
const broken = advance({ queue: [999, 998], current: 777 } as any, FACT_IDS, rnd); ok("corrupt stored state is repaired into a valid deck", FACT_IDS.includes(broken.current!) && broken.queue.every(x => FACT_IDS.includes(x)));
ok("different shuffles differ (it is random, not a fixed order)", JSON.stringify(shuffle(FACT_IDS, rnd)) !== JSON.stringify(shuffle(FACT_IDS, rnd)));
const same = newCycle([1, 2], 1, () => 0); ok("newCycle with a tiny deck still avoids the last fact", same[0] === 2, same);
console.log(fail ? `RESULT FAIL ${fail}` : "RESULT PASS"); process.exit(fail ? 1 : 0);
