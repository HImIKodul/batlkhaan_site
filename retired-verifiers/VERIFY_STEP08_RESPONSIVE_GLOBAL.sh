#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
python3 - "$ROOT" <<'PY'
from pathlib import Path
import re,sys
root=Path(sys.argv[1])
main=(root/'frontend/src/main.tsx').read_text(encoding='utf-8')
css=(root/'frontend/src/release-r1721-4-step08.css').read_text(encoding='utf-8')
errors=[]

def need(name,ok):
    if not ok: errors.append(name)

need('Step08 CSS loaded',"import './release-r1721-4-step08.css';" in main)
need('Step08 loaded after Step07',main.rfind('release-r1721-4-step08.css')>main.rfind('release-r1721-4-step07.css'))
need('fluid global frame','--r214-frame:1440px' in css and '--r214-gutter:clamp(' in css)
need('small viewport height handling','100svh' in css)
need('safe area handling','env(safe-area-inset-top)' in css and 'env(safe-area-inset-bottom)' in css)
need('desktop/laptop breakpoint','@media (max-width:1180px)' in css)
need('tablet breakpoint','@media (max-width:900px)' in css)
need('mobile breakpoint','@media (max-width:620px)' in css)
need('short-screen breakpoint','@media (max-height:700px)' in css)
need('touch pointer handling','@media (hover:none),(pointer:coarse)' in css)
need('home viewport contract','body.mmri-home-no-scroll' in css and '.home-dashboard__body' in css and '.business-radar' in css)
need('guide viewport containment','.home-guide-modal__panel' in css and 'max-height:calc(100svh' in css)
need('diagnosis recomposition','.diagnosis-square-grid' in css and 'repeat(5,minmax(0,1fr))' in css)
need('questionnaire responsive contract','.mmri-questionnaire-page' in css and '.mmri-questionnaire__actions' in css)
need('billing responsive contract','.billing-domain-page>header' in css and '.billing-domain-layout' in css)
need('report responsive contract','.report-domain-switcher--v20' in css and 'overflow-x:auto!important' in css)
need('settings responsive contract','.technical-settings__footer' in css and '.account-payment-history article' in css)
need('word-based Mongolian wrapping','overflow-wrap:break-word!important' in css and 'word-break:normal!important' in css)
need('legacy anywhere overridden','.mmri-questionnaire__answers .mmri-radio-card__copy strong' in css and '.billing-history__item>div:first-child strong' in css)
need('active report domain can wrap','.report-domain-switcher__active-copy strong{white-space:normal!important' in css)
need('touch tooltips accessible','.home-radar-status:focus .home-radar-status__tip' in css and '.diagnosis-status-icon:focus .diagnosis-status-tooltip' in css)
need('print plan untouched','report-print-page' not in css and 'print-plan-stage' not in css)

# Basic CSS structural balance ignoring comments and quoted strings.
clean=re.sub(r'/\*.*?\*/','',css,flags=re.S)
clean=re.sub(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'','',clean)
need('CSS brace balance',clean.count('{')==clean.count('}'))

if errors:
    print('STEP 08 RESPONSIVE/GLOBAL: FAIL')
    for e in errors: print(' -',e)
    raise SystemExit(1)
print('STEP 08 RESPONSIVE/GLOBAL: PASS')
PY
