/* WS-D static checks for the frontend logic fixes (MMRI-27, MMRI-08). Usage: node scripts/qa-wsd-frontend-static.mjs [--head] ; --head evaluates the git HEAD versions (baseline, expected to FAIL). */
import { readFileSync } from "node:fs"; import { execSync } from "node:child_process";
const root = new URL("../../frontend/src/", import.meta.url).pathname; const head = process.argv.includes("--head");
const read = p => head ? execSync(`git show HEAD:frontend/src/${p}`, { cwd: root, encoding: "utf8" }) : readFileSync(root + p, "utf8");
let fail = 0; const rec = (n, ok) => { if (!ok) fail++; console.log((ok ? "PASS " : "FAIL ") + n); };
const billing = read("pages/Billing.tsx");
rec("F1 Billing.tsx drops a FAILED/CANCELLED open invoice on poll/refresh so the create-code view returns", /status!=='FAILED'&&latest\.status!=='CANCELLED'|latest\.status==='FAILED'|CANCELLED'\)return false/.test(billing) && /if\(deadInvoice\(latest\)\)/.test(billing));
for (const f of ["pages/Login.tsx", "pages/DiagnosisHub.tsx", "pages/Profile.tsx", "components/AppShell.tsx"]) {
  const s = read(f); rec(`F2 ${f} does not silently pick the first company`, !/(cs|companies)\[0\]/.test(s) && /resolveActiveCompany|needsChoice/.test(s));
}
const settings = read("pages/Settings.tsx"); rec("F3 Settings.tsx offers the company selector only for more than one company", /companies\.length>1&&/.test(settings));
console.log(fail ? `\n${fail} FAILED` : "\nALL PASSED"); process.exit(fail ? 1 : 0);
