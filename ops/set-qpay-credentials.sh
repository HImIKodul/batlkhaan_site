#!/usr/bin/env bash
# Stores QPay Merchant V2 credentials for the backend in ONE private file (mode 600, outside the repository). Nothing is printed, nothing goes to the shell history.
# usage: bash ops/set-qpay-credentials.sh [file]      default: $HOME/mmri-secrets/qpay.env
set -euo pipefail; umask 077
F="${1:-$HOME/mmri-secrets/qpay.env}"
case "$(realpath -m "$F")/" in "$(cd "$(dirname "$0")/.." && pwd)"/*) echo "Refused: the file must be outside the repository."; exit 1;; esac
mkdir -p "$(dirname "$F")"
read -rp "Environment (sandbox/production): " ENVN
case "$ENVN" in sandbox) URL=https://merchant-sandbox.qpay.mn;; production) URL=https://merchant.qpay.mn;; *) echo "Write sandbox or production."; exit 1;; esac
[ "$ENVN" = production ] && { read -rp "Was the password that appeared in a screenshot replaced by QPay (yes/no)? " R; [ "$R" = yes ] || { echo "Stop: ask QPay to issue a new password first."; exit 1; }; }
read -rp "Client ID (username): " ID; read -rsp "Client secret (password, hidden): " SECRET; echo; read -rp "Invoice code: " CODE
for v in "$ID" "$SECRET" "$CODE"; do [ -n "$v" ] || { echo "Empty value."; exit 1; }; case "$v" in *$'\n'*|*\'*) echo "Unsupported character (quote or line break)."; exit 1;; esac; done
T="$(mktemp "$(dirname "$F")/.qpay.XXXXXX")"
printf "QPAY_BASE_URL='%s'\nQPAY_CLIENT_ID='%s'\nQPAY_CLIENT_SECRET='%s'\nQPAY_INVOICE_CODE='%s'\n" "$URL" "$ID" "$SECRET" "$CODE" > "$T"; chmod 600 "$T"; mv "$T" "$F"
echo "Saved: $F (mode 600). Check it without any payment: cd backend && node scripts/qpay-smoke.mjs $F"
