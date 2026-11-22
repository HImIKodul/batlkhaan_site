#!/usr/bin/env bash
# Re-runs the bundle-pinned regressions against the ACTIVE methodology bundles (4.x.7 in businessmri-v2.6-runtime-bundles) without editing the originals.
# Temporary copies are created next to the originals (they use relative imports) and removed afterwards. Read-only: no database, no network.
set -uo pipefail; cd "$(dirname "$0")/.."
RC=0
for s in backend-step06-scoring-integrity-regression backend-step07-findings-integrity-regression backend-step08-recommendation-integrity-regression backend-step09-action-plan-integrity-regression; do
  T=scripts/.tmp-active-$s.mjs
  sed -E 's#businessmri-v2\.5-runtime-bundles/(MMRI_[A-Z]+_Methodology_4\.[1-4])\.5_#businessmri-v2.6-runtime-bundles/\1.7_#g' scripts/$s.mjs > "$T"
  n=$(grep -c "v2.6-runtime-bundles" "$T"); out=$(node "$T" 2>&1); code=$?; rm -f "$T"
  echo "$s [bundles rewritten to active: $n lines] exit=$code"; echo "$out" | python3 -c "
import sys,json
t=sys.stdin.read()
try:
  j=json.loads(t[t.index('{'):t.rindex('}')+1]);c=j.get('checks') or []
  print('   ',j.get('status') or ('PASS' if c and all(x.get('pass') or x.get('ok') for x in c) else 'FAIL'),j.get('checksPassed') or sum(1 for x in c if x.get('pass') or x.get('ok')),'/',j.get('checksTotal') or len(c))
  for x in c:
    if not (x.get('pass') or x.get('ok')):print('    FAILED:',str(x.get('name'))[:140],str(x.get('detail'))[:100])
except Exception as e:print('   unparsed:',t[-300:].replace(chr(10),' '))"
  [ $code -ne 0 ] && RC=1
done; exit $RC
