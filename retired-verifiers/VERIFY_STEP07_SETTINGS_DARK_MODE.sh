#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
python3 - "$ROOT" <<'PY'
from pathlib import Path
import sys
root=Path(sys.argv[1])
settings=(root/'frontend/src/pages/Settings.tsx').read_text(encoding='utf-8')
main=(root/'frontend/src/main.tsx').read_text(encoding='utf-8')
css=(root/'frontend/src/release-r1721-4-step07.css').read_text(encoding='utf-8')
errors=[]
checks=[
 ('Step07 CSS loaded',"import './release-r1721-4-step07.css';" in main),
 ('Step07 CSS is after Step06',main.rfind('release-r1721-4-step07.css')>main.rfind('release-r1721-4-step06.css')),
 ('live preview effect','useEffect(()=>{applyTechnical(preview)}' in settings),
 ('committed restore on leave','useEffect(()=>()=>{applyTechnical(committedRef.current)}' in settings),
 ('save-only persistence','writeTechnical(next);committedRef.current=next' in settings),
 ('defaults preview does not write immediately',"const reset=()=>{setFont('normal');setMotion(false);setContrast(false);setDensity('comfortable');setTheme('light')" in settings),
 ('dirty save guard','disabled={!dirty}' in settings),
 ('unsaved preview feedback','Урьдчилан харах · хадгалагдаагүй' in settings),
 ('theme applied before render','applyStoredTechnicalPreferences();' in main and main.find('applyStoredTechnicalPreferences();')<main.find('ReactDOM.createRoot')),
 ('cross-tab saved settings sync',"window.addEventListener('storage'" in main),
 ('dark token contract','html[data-mmri-theme="dark"]{' in css and '--mmri-color-canvas:#0D1411' in css),
 ('dark shell coverage','.mmri-shell-header' in css and '.mmri-account-menu' in css and '.mmri-notification-panel' in css),
 ('dark home coverage','.home-dashboard' in css and '.home-guide-modal__panel' in css),
 ('dark diagnosis coverage','.diagnosis-square' in css and '.diagnosis-status-icon' in css),
 ('dark billing coverage','.billing-domain-main' in css and '.billing-domain-qr' in css),
 ('dark questionnaire coverage','.mmri-questionnaire__form' in css and ':not(.has-score-tone)' in css),
 ('scored answer hues preserved in dark mode','button.has-score-tone' in css and 'color-mix(in srgb,var(--answer-color) 14%,var(--mmri-color-surface))' in css),
 ('dark report coverage','.report-screen-page' in css and '.report-domain-switcher--v20 button' in css),
 ('dark settings coverage','.technical-settings__group' in css and '.technical-settings__choices button.is-active' in css),
 ('QR stays scanner-safe','background:#FFFFFF!important' in css and '.billing-domain-qr' in css),
 ('print remains light','@media print' in css and 'color-scheme:light!important' in css),
 ('dark high contrast supported','data-mmri-contrast="high"' in css),
]
for name,ok in checks:
    if not ok: errors.append(name)
if errors:
    print('STEP 07 SETTINGS/DARK MODE: FAIL')
    for e in errors: print(' -',e)
    raise SystemExit(1)
print('STEP 07 SETTINGS/DARK MODE: PASS')
PY
