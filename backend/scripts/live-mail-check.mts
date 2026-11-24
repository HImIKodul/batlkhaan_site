/* REAL e-mail test, only after the owner named the inboxes. Sends four clearly marked samples of the production templates to each inbox (at most two) through the configured Gmail account.
   usage: set -a; . ~/mmri-secrets/gmail-support.env; set +a; MMRI_LIVE_MAIL_APPROVED=YES MMRI_LIVE_MAIL_TO="a@gmail.com,b@example.com" npx tsx scripts/live-mail-check.mts
   No database, no customer data, no valid code or link. Registration, expiry and replay are then checked by hand on the preview (see ROLLOUT.md). */
import { createMailer } from "../src/api/mail/mailer.js"; import { buildCustomerMail } from "../src/api/mail/lifecycle-mail.js";
if (process.env.MMRI_LIVE_MAIL_APPROVED !== "YES") throw new Error("NOT APPROVED: no message sent"); if (process.env.DATABASE_URL) throw new Error("REFUSED: run without a database");
const to = (process.env.MMRI_LIVE_MAIL_TO ?? "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean); if (!to.length || to.length > 2 || !to.every(x => /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(x)) || !to.some(x => x.endsWith("@gmail.com"))) throw new Error("one or two addresses required, at least one @gmail.com");
const e = (k: string) => { const v = (process.env[k] ?? "").trim(); if (!v) throw new Error(k + " missing"); return v; };
const mailer = createMailer({ mailProvider: "gmail", mockMailDir: "/nonexistent", mailRequestTimeoutMs: 10_000, gmail: { clientId: e("GMAIL_CLIENT_ID"), clientSecret: e("GMAIL_CLIENT_SECRET"), refreshToken: e("GMAIL_REFRESH_TOKEN"), user: e("GMAIL_USER").toLowerCase() } });
const ctx = { company: "Жишээ ХХК", domainLabel: "Санхүү", appUrl: "https://businessmri.mn" };
const mails = [
  { kind: "EMAIL_VERIFICATION", subject: "ТУРШИЛТ: BusinessMRI.mn бүртгэлийн код", text: "Сайн байна уу.\n\nЭнэ бол имэйл хүргэлтийн туршилт. Доорх код ажиллахгүй.\n\n000000\n\nКодыг хэнд ч дамжуулж болохгүй." },
  { kind: "PASSWORD_RESET", subject: "ТУРШИЛТ: BusinessMRI.mn нууц үг сэргээх", text: "Сайн байна уу.\n\nЭнэ бол имэйл хүргэлтийн туршилт. Доорх холбоос хүчингүй гэсэн хариу өгөх ёстой:\n\nhttps://businessmri.mn/#/reset-password?token=TEST-ONLY" },
  ...["PAYMENT_CONFIRMED", "REPORT_RELEASED"].map(t => { const m = buildCustomerMail(t, ctx)!; return { ...m, subject: `ТУРШИЛТ: ${m.subject}` }; })
];
let bad = 0; for (const a of to) for (const m of mails) { try { const r = await mailer.send({ ...m, to: a }); console.log(`${m.kind} -> ${a.replace(/^(.).*@/, "$1***@")}: accepted=${r.delivered}`); } catch (x: any) { bad++; console.log(`${m.kind} -> ${a.replace(/^(.).*@/, "$1***@")}: ERROR ${x.message}`); } }
console.log("Accepted by Gmail is not proof of arrival: check inbox/spam and 'Show original' for SPF, DKIM and DMARC = PASS."); process.exit(bad ? 1 : 0);
