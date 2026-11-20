import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OpenAiNarrativeProvider } from "../src/report/openai-narrative-provider.js";
import { generateValidatedNarrative } from "../src/report/coordinator.js";
import { deterministicFallbackNarrative } from "../src/report/fallback-renderer.js";
import { validateNarrativeDraft } from "../src/report/validator.js";
import { createNarrativeProviderFromEnv } from "../src/api/ai-report-provider.js";

/** The real OpenAiNarrativeProvider against a loopback server that speaks the Responses-API protocol (NOT the real provider: this proves the adapter,
    retry classification, secret hygiene and the validation/fallback boundary; it says nothing about the quality of real model output). */
const fx = (n: string) => JSON.parse(fs.readFileSync(path.resolve(__dirname, "fixtures/phase027", n + ".payload.json"), "utf8"));
// Fake key assembled at runtime so no key-shaped literal sits in source (the repository secret scanner is pattern based).
const SECRET = ["sk", "test", "SECRET", "should", "never", "appear", "anywhere", "1234567890"].join("-");
type Step = { status: number; body: any; headers?: Record<string, string> };
let queue: Step[] = []; const seen: { auth: string | undefined; body: any }[] = [];
let server: http.Server, endpoint = "";
const reply = (steps: Step[]) => { queue = [...steps]; seen.length = 0; };

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = ""; req.on("data", d => raw += d); req.on("end", () => {
      seen.push({ auth: req.headers.authorization, body: JSON.parse(raw || "{}") });
      const step = queue.shift() ?? { status: 500, body: { error: { message: "no scripted response" } } };
      res.writeHead(step.status, { "content-type": "application/json", "x-request-id": "req_test_" + seen.length, ...(step.headers ?? {}) }); res.end(JSON.stringify(step.body));
    });
  });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r)); endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/responses`;
});
afterAll(() => new Promise<void>(r => server.close(() => r())));

const provider = () => new OpenAiNarrativeProvider({ apiKey: SECRET, model: "test-model", endpoint, timeoutMs: 5000, maxRetries: 2, retryBaseDelayMs: 100, retryMaxDelayMs: 200, totalTimeoutMs: 20000, maxOutputTokens: 4000 });
const ok = (narr: any, usage = { input_tokens: 1234, output_tokens: 567 }) => ({ status: 200, body: { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(narr) }] }], usage } });

describe("OpenAI Responses adapter protocol", () => {
  const f = fx("finance_weak");
  const good = () => { const n = deterministicFallbackNarrative(f.payload); return { schemaVersion: n.schemaVersion, payloadHash: n.payloadHash, sections: n.sections }; };

  it("sends a strict json_schema request with store:false and the bearer key; reports usage; the validated narrative is bound to the frozen payload", async () => {
    reply([ok(good())]);
    const r = await generateValidatedNarrative(f.payload, provider());
    expect(r.state).toBe("PASS"); expect(r.providerAttempts).toBe(1); expect(r.narrative.payloadHash).toBe(f.payload.payloadHash);
    const sent = seen[0]; expect(sent.auth).toBe(`Bearer ${SECRET}`);
    expect(sent.body.store).toBe(false); expect(sent.body.text.format).toMatchObject({ type: "json_schema", strict: true }); expect(sent.body.max_output_tokens).toBe(4000);
    expect(validateNarrativeDraft(f.payload, r.narrative).state).toBe("PASS");
    const direct = await (async () => { reply([ok(good())]); return provider().generate(f.payload); })();
    expect((direct as any).telemetry.usage).toEqual({ inputTokens: 1234, outputTokens: 567 });
  });
  it("credit_balance_exhausted (the exact response the real account returns today) is NOT retried; the deterministic fallback is used; the secret is not echoed", async () => {
    reply([{ status: 429, body: { error: { code: "credit_balance_exhausted", type: "insufficient_quota", message: `You have no credits remaining. key ${SECRET}` } } }]);
    const r = await generateValidatedNarrative(f.payload, provider());
    expect(r.state).toBe("AI_FALLBACK_USED"); expect(seen).toHaveLength(1); expect(r.providerHttpAttempts).toBe(1);
    expect(r.providerError).toContain("credit_balance_exhausted"); expect(JSON.stringify(r)).not.toContain(SECRET);
    expect(validateNarrativeDraft(f.payload, r.narrative).state).toBe("PASS");
  });
  it("a transient 429 slow_down and a 503 are retried (bounded) and then succeed", async () => {
    reply([{ status: 429, body: { error: { code: "slow_down", message: "slow" } } }, { status: 503, body: { error: { message: "busy" } } }, ok(good())]);
    const r = await generateValidatedNarrative(f.payload, provider());
    expect(r.state).toBe("PASS"); expect(r.providerHttpAttempts).toBe(3); expect(r.providerRetryCount).toBe(2); expect(r.providerRequestIds.length).toBeGreaterThan(1);
  });
  it("retries stop at the configured limit and fall back (no unbounded loop)", async () => {
    reply([1, 2, 3, 4, 5].map(() => ({ status: 503, body: { error: { message: "down" } } })));
    const r = await generateValidatedNarrative(f.payload, provider());
    expect(r.state).toBe("AI_FALLBACK_USED"); expect(seen.length).toBe(3); // 1 attempt + 2 retries
  });
  it("malformed JSON, an incomplete response and a wrong schema never reach the customer: fallback + PASS", async () => {
    for (const step of [
      { status: 200, body: { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "{not json" }] }] } },
      { status: 200, body: { status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [] } },
      ok({ schemaVersion: "WRONG", payloadHash: "x", sections: [] })
    ] as Step[]) {
      reply([step, ...(step === undefined ? [] : [])]);
      const r = await generateValidatedNarrative(f.payload, provider());
      expect(r.state).toBe("AI_FALLBACK_USED"); expect(validateNarrativeDraft(f.payload, r.narrative).state).toBe("PASS");
    }
  });
  const shortConclusion = () => { const n = good(); n.sections = JSON.parse(JSON.stringify(n.sections)); const s10 = n.sections.find((x: any) => x.id === "S10")!; s10.claims[0].textMn = "Тайлан бэлэн боллоо."; return n; };
  it("an ungrounded number is a hard BLOCK: no repair round-trip is spent, the deterministic narrative is used, the invented figure never reaches the output", async () => {
    const bad = good(); bad.sections = JSON.parse(JSON.stringify(bad.sections)); bad.sections[0].claims[0].textMn += " Өсөлт 987654 хувь болно.";
    reply([ok(bad), ok(good())]);
    const r = await generateValidatedNarrative(f.payload, provider());
    expect(r.state).toBe("AI_FALLBACK_USED"); expect(seen).toHaveLength(1); expect(r.providerError).toMatch(/V02/);
    expect(JSON.stringify(r.narrative)).not.toContain("987654"); expect(validateNarrativeDraft(f.payload, r.narrative).state).toBe("PASS");
  });
  it("a repairable defect (executive conclusion outside 80-160 words, V27) triggers exactly one repair call carrying the validation findings, and the clean repair passes", async () => {
    reply([ok(shortConclusion()), ok(good())]);
    const r = await generateValidatedNarrative(f.payload, provider());
    expect(r.state).toBe("PASS"); expect(r.providerAttempts).toBe(2); expect(seen).toHaveLength(2);
    expect(JSON.stringify(seen[1].body.input)).toContain("V27");
    expect(validateNarrativeDraft(f.payload, r.narrative).state).toBe("PASS");
  });
  it("if the repair is still defective the deterministic narrative is used (no third attempt); the frozen score and payload are never altered", async () => {
    const before = JSON.stringify(f.payload);
    reply([ok(shortConclusion()), ok(shortConclusion()), ok(good())]);
    const r = await generateValidatedNarrative(f.payload, provider());
    expect(r.state).toBe("AI_FALLBACK_USED"); expect(r.providerError).toMatch(/V27/); expect(seen).toHaveLength(2);
    expect(JSON.stringify(f.payload)).toBe(before);
  });
  it("a payload whose hash does not match its content is refused at the AI boundary before any request is made (fail closed)", async () => {
    reply([ok(good())]);
    const tampered = JSON.parse(JSON.stringify(f.payload)); tampered.overall.score = 99;
    await expect(generateValidatedNarrative(tampered, provider())).rejects.toThrow(/hash verification failed/);
    expect(seen).toHaveLength(0);
  });
});

describe("provider configuration", () => {
  it("production refuses placeholders and any endpoint other than the official OpenAI Responses URL; disabled/absent configuration returns no provider", () => {
    const save = { ...process.env };
    try {
      process.env.MMRI_AI_REPORT_PROVIDER = "openai"; process.env.OPENAI_API_KEY = ["sk", "real", "looking", "key", "abcdefghijklmnop"].join("-"); process.env.MMRI_AI_REPORT_MODEL = "m";
      process.env.MMRI_AI_REPORT_ENDPOINT = "https://evil.example/v1/responses"; expect(() => createNarrativeProviderFromEnv("production")).toThrow(/api\.openai\.com/);
      process.env.MMRI_AI_REPORT_ENDPOINT = "http://api.openai.com/v1/responses"; expect(() => createNarrativeProviderFromEnv("production")).toThrow(/HTTPS/);
      process.env.MMRI_AI_REPORT_ENDPOINT = "https://api.openai.com/v1/responses"; process.env.OPENAI_API_KEY = "replace-me"; expect(() => createNarrativeProviderFromEnv("production")).toThrow(/placeholder/);
      process.env.MMRI_AI_REPORT_PROVIDER = "disabled"; process.env.MMRI_AI_REPORT_REQUIRED = "false"; expect(createNarrativeProviderFromEnv("production")).toBeUndefined();
      process.env.MMRI_AI_REPORT_REQUIRED = "true"; expect(() => createNarrativeProviderFromEnv("production")).toThrow(/required but disabled/);
    } finally { for (const k of Object.keys(process.env)) if (!(k in save)) delete process.env[k]; Object.assign(process.env, save); }
  });
});
