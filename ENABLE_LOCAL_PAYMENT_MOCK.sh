#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
ENV="$ROOT/backend/.env"
if [ ! -f "$ENV" ]; then
  cp "$ROOT/backend/.env.example" "$ENV"
fi
python3 - "$ENV" <<'PY'
import re,secrets,sys
p=sys.argv[1]
s=open(p,encoding='utf-8').read()
def put(k,v):
    global s
    line=f'{k}={v}'
    if re.search(rf'(?m)^{re.escape(k)}=.*$',s): s=re.sub(rf'(?m)^{re.escape(k)}=.*$',line,s)
    else: s+='\n'+line+'\n'
for k in ('ACCESS_TOKEN_SECRET','PASSWORD_PEPPER','AUDIT_HASH_SALT'):
    m=re.search(rf'(?m)^{k}="?([^"\n]*)"?$',s)
    if not m or m.group(1).startswith('replace-with') or len(m.group(1))<32:
        put(k,'"'+secrets.token_hex(40)+'"')
put('MMRI_BILLING_PROVIDER','"mock"')
put('MMRI_BILLING_ENFORCEMENT','true')
put('MMRI_DIAGNOSTIC_PRICE_MNT','1000')
put('MMRI_CONTINUOUS_PRICE_MNT','2000')
put('MMRI_BILLING_CALLBACK_BASE_URL','"http://127.0.0.1:4000"')
open(p,'w',encoding='utf-8').write(s)
PY
cat <<'TXT'
Local MOCK payment is enabled.
- Diagnostic test amount: 1,000 MNT
- Continuous test amount: 2,000 MNT
- No real payment provider is contacted.
Now run: ./START_FULLSTACK.sh
TXT
