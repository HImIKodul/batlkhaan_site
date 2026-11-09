#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Support both the curated review bundle (root-scripts/ + frontend-src/) and
# the canonical full repository (project root + frontend/src/).
if [[ -d "$SCRIPT_DIR/frontend/src" ]]; then
  ROOT="$SCRIPT_DIR"
  FRONTEND="$ROOT/frontend/src"
elif [[ -d "$SCRIPT_DIR/frontend-src" ]]; then
  ROOT="$SCRIPT_DIR"
  FRONTEND="$ROOT/frontend-src"
elif [[ -d "$SCRIPT_DIR/../frontend-src" ]]; then
  ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
  FRONTEND="$ROOT/frontend-src"
else
  echo "ERROR: Step 09 frontend source not found from $SCRIPT_DIR" >&2
  exit 2
fi
export MMRI_STEP09_ROOT="$ROOT" MMRI_STEP09_FRONTEND="$FRONTEND"
python3 - <<'PY'
from pathlib import Path
import collections, os, re, sys

ROOT=Path(os.environ['MMRI_STEP09_ROOT'])
F=Path(os.environ['MMRI_STEP09_FRONTEND'])
main=(F/'main.tsx').read_text(encoding='utf-8')
imports=re.findall(r"import\s+['\"](.+?\.css)['\"]",main)
passed=[]; failed=[]

def check(name, cond, detail=''):
    (passed if cond else failed).append((name,detail))

check('active CSS import count is frozen (radar.css removed 2026-10-30; design/prism.css + design/prism-app.css added 2026-11-04; design/holo.css added 2026-11-04 holographic materials)',len(imports)==22,f'count={len(imports)}')
check('active CSS imports are unique',len(imports)==len(set(imports)))

paths=[]
for rel in imports:
    p=(F/rel.lstrip('./')).resolve()
    paths.append((rel,p))
    check('CSS import exists: '+rel,p.exists())

retired_markers=(
 'experience.css','modern.css','motion.css','responsive.css','simplified.css',
 'release-r1721.css','repair-01-','liquid-final-v5.css','liquid-app-ui-v3.css'
)
check('no retired CSS layer is re-imported',not any(any(m in rel for m in retired_markers) for rel in imports))

# Lightweight standard-library structural scanner. It understands comments,
# quoted strings and top-level at-rule blocks well enough to identify duplicate
# top-level qualified selectors without requiring npm or Python packages.
def scan_css(text):
    depth=0; i=0; state='normal'; quote=''; buf=[]; selectors=[]
    while i < len(text):
        ch=text[i]
        if state=='comment':
            if ch=='*' and i+1<len(text) and text[i+1]=='/':
                state='normal'; i+=2; continue
            i+=1; continue
        if state=='string':
            if ch=='\\' and i+1<len(text):
                if depth==0: buf.extend([ch,text[i+1]])
                i+=2; continue
            if ch==quote: state='normal'
            if depth==0: buf.append(ch)
            i+=1; continue
        if ch=='/' and i+1<len(text) and text[i+1]=='*':
            state='comment'; i+=2; continue
        if ch in ('"',"'"):
            state='string'; quote=ch
            if depth==0: buf.append(ch)
            i+=1; continue
        if ch=='{':
            if depth==0:
                pre=''.join(buf).strip(); buf=[]
                if pre and not pre.startswith('@'):
                    selectors.append(re.sub(r'\s+',' ',pre))
            depth+=1; i+=1; continue
        if ch=='}':
            depth-=1
            if depth<0: return False, selectors, depth
            if depth==0: buf=[]
            i+=1; continue
        if depth==0:
            if ch==';': buf=[]
            else: buf.append(ch)
        i+=1
    return depth==0 and state!='comment',selectors,depth

all_defs=set(); all_refs=[]
duplicate_by_file={}
important_counts={}
for rel,p in paths:
    if not p.exists(): continue
    text=p.read_text(encoding='utf-8')
    ok,selectors,depth=scan_css(text)
    check('CSS structure: '+rel,ok,f'depth={depth}')
    counts=collections.Counter(selectors)
    duplicate_by_file[rel]=sorted(s for s,n in counts.items() if n>1)
    important_counts[rel]=len(re.findall(r'!important',text,re.I))
    all_defs.update(re.findall(r'(--[A-Za-z0-9_-]+)\s*:',text))
    all_refs.extend(re.findall(r'var\(\s*(--[A-Za-z0-9_-]+)',text))

# Step 9 cleanup contract: page/component/design styles have one canonical
# top-level owner per selector. styles.css is still the bounded legacy-global
# bridge and must not grow beyond the frozen duplicate budget.
for rel,dups in duplicate_by_file.items():
    if rel=='./styles.css':
        check('legacy styles.css duplicate budget',len(dups)<=43,f'count={len(dups)}')
    else:
        check('no duplicate top-level selectors: '+rel,len(dups)==0,', '.join(dups[:8]))

check('legacy styles.css remains bounded',(F/'styles.css').stat().st_size < 70000,f"bytes={(F/'styles.css').stat().st_size}")

runtime_vars={
 '--answer-color','--area-accent','--glyph-ink','--sr-disc','--sr-ring','--billing-accent','--enter-delay','--glyph-a',
 '--domain-accent','--v','--w','--arw','--o','--r','--mx','--my','--public-home-max',
 '--report-accent','--reveal-delay','--score-color'
}
undefined=set(all_refs)-all_defs
check('undefined CSS vars are only runtime-injected vars',undefined<=runtime_vars,', '.join(sorted(undefined-runtime_vars)))
check('runtime CSS variable contract has not silently expanded',undefined==runtime_vars,
      'missing='+','.join(sorted(runtime_vars-undefined))+' extra='+','.join(sorted(undefined-runtime_vars)))

# !important is frozen to print/accessibility/legacy containment only; Step 9
# must not allow new specificity escalation in feature styles.
important_budget={
 './styles.css':154,
 './components/shell.css':2,
 './pages/report.css':247,
 './pages/priorities.css':1,
 './design/preferences.css':15,
}
for rel,count in important_counts.items():
    budget=important_budget.get(rel,0)
    check('!important budget: '+rel,count<=budget,f'{count}>{budget}')

# Cleanup-specific signatures: these were the late override layers folded into
# canonical rules during Step 9 and must not return as duplicate patches.
landing=(F/'pages/landing.css').read_text(encoding='utf-8')
login=(F/'pages/login.css').read_text(encoding='utf-8')
billing=(F/'pages/billing.css').read_text(encoding='utf-8')
account=(F/'pages/account.css').read_text(encoding='utf-8')
report=(F/'pages/report.css').read_text(encoding='utf-8')
priorities=(F/'pages/priorities.css').read_text(encoding='utf-8')
check('guide safe-area lives in canonical rule','env(safe-area-inset-bottom)' in landing and 'env(safe-area-inset-top)' in landing)  # near-fullscreen popup covers the header: margins come from safe areas
check('auth brand late override was folded into base rule','font-size:15px;letter-spacing:.035em' in login and 'font-size:20px;letter-spacing:.14em' not in login)
check('billing modal has one canonical overlay rule',billing.count('.billing-success-modal{')==1)
check('account setup-preview control is removed (onboarding shows no example questions)','.profile-setup-preview' not in account)
check('report download visual override was folded into base rule','border:1px solid var(--wp-silver2)' in report and 'border:1px solid rgba(255,255,255,.35)' not in report)
check('priority score late flex override is gone','display:flex;align-items:baseline;gap:5px' not in priorities and 'grid-template-columns:1fr 1fr' in priorities)

print(f'STEP 09 CSS REGRESSION GATE: {len(passed)}/{len(passed)+len(failed)} PASS')
for n,d in passed: print('PASS',n+(f' - {d}' if d else ''))
for n,d in failed: print('FAIL',n+(f' - {d}' if d else ''))
if failed: sys.exit(1)
PY
