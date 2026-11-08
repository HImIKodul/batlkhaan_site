#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
required=(
  ".nvmrc" ".npmrc" "README_LINUX.md" "RUN_LINUX.sh" "START_LOCAL.sh"
  "STOP_LOCAL.sh" "RESET_LOCAL_DB.sh" "CHECK_LINUX.sh" "docker-compose.local.yml"
  "backend/package.json" "backend/.env.example" "backend/prisma/schema.prisma"
  "backend/src/api/server.ts" "backend/src/seed-demo-company.ts"
  "backend/methodology/MMRI_v3.0.2_QBANK_v3.1.2_FINAL_MONGOLIAN_STEP12.json"
  "VERIFY_STEP10_MONGOLIAN_WORDING_INTEGRATION.sh"
  "backend/methodology/domain-question-banks/manifest-r17.08.json"
  "backend/methodology/domain-question-banks/it-1.5-repaired.json"
  "backend/methodology/domain-question-banks/finance-2.8.0-repaired.json"
  "backend/methodology/domain-question-banks/people-18.4-repaired.json"
  "backend/methodology/domain-question-banks/operations-1.4-repaired.json"
  "frontend/package.json" "frontend/.env.example" "frontend/src/App.tsx" "frontend/src/vite-env.d.ts"
  "frontend/src/data/canonicalCapabilities.ts"
  "frontend/src/data/domainQuestionSamples.ts" "frontend/src/release-r1721.css" "frontend/src/release-r1721-3.css"
  "PUBLISH_TEMPORARY_LINUX.sh" "SHOW_PUBLIC_LINK.sh" "R17_21_IMPROVEMENTS.md" "R17_21_3_IMPROVEMENTS.md"
  "STEP04_REPORT_FINDINGS.md" "VERIFY_STEP04_REPORT_FINDINGS.sh" "STEP05_AI_CONCLUSION_EXPLANATIONS.md" "VERIFY_STEP05_AI_REPORT.sh" "frontend/src/release-r1721-4-step05.css"
  "STEP06_REPORT_CONTROLS_TARGET.md" "VERIFY_STEP06_REPORT_CONTROLS.sh" "frontend/src/release-r1721-4-step06.css"
  "STEP07_SETTINGS_DARK_MODE.md" "VERIFY_STEP07_SETTINGS_DARK_MODE.sh" "frontend/src/release-r1721-4-step07.css"
  "STEP08_RESPONSIVE_GLOBAL.md" "VERIFY_STEP08_RESPONSIVE_GLOBAL.sh" "frontend/src/release-r1721-4-step08.css"
  "STEP11_RESPONSIVE_REPORT_PDF_INTERACTION.md" "VERIFY_STEP11_RESPONSIVE_REPORT_PDF_INTERACTION.sh" "frontend/src/release-r1721-4-step11.css"
  "STEP12_STATUS_PDF_HOVER_REFINEMENT.md" "VERIFY_STEP12_STATUS_PDF_HOVER_REFINEMENT.sh" "frontend/src/release-r1721-4-step12.css"
  "STEP14_HOME_REPORT_PDF_POLISH.md" "VERIFY_STEP14_HOME_REPORT_PDF_POLISH.sh" "frontend/src/release-r1721-4-step14.css"
)
missing=0
for rel in "${required[@]}"; do
  if [[ ! -e "$ROOT/$rel" ]]; then echo "MISSING $rel"; missing=1; fi
done
for script in "$ROOT"/*.sh; do [[ -f "$script" ]] && bash -n "$script"; done
backend_ts=$(find "$ROOT/backend/src" -type f \( -name '*.ts' -o -name '*.tsx' \) | wc -l | tr -d ' ')
frontend_ts=$(find "$ROOT/frontend/src" -type f \( -name '*.ts' -o -name '*.tsx' \) | wc -l | tr -d ' ')
migrations=$(find "$ROOT/backend/prisma/migrations" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')

python3 - "$ROOT" <<'PY'
import json,re,sys
from pathlib import Path
root=Path(sys.argv[1])
def load(rel):
    with open(root/rel,encoding='utf-8') as f:return json.load(f)
marketing=load('backend/methodology/MMRI_v3.0.2_QBANK_v3.1.2_FINAL_MONGOLIAN_STEP12.json')
if len(marketing.get('questions',[]))!=12288: raise SystemExit('Marketing runtime question count is not 12,288')
if len(marketing.get('categories',[]))!=64: raise SystemExit('Marketing category/capability count is not 64')
expected={
 'backend/methodology/domain-question-banks/it-1.5-repaired.json':3072,
 'backend/methodology/domain-question-banks/finance-2.8.0-repaired.json':12288,
 'backend/methodology/domain-question-banks/people-18.4-repaired.json':3072,
 'backend/methodology/domain-question-banks/operations-1.4-repaired.json':3072,
}
for rel,count in expected.items():
    d=load(rel)
    qs=d.get('questions') or d.get('questionBank') or []
    if len(qs)!=count: raise SystemExit(f'{rel}: expected {count} questions, found {len(qs)}')
    if any(not (q.get('options') or q.get('optionsMn') or q.get('explicitOptions')) for q in qs): raise SystemExit(f'{rel}: question without answer options')

samples=(root/'frontend/src/data/domainQuestionSamples.ts').read_text(encoding='utf-8')
for domain,next_domain in [('marketing','it'),('it','finance'),('finance','people'),('people','operations')]:
    part=samples.split(f'  "{domain}": [',1)[1].split(f'\n  "{next_domain}": [',1)[0]
    n=len(re.findall(r'\n\s+"id":',part))
    if n!=64: raise SystemExit(f'{domain} demo sample count is {n}, expected 64')
part=samples.split('  "operations": [',1)[1].rsplit('\n};',1)[0]
if len(re.findall(r'\n\s+"id":',part))!=64: raise SystemExit('operations demo sample count is not 64')

landing=(root/'frontend/src/pages/Landing.tsx').read_text(encoding='utf-8')
if 'БИЗНЕСИЙН НЭГДСЭН ОНОШИЛГОО' in landing: raise SystemExit('Removed homepage eyebrow returned')
subtitle='Аль чиглэл хүчтэй, аль нь сул байгааг тодорхойлж, дараагийн 12 сард яг юу хийхээ харуулсан төлөвлөгөөтэй тайлан авна.'
if subtitle not in landing: raise SystemExit('Approved homepage subtitle missing')
for label in ['BUSINESSMMRI.MN','Оношилгооны тайлангаар юу харах вэ?','Хэрхэн оношилгоо хийлгэх вэ?']:
    if label not in landing: raise SystemExit(f'Homepage guide label missing: {label}')

report=(root/'frontend/src/pages/Report.tsx').read_text(encoding='utf-8')
for bad in ['Тайлан бэлэн','<span>Байгууллага</span>','Яг хийх ажил','Хэн хариуцах','Хүлээгдэх үр дүн']:
    if bad in report: raise SystemExit(f'Robotic/redundant report label returned: {bad}')
if report.count('Ерөнхий дүгнэлт')<1: raise SystemExit('Report summary missing')

# Step 04 report findings invariants.
for token in ['function selectFindingEnds(','function rankedTieBreak(','function capabilityMeaningOnly(','const {positives,flaws}=selectFindingEnds(candidates,area)']:
    if token not in report: raise SystemExit(f'Step 04 report finding invariant missing: {token}')
for bad in ['function PurposeScores(','report-purpose-score-strip','print-purpose-scores']:
    if bad in report: raise SystemExit(f'Step 04 removed five-purpose strip returned: {bad}')
if '<p>{x.meaning}</p>' not in report: raise SystemExit('Step 04 concise finding tooltip missing')
if 'conclusion:string' not in report or "find(s=>s.id==='S10')" not in report: raise SystemExit('Step 05 AI/fallback conclusion binding missing')
if 'function summaryText(' in report: raise SystemExit('Old duplicated report summary helper returned')
ai_prompt=(root/'backend/src/report/ai-prompt.ts').read_text(encoding='utf-8')
if 'MMRI-AI-REPORT-PROMPT-1.5' not in ai_prompt: raise SystemExit('Step 05 AI prompt version missing')
validator=(root/'backend/src/report/validator.ts').read_text(encoding='utf-8')
if 'MMRI-NARRATIVE-VALIDATOR-1.3-CONCLUSION' not in validator: raise SystemExit('Step 05 narrative validator version missing')

# Build-hotfix invariants exposed by the real Linux production-build gate.
vite_env=(root/'frontend/src/vite-env.d.ts').read_text(encoding='utf-8')
if 'reference types="vite/client"' not in vite_env: raise SystemExit('Vite ImportMeta.env typing declaration missing')
priorities=(root/'frontend/src/pages/Priorities.tsx').read_text(encoding='utf-8')
if "getActionPlan(id,'H0')" in priorities or 'getActionPlan(id,"H0")' in priorities: raise SystemExit('Obsolete two-argument getActionPlan call returned')
results=(root/'frontend/src/pages/Results.tsx').read_text(encoding='utf-8')
for field in ["domainCode:'marketing'",'assessmentRevision:214','routingRevision:214','eventSequence:214']:
    if field not in results: raise SystemExit(f'Demo AssessmentSummary field missing: {field}')

profile=(root/'frontend/src/pages/Profile.tsx').read_text(encoding='utf-8')
if '<select' in profile.lower(): raise SystemExit('Native select returned to organization information page')
radar=(root/'frontend/src/components/BusinessRadar.tsx').read_text(encoding='utf-8')
if 'business-radar__category-icon' not in radar: raise SystemExit('Icon-only radar navigation missing')
if 'business-radar__label' in radar: raise SystemExit('Text radar labels returned')
if 'business-radar__center-mark' in radar: raise SystemExit('Center radar plate/mark returned')
diagnosis=(root/'frontend/src/pages/DiagnosisHub.tsx').read_text(encoding='utf-8')
for state in ["it:'locked'","finance:'progress'","people:'report'"]:
    if state not in diagnosis: raise SystemExit(f'Demo diagnosis state missing: {state}')
if 'diagnosis-status-icon' not in diagnosis: raise SystemExit('Unified diagnosis status/hover missing')
shell=(root/'frontend/src/components/AppShell.tsx').read_text(encoding='utf-8')
for token in ['mmri-notification-trigger','Төлбөр баталгаажсан','Тайлан бэлэн болсон']:
    if token not in shell: raise SystemExit(f'Notification surface missing: {token}')
main=(root/'frontend/src/main.tsx').read_text(encoding='utf-8')
if "import './release-r1721-3.css';" not in main: raise SystemExit('R17.21.3 final CSS authority not loaded last')
if "import './release-r1721-4-step06.css';" not in main: raise SystemExit('Step 06 report-control CSS missing')
if main.rfind("release-r1721-4-step06.css") < main.rfind("release-r1721-4-step05.css"): raise SystemExit('Step 06 CSS order is invalid')
if "import './release-r1721-4-step07.css';" not in main: raise SystemExit('Step 07 settings/dark-mode CSS missing')
if main.rfind("release-r1721-4-step07.css") < main.rfind("release-r1721-4-step06.css"): raise SystemExit('Step 07 CSS order is invalid')
if "import './release-r1721-4-step08.css';" not in main: raise SystemExit('Step 08 responsive/global CSS missing')
if main.rfind("release-r1721-4-step08.css") < main.rfind("release-r1721-4-step07.css"): raise SystemExit('Step 08 CSS is not the final responsive authority')
settings=(root/'frontend/src/pages/Settings.tsx').read_text(encoding='utf-8')
for token in ['applyTechnical(preview)','committedRef.current=next','disabled={!dirty}','Урьдчилан харах · хадгалагдаагүй']:
    if token not in settings: raise SystemExit(f'Step 07 settings invariant missing: {token}')
dark=(root/'frontend/src/release-r1721-4-step07.css').read_text(encoding='utf-8')
for token in ['html[data-mmri-theme="dark"]{','@media print','.billing-domain-qr','.report-domain-switcher--v20 button']:
    if token not in dark: raise SystemExit(f'Step 07 dark-mode invariant missing: {token}')
answer_tone=(root/'frontend/src/data/answerTone.ts').read_text(encoding='utf-8')
for token in ['const GREEN=[25,134,95]','const YELLOW=[211,177,0]','const RED=[198,62,50]','const quality=max>min?(score-min)/(max-min):.5','1-safeIndex/(safeCount-1)']:
    if token not in answer_tone: raise SystemExit(f'Step 03 answer interpolation invariant missing: {token}')
print('PASS: five question-bank files, demo states, icon radar, notifications and report invariants verified.')
PY

echo "Backend TS/TSX: $backend_ts"
echo "Frontend TS/TSX: $frontend_ts"
echo "Prisma migrations: $migrations"
if [[ "$backend_ts" -lt 1 || "$frontend_ts" -lt 1 || "$migrations" -lt 1 ]]; then
  echo "ERROR: unexpected package contents." >&2; exit 1
fi
if [[ "$missing" -ne 0 ]]; then echo "ERROR: required files missing." >&2; exit 1; fi
"$ROOT/VERIFY_STEP6_OF6_FINAL_ACCEPTED_INTEGRATION.sh"
echo "PASS: R17.21.8 Step-6/6 final accepted 61,440-question package is structurally complete."
