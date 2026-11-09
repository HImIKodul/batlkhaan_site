#!/usr/bin/env bash
# Static regression gate for the shared interaction system (hover/focus/pressed/disabled/touch). Browser behaviour is covered by
# frontend/scripts/ui-interaction-audit.mjs (needs playwright-core + running dev server + local QA account).
set -euo pipefail
cd "$(dirname "$0")/frontend/src"
python3 - <<'PY'
import re,pathlib,sys
css={p:p.read_text(encoding='utf-8') for p in pathlib.Path('.').rglob('*.css')}
tsx={p:p.read_text(encoding='utf-8') for p in pathlib.Path('.').rglob('*.tsx')}
ok=0;fail=0
def check(name,cond,detail=''):
    global ok,fail
    if cond: ok+=1;print('PASS',name)
    else: fail+=1;print('FAIL',name,detail)
# 1. hover/active never moves or resizes a control (transform/translate/scale/margin/width/height/top/left inside :hover rules)
ALLOW=('.mmri-tooltip','::after','::before','.mmri-core__tag','.mmri-primary-nav a')  # decorative pseudo-elements and the tooltip bubble
bad=[]
for p,t in css.items():
    t=re.sub(r'/\*.*?\*/','',t,flags=re.S)
    for sel,body in re.findall(r'([^{}]+)\{([^{}]*)\}',t):
        if ':hover' not in sel and ':active' not in sel: continue
        if any(a in sel for a in ALLOW): continue
        for prop in re.findall(r'(?<![-\w])(transform|translate|scale|rotate|margin(?:-[a-z]+)?|width|height|top|left|right|bottom|padding(?:-[a-z]+)?)\s*:\s*([^;]+)',body):
            if prop[0] in('transform','translate','scale','rotate') and prop[1].strip() in('none','0','translateY(0)'): continue
            bad.append(f'{p}: {sel.strip()[:70]} -> {prop[0]}:{prop[1].strip()[:30]}')
check('no :hover/:active rule moves, scales or resizes a control',not bad,'; '.join(bad[:6]))
prism=css[pathlib.Path('design/prism.css')]
for tok in ['--ix-dur','--ix-ease','--ix-ring','--ix-ring-offset','--ix-hover-shadow','--ix-press-shadow','--ix-disabled','--ix-selected','--ix-success','--ix-error']:
    check(f'interaction token {tok} defined',re.search(re.escape(tok)+r'\s*:',prism) is not None)
check('one shared focus-visible ring rule',':focus-visible{outline:var(--ix-ring);outline-offset:var(--ix-ring-offset)}' in prism)
check('shared pressed state is inset (no movement)','--ix-press-shadow);' in prism or 'box-shadow:var(--ix-press-shadow)' in prism)
check('shared disabled + loading (aria-busy) states','cursor:not-allowed' in prism and '[aria-busy=true]' in prism)
check('touch screens neutralise sticky hover (@media (hover:none))','@media (hover:none)' in prism)
check('pointer sheen sits behind content (z-index:-1, isolated)','[data-sheen]::after{content:"";position:absolute;z-index:-1' in prism and 'isolation:isolate' in prism)
landing=css[pathlib.Path('pages/landing.css')]
chip=re.search(r'\.mmri-core__chip\{[^}]*\}',landing).group(0)
check('hero chips are stationary (no pointer parallax on clickable chips)','--px' not in chip and 'translate3d' not in chip)
stage=re.search(r'\.mmri-core__stage\{[^}]*\}',landing).group(0)
check('hero stage does not tilt with the pointer','rotate' not in stage and 'perspective' not in stage)
core=tsx[pathlib.Path('components/MmriCore.tsx')]
check('hero parallax only while pointer is over the art and no dialog is open','mmri-modal-open' in core and 'getBoundingClientRect' in core)
check('reduced motion disables hero parallax','prefers-reduced-motion' in core)
check('no page declares its own hover timing >0.4s on controls (one motion language)',not re.findall(r':hover[^{]*\{[^}]*transition[^}]*[^\d.]([5-9]\d\d)ms',' '.join(css.values())))
em=[str(p) for p,t in list(css.items())+list(tsx.items()) if chr(0x2014) in t]
check('no em dash anywhere in frontend CSS/TSX (display rule: hyphen, comma, colon or parentheses)',not em,', '.join(em[:4]))
check('server text is normalised so no em dash can reach the UI',r"\u2014" in pathlib.Path('api/client.ts').read_text(encoding='utf-8'))
print(f'INTERACTION SYSTEM GATE: {ok}/{ok+fail} PASS')
sys.exit(1 if fail else 0)
PY
