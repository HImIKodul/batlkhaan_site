#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE="$ROOT/frontend/src/data/answerTone.ts"

python3 - "$SOURCE" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1])
s=p.read_text(encoding='utf-8')
required=[
 "const GREEN=[25,134,95]",
 "const YELLOW=[211,177,0]",
 "const RED=[198,62,50]",
 "if(q>=.5)",
 "const quality=max>min?(score-min)/(max-min):.5",
 "1-safeIndex/(safeCount-1)",
 "isNeutralAnswer",
]
missing=[x for x in required if x not in s]
if missing:
    raise SystemExit('STEP 03 static check failed: '+', '.join(missing))
print('STEP 03 static source check: PASS')
PY

TSC=""
if [[ -x "$ROOT/frontend/node_modules/.bin/tsc" ]]; then
  TSC="$ROOT/frontend/node_modules/.bin/tsc"
elif command -v tsc >/dev/null 2>&1; then
  TSC="$(command -v tsc)"
fi

if [[ -z "$TSC" ]]; then
  echo "STEP 03 runtime color check: SKIPPED (TypeScript compiler not installed yet)."
  echo "It will be covered by the frontend build after npm install."
  exit 0
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cp "$SOURCE" "$TMP/answerTone.ts"
cat > "$TMP/react.d.ts" <<'DTS'
declare namespace React { interface CSSProperties { [key:string]: string | number | undefined } }
declare module 'react' { export = React; }
DTS

"$TSC" "$TMP/answerTone.ts" "$TMP/react.d.ts" \
  --target ES2022 --module commonjs --esModuleInterop --skipLibCheck --outDir "$TMP/out"

node - "$TMP/out/answerTone.js" <<'NODE'
const mod=require(process.argv[2]);
const color=s=>s['--answer-color'];
const expected={
  2:['rgb(25 134 95)','rgb(198 62 50)'],
  3:['rgb(25 134 95)','rgb(211 177 0)','rgb(198 62 50)'],
  4:['rgb(25 134 95)','rgb(149 163 32)','rgb(207 139 17)','rgb(198 62 50)'],
  5:['rgb(25 134 95)','rgb(118 156 48)','rgb(211 177 0)','rgb(205 120 25)','rgb(198 62 50)'],
  6:['rgb(25 134 95)','rgb(99 151 57)','rgb(174 168 19)','rgb(208 154 10)','rgb(203 108 30)','rgb(198 62 50)'],
  7:['rgb(25 134 95)','rgb(87 148 63)','rgb(149 163 32)','rgb(211 177 0)','rgb(207 139 17)','rgb(202 100 33)','rgb(198 62 50)'],
};
for(const [countText,want] of Object.entries(expected)){
  const count=Number(countText);
  const got=Array.from({length:count},(_,i)=>color(mod.positionalAnswerStyle(i,count,true)));
  if(JSON.stringify(got)!==JSON.stringify(want)){
    throw new Error(`count ${count}: expected ${JSON.stringify(want)} got ${JSON.stringify(got)}`);
  }
}
const scored=[100,75,50,25,0].map(v=>color(mod.scoredAnswerStyle(v,0,100)));
if(JSON.stringify(scored)!==JSON.stringify(expected[5]))throw new Error('score-based 5-option gradient mismatch');
if(!mod.isNeutralAnswer('Мэдэхгүй'))throw new Error('neutral answer detection failed');
if(!mod.isNeutralAnswer('Хариулах мэдээлэл алга'))throw new Error('neutral answer detection failed');
console.log('STEP 03 runtime color interpolation: PASS');
NODE
