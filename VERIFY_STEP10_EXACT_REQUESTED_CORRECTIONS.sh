#!/usr/bin/env bash
set -u
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
python3 - <<'PY'
from pathlib import Path
checks=[]
def check(name, ok):
    checks.append((name,bool(ok))); print(('PASS' if ok else 'FAIL'), name)
report=Path('frontend/src/pages/Report.tsx').read_text(encoding='utf-8')
css=Path('frontend/src/release-r1721-4-step10.css').read_text(encoding='utf-8')
main=Path('frontend/src/main.tsx').read_text(encoding='utf-8')
check('Step10 CSS loaded after Step09', main.rfind("release-r1721-4-step10.css") > main.rfind("release-r1721-4-step09.css"))
check('radar uses no transform positioning', 'left:calc(var(--radar-x) - (var(--radar-icon-size) / 2))' in css and 'transform:none!important' in css)
check('radar icon hover/focus cannot translate/scale', '.business-radar--icons .business-radar__category-icon:hover' in css and 'translate:none!important;scale:none!important' in css)
check('PDF button is static and has no transform', '.report-v20__top .report-top-download' in css and 'position:static!important' in css and 'transform:none!important' in css)
check('diagnosis status is small top-right square', 'width:32px!important;height:32px!important' in css and 'top:12px!important;right:12px!important' in css and 'border-radius:6px!important' in css)
check('report category buttons have no thin outline', '.report-domain-switcher--v20 button' in css and 'border:0!important;outline:0!important;box-shadow:none!important' in css)
check('report status state has transparent background', '.report-domain-switcher__state.is-report' in css and 'background:transparent!important' in css)
check('five critical rows fill page width', '.page-two .report-purpose-priorities--actionable>article' in css and 'width:100%!important;max-width:none!important' in css)
check('five critical uses canonical capability as sole heading', '<h3>{p.weakest}</h3><p>{p.detail}</p>' in report)
check('duplicate capability label removed', 'report-purpose-capability' not in report)
check('multiple affected-purpose chips removed from critical rows', 'report-purpose-links' not in report)
check('PDF critical rows use same canonical capability heading', '<strong>{p.weakest}</strong><p>{p.detail}</p>' in report)
check('PDF first-page duplicated 3+3 block removed', 'm.positives.slice(0,3)' not in report and 'm.flaws.slice(0,3)' not in report)
check('PDF first-page score no longer adds 12-month target', '<em>12 сарын зорилт:' not in report)
failed=[n for n,ok in checks if not ok]
print({'status':'FAIL' if failed else 'PASS','checks':len(checks),'failed':failed})
raise SystemExit(1 if failed else 0)
PY
