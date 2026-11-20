/* Unit tests for the Gmail adapter (no network, no credentials): a fake transport stands in for Google. Run: npx tsx scripts/gmail-adapter-unit.ts */
import { GmailApi, GmailError, buildRawMessage, parseGmailMessage, htmlToText, b64url } from "../src/api/mail/gmail-client.js";
import { GmailMailer } from "../src/api/mail/mailer.js";
let pass = 0, fail = 0;
const t = (name: string, ok: boolean, d = "") => { ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + name + (d ? " | " + d : "")); };
const creds = { clientId: "cid-SECRET-ID", clientSecret: "csecret-VALUE", refreshToken: "refresh-TOKEN-VALUE", user: "support@example.test" };
const dec = (raw: string) => Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
const mkFetch = (handler: (url: string, init: any) => { status: number; body?: any }) => (async (url: any, init: any) => { const r = handler(String(url), init); return new Response(JSON.stringify(r.body ?? {}), { status: r.status, headers: { "content-type": "application/json" } }); }) as unknown as typeof fetch;

// --- MIME builder
{
  const raw = dec(buildRawMessage({ from: "support@example.test", fromName: "BusinessMRI", to: "customer@example.test", subject: "Сайн байна уу", text: "Тайлан бэлэн боллоо.\nБаярлалаа", inReplyTo: "<abc@mail>" }));
  t("MIME: UTF-8 subject is RFC 2047 encoded", /Subject: =\?UTF-8\?B\?/.test(raw));
  t("MIME: body is base64 text/plain UTF-8 and decodes back", /Content-Type: text\/plain; charset=UTF-8/.test(raw) && Buffer.from(raw.split("\r\n\r\n")[1].replace(/\r\n/g, ""), "base64").toString("utf8").includes("Тайлан бэлэн боллоо."));
  t("MIME: In-Reply-To carried", /In-Reply-To: <abc@mail>/.test(raw));
  for (const [what, args] of [["CRLF in subject", { subject: "x\r\nBcc: evil@x.test" }], ["CRLF in reference", { inReplyTo: "<a>\r\nBcc: e@x.test" }], ["bad recipient", { to: "a@b.test, c@d.test" }], ["newline in recipient", { to: "a@b.test\nBcc: x@y.test" }]] as const) {
    let threw = false; try { buildRawMessage({ from: "s@example.test", to: "c@example.test", subject: "s", text: "t", ...(args as any) }); } catch (e) { threw = e instanceof GmailError && e.code === "BAD_INPUT"; }
    t(`header injection refused: ${what}`, threw);
  }
}
// --- parser
{
  const msg = parseGmailMessage({ id: "m1", threadId: "t1", internalDate: "1700000000000", labelIds: ["INBOX"], payload: { headers: [{ name: "From", value: "\"Бат\" <Bat@Example.TEST>" }, { name: "To", value: "support@example.test" }, { name: "Subject", value: "Асуулт" }, { name: "Message-ID", value: "<m1@mail>" }],
    mimeType: "multipart/mixed", parts: [{ mimeType: "text/html", body: { data: b64url(Buffer.from("<p>Сайн уу<script>alert(1)</script></p><style>x{}</style><b>тайлан</b>&amp;")) } }, { mimeType: "application/pdf", filename: "a.pdf", body: { attachmentId: "att1" } }] } });
  t("parser: sender address lower-cased, display name kept", msg.from === "bat@example.test" && msg.fromName === "Бат");
  t("parser: HTML becomes plain text; script/style removed; entities decoded", /Сайн уу/.test(msg.text) && !/<|script|alert|x\{\}/.test(msg.text) && msg.text.includes("&"), JSON.stringify(msg.text));
  t("parser: attachments counted, never stored", msg.attachments === 1);
  const plain = parseGmailMessage({ id: "m2", threadId: "t2", payload: { headers: [{ name: "From", value: "x@example.test" }], mimeType: "text/plain", body: { data: b64url(Buffer.from("A".repeat(50000))) } } });
  t("parser: body capped at 20000 characters", plain.text.length === 20000 && plain.subject === "(гарчиггүй)");
  t("htmlToText strips tags", htmlToText("<div>a<br>b</div>") === "a\nb");
}
// --- API: token refresh, caching, errors
{
  let tokenCalls = 0, sendCalls = 0; const seen: string[] = [];
  const f = mkFetch((url, init) => {
    seen.push(url);
    if (url.startsWith("https://oauth2.googleapis.com/token")) { tokenCalls++; return { status: 200, body: { access_token: "AT-1", expires_in: 3600 } }; }
    if (url.endsWith("/messages/send")) { sendCalls++; if (init.headers.authorization !== "Bearer AT-1") return { status: 401 }; return { status: 200, body: { id: "sent1", threadId: "t9" } }; }
    if (url.includes("/messages?")) return { status: 200, body: { messages: [{ id: "m100abc", threadId: "t1" }] } };
    return { status: 404 };
  });
  const api = new GmailApi(creds, f);
  const a = await api.send(buildRawMessage({ from: creds.user, to: "c@example.test", subject: "s", text: "t" }), "t9");
  await api.send(buildRawMessage({ from: creds.user, to: "c@example.test", subject: "s2", text: "t" }));
  t("send returns provider ids; access token fetched once and cached", a.id === "sent1" && tokenCalls === 1 && sendCalls === 2);
  t("only the two fixed Google hosts are contacted", seen.every(u => u.startsWith("https://oauth2.googleapis.com/") || u.startsWith("https://gmail.googleapis.com/gmail/v1/users/me/")));
  t("list returns ids", (await api.list("in:inbox", 5))[0].id === "m100abc");
  let bad = false; try { await api.get("../etc/passwd"); } catch (e) { bad = e instanceof GmailError && e.code === "BAD_INPUT"; }
  t("message id is validated before it reaches a URL", bad);
}
for (const reason of ["rateLimitExceeded", "userRateLimitExceeded"]) {
  const api = new GmailApi(creds, mkFetch(url => url.includes("oauth2") ? { status: 200, body: { access_token: "x", expires_in: 3600 } } : { status: 403, body: { error: { errors: [{ reason }] } } }));
  let e: any; try { await api.list("q"); } catch (x) { e = x; }
  t(`403 ${reason} is a quota burst (RATE_LIMIT), not a revoked authorisation`, e instanceof GmailError && e.code === "RATE_LIMIT");
}
{
  const api = new GmailApi(creds, mkFetch(url => url.includes("oauth2") ? { status: 200, body: { access_token: "x", expires_in: 3600 } } : { status: 403, body: { error: { errors: [{ reason: "insufficientPermissions" }] } } }));
  let e: any; try { await api.list("q"); } catch (x) { e = x; }
  t("403 insufficientPermissions stays AUTH", e instanceof GmailError && e.code === "AUTH");
}
for (const [status, code] of [[401, "AUTH"], [403, "AUTH"], [429, "RATE_LIMIT"], [500, "PROVIDER"]] as const) {
  const api = new GmailApi(creds, mkFetch(url => url.includes("oauth2") ? { status: 200, body: { access_token: "x", expires_in: 3600 } } : { status }));
  let e: any; try { await api.list("q"); } catch (x) { e = x; }
  t(`provider ${status} maps to ${code}`, e instanceof GmailError && e.code === code);
  t(`error text for ${status} contains no credential`, !/SECRET|TOKEN|csecret|refresh/i.test(String(e?.message)));
}
{
  const api = new GmailApi(creds, mkFetch(() => ({ status: 400, body: { error: "invalid_grant", error_description: "Token has been expired or revoked refresh-TOKEN-VALUE" } })));
  let e: any; try { await api.list("q"); } catch (x) { e = x; }
  t("revoked/expired refresh token -> AUTH with a re-connect message, no provider text echoed", e?.code === "AUTH" && !/refresh-TOKEN|invalid_grant/.test(e.message));
  const net = new GmailApi(creds, (async () => { throw new Error("ECONNRESET with refresh-TOKEN-VALUE"); }) as any);
  let n: any; try { await net.list("q"); } catch (x) { n = x; }
  t("network failure -> NETWORK without echoing the underlying error", n?.code === "NETWORK" && !/refresh-TOKEN|ECONNRESET/.test(n.message));
}
// --- mailer wrapper
{
  const sent: any[] = [];
  const f = mkFetch((url, init) => { if (url.includes("oauth2")) return { status: 200, body: { access_token: "AT", expires_in: 3600 } }; sent.push(JSON.parse(init.body)); return { status: 200, body: { id: "g1", threadId: "t" } }; });
  const m = new GmailMailer(new GmailApi(creds, f));
  const r = await m.send({ to: "customer@example.test", subject: "BusinessMRI.mn: тайлан бэлэн боллоо", text: "Сайн байна уу", kind: "REPORT_RELEASED" });
  t("GmailMailer: delivered=true means accepted by Gmail, provider gmail", r.delivered && r.provider === "gmail" && typeof sent[0].raw === "string");
  const bad = new GmailMailer(new GmailApi(creds, mkFetch(url => url.includes("oauth2") ? { status: 400 } : { status: 200 })));
  let msg = ""; try { await bad.send({ to: "c@example.test", subject: "s", text: "t", kind: "x" }); } catch (e: any) { msg = e.message; }
  t("GmailMailer failure is a fixed error without secrets", /Mail provider request failed/.test(msg) && !/SECRET|TOKEN/i.test(msg));
}
console.log(`\nRESULT pass=${pass} fail=${fail}`); process.exit(fail ? 1 : 0);
