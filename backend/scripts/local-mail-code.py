#!/usr/bin/env python3
"""LOCAL DEVELOPMENT ONLY. Prints the LATEST six-digit verification code the mock mailer wrote for ONE address (never the whole mailbox).
   usage: python3 backend/scripts/local-mail-code.py dev.customer@mmri.test"""
import json, os, re, sys, time
if len(sys.argv) != 2 or "@" not in sys.argv[1]: sys.exit("usage: local-mail-code.py <e-mail address of a demonstration account>")
box = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".mock-mailbox", "outbox.jsonl")
want = sys.argv[1].strip().lower(); found = None
try:
    for line in open(box, encoding="utf8"):
        try: m = json.loads(line)
        except ValueError: continue
        if str(m.get("to", "")).lower() == want:
            c = re.search(r"\b(\d{6})\b", m.get("text", ""))
            if c: found = (c.group(1), m)
except FileNotFoundError: pass
if not found: sys.exit(f"No code for {want} yet. Start the sign-in first (the code is mailed after the password step).")
code, m = found
age = ""
for k in ("createdAt", "sentAt", "at", "ts"):
    if m.get(k):
        try:
            from datetime import datetime, timezone
            t = datetime.fromisoformat(str(m[k]).replace("Z", "+00:00")); age = f"   (sent {int((datetime.now(timezone.utc) - t).total_seconds())} s ago)"
        except Exception: pass
        break
print(f"Code: {code}{age}")
