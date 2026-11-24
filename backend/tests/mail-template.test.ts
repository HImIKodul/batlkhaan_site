import { describe, expect, it } from "vitest";
import { renderMailHtml } from "../src/api/mail/mail-template.js";
import { buildRawMessage } from "../src/api/mail/gmail-client.js";
import { buildCustomerMail } from "../src/api/mail/lifecycle-mail.js";
const decode = (raw: string) => Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
describe("transactional mail HTML", () => {
  it("shows a verification code, but never in the inbox preview line", () => {
    const h = renderMailHtml({ kind: "EMAIL_VERIFICATION", subject: "Код", text: "Сайн байна уу.\n\nТаны бүртгэлийг баталгаажуулах код:\n\n123456\n\nКод 15 минут ажиллана." });
    expect(h).toContain(">123456</p>"); expect(h.slice(0, h.indexOf("<table"))).not.toContain("123456");
  });
  it("turns the reset link into one https button and keeps the visible address", () => {
    const url = "https://businessmri.mn/#/reset-password?token=abc_-1";
    const h = renderMailHtml({ kind: "PASSWORD_RESET", subject: "x", text: `Сэргээх холбоос дээр дарна уу:\n\n${url}\n\nХолбоос 30 минут.` });
    expect(h.match(/href="/g)!.length).toBe(1); expect(h).toContain(`href="${url}"`); expect(h).toContain("Шинэ нууц үг тохируулах");
  });
  it("escapes customer text and never makes a script link", () => {
    const m = buildCustomerMail("PAYMENT_CONFIRMED", { company: "<script>alert(1)</script>\"&", domainLabel: "Санхүү", appUrl: "https://businessmri.mn" })!;
    const h = renderMailHtml(m);
    expect(h).not.toMatch(/<script|javascript:|<img/i); expect(h).toContain("&lt;script&gt;"); expect(h).toContain("https://businessmri.mn/#/analysis");
    expect(renderMailHtml({ kind: "x", subject: "x", text: "javascript:alert(1)" })).not.toContain("href");
  });
  it("gmail message is multipart/alternative with the text first; support replies stay plain text", () => {
    const multi = decode(buildRawMessage({ from: "support@businessmri.mn", to: "a@example.com", subject: "Сайн", text: "текст", html: "<p>x</p>" }));
    expect(multi).toContain("multipart/alternative"); expect(multi.indexOf("text/plain")).toBeLessThan(multi.indexOf("text/html")); expect(multi).toContain("Auto-Submitted: auto-generated");
    const b = /boundary="([^"]+)"/.exec(multi)![1]; expect(multi.trimEnd().endsWith(`--${b}--`)).toBe(true);
    expect(decode(buildRawMessage({ from: "support@businessmri.mn", to: "a@example.com", subject: "x", text: "текст" }))).not.toContain("multipart");
  });
});
