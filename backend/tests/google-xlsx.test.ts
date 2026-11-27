import { generateKeyPairSync, createSign } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { GoogleTokenVerifier } from "../src/api/auth/google-token.js";
import { buildXlsx } from "../src/api/account/xlsx.js";
import { companyWorkbook } from "../src/api/account/export-workbook.js";

const CLIENT = "test-client-id.apps.googleusercontent.com";
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...(publicKey.export({ format: "jwk" }) as any), kid: "k1", alg: "RS256", use: "sig" };
const b64 = (o: unknown) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
function token(payload: Record<string, unknown>, opts: { key?: any; kid?: string; alg?: string } = {}) {
  const h = b64({ alg: opts.alg ?? "RS256", kid: opts.kid ?? "k1", typ: "JWT" }), p = b64(payload);
  const sig = createSign("RSA-SHA256").update(`${h}.${p}`).sign(opts.key ?? privateKey).toString("base64url");
  return `${h}.${p}.${sig}`;
}
const NOW = 1_800_000_000_000;
const good = { iss: "https://accounts.google.com", aud: CLIENT, sub: "1234567890", email: "Person@Example.com", email_verified: true, name: "Test Person", iat: NOW / 1000 - 10, exp: NOW / 1000 + 3000 };
const verifier = (id = CLIENT) => new GoogleTokenVerifier(id, async () => ({ keys: [jwk], maxAgeSeconds: 3600 }), () => NOW);

describe("Google ID-token verification", () => {
  it("accepts a valid token and normalises the e-mail", async () => {
    const c = await verifier().verify(token(good));
    expect(c).toMatchObject({ subject: "1234567890", email: "person@example.com", emailVerified: true });
  });
  it("reports an unverified Google e-mail instead of trusting it", async () => {
    expect((await verifier().verify(token({ ...good, email_verified: false }))).emailVerified).toBe(false);
  });
  it.each([
    ["wrong audience", { ...good, aud: "someone-else" }],
    ["wrong issuer", { ...good, iss: "https://evil.example" }],
    ["expired", { ...good, exp: NOW / 1000 - 600 }],
    ["missing subject", { ...good, sub: "" }],
    ["no e-mail", { ...good, email: undefined }]
  ])("rejects %s", async (_n, payload) => { await expect(verifier().verify(token(payload as any))).rejects.toMatchObject({ code: "GOOGLE_TOKEN_INVALID" }); });
  it("rejects a token signed by a different key, an unknown key id, alg none and garbage", async () => {
    await expect(verifier().verify(token(good, { key: other.privateKey }))).rejects.toMatchObject({ code: "GOOGLE_TOKEN_INVALID" });
    await expect(verifier().verify(token(good, { kid: "nope" }))).rejects.toMatchObject({ code: "GOOGLE_TOKEN_INVALID" });
    await expect(verifier().verify(`${b64({ alg: "none", kid: "k1" })}.${b64(good)}.`)).rejects.toMatchObject({ code: "GOOGLE_TOKEN_INVALID" });
    await expect(verifier().verify("not-a-token")).rejects.toMatchObject({ code: "GOOGLE_TOKEN_INVALID" });
    await expect(verifier().verify(undefined)).rejects.toMatchObject({ code: "GOOGLE_TOKEN_INVALID" });
  });
  it("is disabled without a client id", async () => {
    expect(verifier("").enabled).toBe(false);
    await expect(verifier("").verify(token(good))).rejects.toMatchObject({ code: "GOOGLE_SIGNIN_DISABLED" });
  });
});

function entries(buf: Buffer) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(eocd + 10); let off = buf.readUInt32LE(eocd + 16); const out: Record<string, string> = {};
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(off + 10), csize = buf.readUInt32LE(off + 20), nlen = buf.readUInt16LE(off + 28), elen = buf.readUInt16LE(off + 30), clen = buf.readUInt16LE(off + 32), lho = buf.readUInt32LE(off + 42);
    const name = buf.subarray(off + 46, off + 46 + nlen).toString("utf8");
    const lnlen = buf.readUInt16LE(lho + 26), lelen = buf.readUInt16LE(lho + 28), data = buf.subarray(lho + 30 + lnlen + lelen, lho + 30 + lnlen + lelen + csize);
    out[name] = (method === 8 ? inflateRawSync(data) : data).toString("utf8"); off += 46 + nlen + elen + clen;
  }
  return out;
}

describe("Excel export", () => {
  it("writes a well-formed workbook with Mongolian sheet names and exact text, numbers and dates", () => {
    const book = buildXlsx([{ name: "Бүртгэл/1", columns: [{ header: "Нэр", width: 20 }, { header: "Дүн", width: 10 }, { header: "Огноо", width: 18 }], rows: [["Өрнөх & Маркет <ХХК>", 300000, new Date("2026-11-27T09:30:00Z")]] }]);
    const e = entries(book);
    expect(Object.keys(e)).toEqual(expect.arrayContaining(["[Content_Types].xml", "xl/workbook.xml", "xl/styles.xml", "xl/worksheets/sheet1.xml"]));
    expect(e["xl/workbook.xml"]).toContain('name="Бүртгэл 1"');
    expect(e["xl/worksheets/sheet1.xml"]).toContain("Өрнөх &amp; Маркет &lt;ХХК&gt;");
    expect(e["xl/worksheets/sheet1.xml"]).toContain("<v>300000</v>");
    expect(e["xl/worksheets/sheet1.xml"]).toMatch(/<c r="C2" s="2"><v>46\d{3}\.\d+<\/v>/);
  });
  it("never includes secret-looking fields that the source export does not carry", () => {
    const book = companyWorkbook({ account: { email: "a@b.mn", createdAt: new Date() } }, { exportedAt: new Date(), company: { name: "Тест ХХК" }, assessments: [{ id: "a1", domainCode: "finance", status: "COMPLETED", answers: [{ questionId: "q1", optionIndex: 2, status: "ANSWERED", createdAt: new Date() }] }], payments: [], entitlements: [], members: [] });
    const all = Object.values(entries(book)).join("\n");
    expect(all).toContain("Санхүү"); expect(all).toContain("Тест ХХК"); expect(all).not.toMatch(/passwordHash|tokenHash/i);
  });
});
