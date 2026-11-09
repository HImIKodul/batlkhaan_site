#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
python3 - <<'PY'
import json,csv,sys
checks=[]
def j(path): return json.load(open(path,encoding='utf-8'))
def ok(name,cond,detail=''):
    checks.append((name,bool(cond),detail))
    print(('PASS ' if cond else 'FAIL ')+name+((' - '+str(detail)) if detail!='' else ''))
# Heavy regressions executed against the exact Step-10 integration before packaging.
for fn,want in [
 ('STEP02_ADAPTIVE_ROUTING_REGRESSION.json',(40,40)),
 ('STEP03_CONFIDENCE_REGRESSION.json',(48,48)),
 ('STEP04_SCORING_REGRESSION.json',(2342,2342)),
 ('STEP05_CELL_REACHABILITY_REGRESSION.json',(3797,3797)),
 ('STEP11_TARGETED_SYNTHETIC_REGRESSION.json',(27,27)),
]:
    x=j(fn); passed=x.get('checksPassed',x.get('passed')); total=x.get('checksTotal',x.get('total'))
    ok(fn,x.get('status')=='PASS' and (passed,total)==want,f'{passed}/{total}')
x=j('STEP11_BILLING_RETAKE_STATIC.json'); ok('billing/retake static',x.get('status')=='PASS' and x.get('checksPassed')==24,'24/24')
x=j('STEP11_REGRESSION_MANIFEST.json'); ok('Step11 manifest source status',x.get('status')=='SOURCE_RUNTIME_HARNESS_PASS_CONNECTED_HOLD',x.get('status'))
# Connected hold must be explicit, never silently treated as PASS.
ok('connected runtime explicitly held',x.get('connectedGate',{}).get('status')=='HOLD_NOT_RUN',x.get('connectedGate',{}).get('status'))
if not all(v for _,v,_ in checks): raise SystemExit(2)
print('STEP11 EVIDENCE: PASS (connected gate remains HOLD_NOT_RUN)')
PY
