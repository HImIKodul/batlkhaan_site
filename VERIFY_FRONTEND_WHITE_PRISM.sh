#!/usr/bin/env bash
# White Prism frontend contract. Replaces the retired STEP07/08/11 verifiers (see retired-verifiers/README.md).
# Static, source-level checks of behaviour that is still part of the product; the browser sweep (screens, overflow, focus, hover)
# lives in the visual QA run, not here.
set -euo pipefail
cd "$(dirname "$0")"
python3 - <<'PY'
import re,sys
from pathlib import Path
F=Path('frontend/src')
def rd(p): return (F/p).read_text(encoding='utf-8')
landing_css=rd('pages/landing.css'); prism=rd('design/prism.css'); app=rd('design/prism-app.css'); pref=rd('design/preferences.css')
shell=rd('components/AppShell.tsx'); core=rd('components/MmriCore.tsx'); main=rd('main.tsx')
report=rd('pages/Report.tsx'); results=rd('pages/Results.tsx'); prio=rd('pages/Priorities.tsx'); report_css=rd('pages/report.css')
errors=[]; n=0
def check(name,ok):
    global n; n+=1
    print(('PASS ' if ok else 'FAIL ')+name)
    if not ok: errors.append(name)

# --- responsive contract (was STEP08): breakpoints, safe areas, touch, short screens, mobile clearance
for bp in ['@media (max-width:1000px)','@media (max-width:820px)','@media (max-width:700px)','@media (max-width:560px)']:
    check(f'landing responsive breakpoint {bp}',bp in landing_css)
check('mobile bottom-nav clearance on the homepage stage (guides never sit under the fixed nav)',"@media (max-width:767px){.mmri-home2__stage{padding-bottom:calc(var(--mmri-bottom-nav-height,64px)" in landing_css)
check('guide popup respects bottom safe area','env(safe-area-inset-bottom)' in landing_css)
check('header respects top safe area','env(safe-area-inset-top)' in prism)
check('short-screen homepage rule','(max-height:639px)' in landing_css)
check('hero parallax is disabled for coarse pointers and reduced motion',"(pointer: coarse)" in core and "(prefers-reduced-motion: reduce)" in core)
check('touch targets: hero chips are at least 40px',"width:max(8.4%,40px)" in landing_css)
# --- motion / transparency preferences
check('reduced motion handled in landing.css and prism.css','prefers-reduced-motion:reduce' in landing_css and 'prefers-reduced-motion:reduce' in prism)
check('reduced transparency removes backdrop blur','prefers-reduced-transparency:reduce' in prism and 'prefers-reduced-transparency:reduce' in landing_css)
check('reduced-motion hover lift is disabled with enough specificity (no !important)',':hover:not(:disabled){transform:none}' in prism and '!important' not in prism)
# --- accessibility
check('keyboard focus rings: hero chips, report domain tabs, glass controls','.mmri-core__chip:focus-visible{outline:var(--ix-ring)' in landing_css and '--ix-ring:3px solid var(--wp-ink)' in prism and '.report-domain-switcher>button:focus-visible{outline:3px solid var(--wp-ink)' in report_css and 'outline:3px solid var(--wp-ink)' in prism)
check('programmatic heading focus shows no ring, keyboard focus keeps one','[tabindex="-1"]:focus{outline:none}' in app)
check('notification bell is a 46px non-shrinking glass circle','width:46px;height:46px;min-width:46px' in prism and 'flex:none' in prism)
check('hero domain buttons have accessible names','aria-label={`${d.name} - оношилгоо`}' in core)
# --- application-wide system (was STEP07 shell/theme coverage, now White Prism)
check('every shell page gets the prism body class','usePrismBody();' in shell)
check('prism-app.css is imported before preferences.css, which stays last',main.index('prism-app.css')<main.index('preferences.css') and main.rstrip().splitlines()[-1].strip().startswith("import './design/preferences.css'") or main.rfind("import './design/preferences.css'")>main.rfind('prism-app.css'))
check('legacy dark tokens are re-pointed to the light palette','--mmri-color-text-strong:#162333' in app and '--pm-ink:#162333' in prism and '--mmri-glass-bg-overlay:linear-gradient(160deg,rgba(255,255,255,.93)' in app)
check('alias tokens that tokens.css resolves on :root are re-resolved for prism pages','--mmri-ink:var(--mmri-color-text-strong)' in app)
check('report reading paper is solid (no backdrop blur on text)','background:var(--wp-spec) top/100% 14% no-repeat,#fff' in report_css)
check('report PDF button keeps its fixed 176x46 geometry and does not move on hover','width:176px;height:46px' in report_css and not re.search(r'\.report-top-download:hover[^{]*\{[^}]*transform',report_css))
check('diagnosis tiles are stationary on hover (frozen rule)',not re.search(r'\.cat-tile:hover[^{]*\{[^}]*transform',rd('components/glass.css')))
# no hard-coded light-on-light text left in page css (allow-list = white text on a dark/colour chip)
allow={'.report-purpose-number','.billing-domain-flow>div.is-current b','body.mmri-print-report .pdf-priority-list>article>span'}  # white numerals on solid dark/colour badges
bad=[]
for f in ['pages/results.css','pages/report.css','pages/account.css','pages/billing.css','pages/questionnaire.css','pages/support.css','pages/priorities.css','pages/diagnosis.css','pages/login.css','components/forms.css','components/components.css']:
    for m in re.finditer(r'([^{}]+)\{([^{}]*)\}',rd(f)):
        sel=m.group(1).strip().split('\n')[-1]
        if sel in allow: continue
        for d in re.finditer(r'(?<![\w-])color:\s*(#fff(?:fff)?\b|white\b|rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*(?:1|0?\.[6-9]\d*)\s*\))',m.group(2),re.I):
            bad.append(f'{f}: {sel[:60]}')
check('no hard-coded white text in page css outside the allow-list '+(('(found: '+'; '.join(bad[:4])+')') if bad else ''),not bad)
check('native controls/scrollbars use the light colour scheme (no color-scheme: dark left over)',"colorScheme='light'" in main and 'color-scheme: light' in rd('design/tokens.css') and 'color-scheme: dark' not in rd('design/tokens.css'))
# --- product rules (was STEP11)
check('no visible "/100" in Report, Results or Priorities','/100' not in report and '/100' not in results and '/ 100' not in prio and '/100' not in prio)
check('roadmap card is the tappable completion control: a native <button> with aria-pressed (stronger than role=button)','<button type="button" className={`report-roadmap-card' in report and 'report-roadmap-card--tappable' in report and 'aria-pressed={done}' in report)
check('old roadmap checkbox control is gone','className="report-plan-complete"' not in report)
check('the frontend does not render a fourth print/PDF page (the PDF is exactly three A4 pages)','PrintPageFour' not in report and 'total=4' not in report)
check('homepage radar component is gone',not (F/'components/BusinessRadar.tsx').exists())
print(f'\nFRONTEND WHITE PRISM CONTRACT: {n-len(errors)}/{n} PASS')
sys.exit(1 if errors else 0)
PY
