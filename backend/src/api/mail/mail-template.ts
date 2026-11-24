/* One branded HTML layout for every transactional message. The HTML is derived from the same plain text that is always sent beside it, so the two can never disagree.
   Everything is escaped; only http(s) links become buttons; no images, scripts, remote fonts or tracking. Tables and inline styles only (Gmail, Outlook and phone clients). */
export interface MailBodyInput { subject: string; text: string; kind: string }
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const URL_RE = /https?:\/\/[^\s<>"']+/;
const BUTTON: Record<string, string> = {
  PASSWORD_RESET: "Шинэ нууц үг тохируулах", ADMIN_PASSWORD_RESET: "Шинэ нууц үг тохируулах", ASSESSMENT_COMPLETED: "Үр дүнг үзэх", REPORT_RELEASED: "Тайланг үзэх",
  PAYMENT_CONFIRMED: "Оношилгоог эхлүүлэх", ADMIN_REVIEW_ALERT: "Хяналтын жагсаалт нээх"
};
const P = "margin:0 0 16px;font-size:16px;line-height:1.6;color:#1b2a4a;";
/** First sentence for the inbox preview line. A verification code is never put there (lock screens show it). */
function preheader(text: string): string { return (text.split(/\n+/).map(x => x.trim()).find(x => x && !/^Сайн байна уу/.test(x) && !URL_RE.test(x) && !/\d{6}/.test(x)) ?? "").slice(0, 110); }

export function renderMailHtml(m: MailBodyInput): string {
  const blocks = m.text.replace(/\r/g, "").trim().split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
  const body: string[] = []; let footer = "";
  for (const b of blocks) {
    if (/^BusinessMRI\.mn\n/.test(b)) { footer = b.split("\n").slice(1).join(" "); continue; }
    if (/^\d{6}$/.test(b)) { body.push(`<p style="margin:0 0 20px;padding:16px 12px;text-align:center;font-size:30px;line-height:1.2;font-weight:700;letter-spacing:8px;color:#0b2a6b;background:#eaf2ff;border:1px solid #bcd3ff;border-radius:12px;font-family:Consolas,Menlo,monospace;">${b}</p>`); continue; }
    const url = URL_RE.exec(b)?.[0];
    if (url) {
      const lead = b.replace(url, "").replace(/[:\s]+$/, "").trim();
      // Label lines such as "Төрөл: ..." keep their own paragraph; the link itself becomes the button, with the address below for clients that block buttons.
      if (lead) body.push(`<p style="${P}">${esc(lead).replace(/\n/g, "<br>")}</p>`);
      const safe = esc(url);
      body.push(`<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 14px;"><tr><td style="border-radius:12px;background:#1559e6;"><a href="${safe}" style="display:inline-block;padding:14px 26px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;">${esc(BUTTON[m.kind] ?? "Нээх")}</a></td></tr></table><p style="margin:0 0 18px;font-size:13px;line-height:1.5;color:#5a6a86;overflow-wrap:anywhere;">Товч ажиллахгүй бол энэ холбоосыг хуулж нээнэ үү:<br>${safe}</p>`);
      continue;
    }
    body.push(`<p style="${P}">${esc(b).replace(/\n/g, "<br>")}</p>`);
  }
  return `<!doctype html><html lang="mn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(m.subject)}</title></head>`
    + `<body style="margin:0;padding:0;background:#eef3fb;"><div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader(m.text))}</div>`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef3fb;"><tr><td align="center" style="padding:24px 12px;">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden;font-family:Arial,'Segoe UI',Roboto,sans-serif;">`
    + `<tr><td style="padding:22px 28px;background:#0a1f55;font-size:22px;font-weight:700;color:#ffffff;">Business<span style="color:#7fb2ff;">MRI</span>.mn</td></tr>`
    + `<tr><td style="padding:28px 28px 12px;">${body.join("")}</td></tr>`
    + `<tr><td style="padding:16px 28px 24px;border-top:1px solid #e3ebf8;font-size:13px;line-height:1.5;color:#5a6a86;">${esc(footer || "Энэ мэйл автоматаар илгээгдсэн.")}<br>BusinessMRI.mn</td></tr>`
    + `</table></td></tr></table></body></html>`;
}
