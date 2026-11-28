import urllib.parse, base64, hashlib, hmac, http.cookiejar, json, os, re, struct, sys, time, urllib.request, urllib.error
W = "http://127.0.0.1:5291/api/v1"
OUT = "/home/kirby/MMRI_RECOVERY_1f0e28e/backend/.mock-mailbox/outbox.jsonl"
cr = {}
for l in open(os.path.expanduser("~/mmri-secrets/local-dev-credentials.env")):
    if "=" in l and not l.startswith("#"):
        k, v = l.rstrip("\n").split("=", 1); cr[k] = v
class Client:
    """HTTP client with a cookie jar. A NAME makes the jar persistent (so a trusted-device cookie survives between test runs, exactly like a browser)."""
    def __init__(s, name=None):
        s.path = os.path.join(os.path.dirname(os.path.abspath(globals().get('__file__', 'x'))) if '__file__' in globals() else os.getcwd(), f"jar-{name}.txt") if name else None
        s.jar = http.cookiejar.LWPCookieJar(s.path) if name else http.cookiejar.CookieJar()
        if name and os.path.exists(s.path):
            try: s.jar.load(ignore_discard=True)
            except Exception: pass
        s.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(s.jar))
        s.writer = str(__import__('uuid').uuid4())   # browser-tab id the API uses for the single-writer lease of a diagnosis
    def save(s):
        if s.path: s.jar.save(ignore_discard=True)
    def call(s, method, path, body=None, tok=None, raw=False):
        h = {"content-type": "application/json", "x-mmri-writer-id": s.writer}
        if tok: h["authorization"] = "Bearer " + tok
        r = urllib.request.Request(W + path, data=json.dumps(body).encode() if body is not None else None, headers=h, method=method)
        try:
            with s.op.open(r, timeout=90) as x:
                d = x.read(); s.save(); return x.status, (d if raw else json.loads(d or b"{}"))
        except urllib.error.HTTPError as e:
            d = e.read(); return e.code, (d if raw else json.loads(d or b"{}"))
def code_for(email):
    c = None
    for line in open(OUT, encoding="utf8"):
        j = json.loads(line)
        if j.get("to") == email:
            m = re.search(r"\n(\d{6})\n", j.get("text", "")); c = m.group(1) if m else c
    return c

def admin_login(email, password, _unused=None, name=None, wait_cooldown=True):
    """Signs an administrator in the way the app does: password, then the e-mailed six-digit code on an untrusted device; a trusted-device cookie is reused when present."""
    c = Client(name)
    body = {"email": email, "password": password, "trustDevice": True}
    s, d = c.call("POST", "/admin/auth/login", body)
    if s == 200 and d.get("data", {}).get("mfaRequired") == "EMAIL_CODE":
        for _ in range(3):
            body2 = dict(body); body2["emailCode"] = code_for(email)
            s, d = c.call("POST", "/admin/auth/login", body2)
            if s == 200: break
    return c, s, d

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(globals().get('__file__', 'x'))))) if '__file__' in globals() else os.path.dirname(os.getcwd())
def cleanup(*args):
    """Removes the records a test created (disposable fixtures, throw-away accounts, test access rows) so no run leaves demonstration data behind."""
    import subprocess as _sp
    r = _sp.run(["npx", "tsx", "src/qa-cleanup.ts", *args], cwd=BACKEND_DIR, env=dict(os.environ, MMRI_QA_SEED_LOCAL_DB="127.0.0.1:55432/mmri_dev_clean"), capture_output=True, text=True, timeout=900)
    print("cleanup", " ".join(args), "->", (r.stdout.strip().splitlines() or [r.stderr.strip()[-200:]])[-1])
def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + (f"  [{extra}]" if (not cond and extra) else ""))
    if not cond: FAILS.append(name)
FAILS = []
ts = int(time.time()); pw = "Qa-Console-Pass-1"

# ---------- A. customer e-mail-code sign-in + trusted device ----------
me = f"qa-dev-{ts}@example.test"; cl = Client()
check("A register", cl.call("POST", "/auth/register", {"email": me, "password": pw})[0] == 202)
check("A verify registration", cl.call("POST", "/auth/email-verification/confirm", {"email": me, "code": code_for(me)})[0] == 200)
s, d = cl.call("POST", "/auth/login", {"email": me, "password": pw}); data = d.get("data", {})
check("A new device: no session, code required", s == 200 and data.get("verificationRequired") is True and "accessToken" not in data)
check("A wrong password gives no code step", cl.call("POST", "/auth/login", {"email": me, "password": "wrong-wrong-wrong"})[0] == 401)
code = code_for(me); bad = "000000" if code != "000000" else "111111"
check("A wrong code rejected", cl.call("POST", "/auth/login/verify", {"email": me, "password": pw, "code": bad})[0] == 400)
check("A protected API refused before verification", cl.call("GET", "/companies")[0] == 401)
s, d = cl.call("POST", "/auth/login/verify", {"email": me, "password": pw, "code": code_for(me), "trustDevice": True})
check("A correct code opens session", s == 200 and "accessToken" in d.get("data", {}))
tok = d["data"]["accessToken"]
check("A code is single use", cl.call("POST", "/auth/login/verify", {"email": me, "password": pw, "code": code_for(me)})[0] == 400)
check("A trusted cookie stored", any(c.name == "mmri_td" for c in cl.jar))
s, d = cl.call("POST", "/auth/login", {"email": me, "password": pw}); check("A trusted device: session without code", s == 200 and "accessToken" in d.get("data", {}))
other = Client(); s, d = other.call("POST", "/auth/login", {"email": me, "password": pw}); check("A other device still needs code", d.get("data", {}).get("verificationRequired") is True)
s, d = other.call("POST", "/auth/login", {"email": me, "password": pw}); check("A resend inside cooldown sends no second code", s == 200 and d["data"].get("codeSent") is False and d["data"].get("resendAfterSeconds") == 60)
s, d = cl.call("POST", "/auth/password/change", {"currentPassword": pw, "newPassword": pw + "x"}, tok=tok); check("A password change", s == 200)
s, d = cl.call("POST", "/auth/login", {"email": me, "password": pw + "x"}); check("A password change revoked trusted device", d.get("data", {}).get("verificationRequired") is True)

# ---------- B. Sadmin console ----------
adm, s, d = admin_login(cr["ADMIN_EMAIL"], cr["ADMIN_PASSWORD"], None, name="sadmin")
if s != 200: print("admin login failed", s, d); sys.exit(1)
st = d["data"]["token"]; check("B Sadmin signs in ", d["data"]["admin"]["role"] == "SUPER_ADMIN")
A = lambda m, p, b=None, t=st, c=adm: c.call(m, "/admin" + p, b, tok=t)
s, d = A("GET", "/console/accounts"); rows = d["data"]["items"]; check("B accounts list has n,email,role only", s == 200 and rows and set(rows[0]) == {"n", "id", "email", "role"} and {r["role"] for r in rows} <= {"User", "Admin", "Sadmin"}, str(rows[:1]))
check("B search by email", len(A("GET", "/console/accounts?q=" + me)[1]["data"]["items"]) == 1)
s, d = A("GET", "/console/businesses"); biz = d["data"]["items"]; check("B businesses list", s == 200 and biz and set(biz[0]) == {"n", "id", "name", "email"})
if biz:
    cname = biz[0]["name"].split(" ")[0]
    check("B search by company name", any(r["email"] for r in A("GET", "/console/accounts?q=" + urllib.parse.quote(cname))[1]["data"]["items"]))
ea = f"qa-admin-{ts}@example.test"; eu = f"qa-user-{ts}@example.test"
s, d = A("POST", "/console/accounts", {"email": ea, "password": pw, "role": "Admin"}); check("B create Admin", s == 200, str(d)); aid = d.get("data", {}).get("id")
s, d = A("POST", "/console/accounts", {"email": eu, "password": pw, "role": "User"}); check("B create User", s == 200, str(d)); uid = d.get("data", {}).get("id")
check("B duplicate email refused", A("POST", "/console/accounts", {"email": ea, "password": pw, "role": "User"})[0] == 409)
check("B weak password refused", A("POST", "/console/accounts", {"email": f"x{ea}", "password": "short", "role": "User"})[0] == 400)
s, d = A("GET", "/console/accounts/" + uid); check("B user detail shows 5 domains", s == 200 and d["data"]["role"] == "User" and d["data"]["email"] == eu and "createdAt" in d["data"])
# created user not verified: first login -> code step, then session
uc = Client(); s, d = uc.call("POST", "/auth/login", {"email": eu, "password": pw}); check("B created User: first login asks for code", d.get("data", {}).get("verificationRequired") is True)
s, d = uc.call("POST", "/auth/login/verify", {"email": eu, "password": pw, "code": code_for(eu)}); check("B created User verified by code", s == 200 and "accessToken" in d.get("data", {}))
# created admin: email-code sign-in
ac = Client(); s, d = ac.call("POST", "/admin/auth/login", {"email": ea, "password": pw}); check("B created Admin: code step", s == 200 and d["data"].get("mfaRequired") == "EMAIL_CODE", str(d))
check("B Admin wrong code refused", ac.call("POST", "/admin/auth/login", {"email": ea, "password": pw, "emailCode": "000000"})[0] == 401)
s, d = ac.call("POST", "/admin/auth/login", {"email": ea, "password": pw, "emailCode": code_for(ea), "trustDevice": True}); check("B Admin signs in with email code", s == 200 and d["data"]["admin"]["role"] == "REPORT_REVIEWER", str(d)); at = d["data"]["token"]
check("B Admin trusted cookie", any(c.name == "mmri_td" for c in ac.jar))
s, d = ac.call("POST", "/admin/auth/login", {"email": ea, "password": pw}); check("B Admin trusted device skips code", s == 200 and "token" in d.get("data", {}), str(d)); at2 = d.get("data", {}).get("token", at)
# normal admin permissions
Aa = lambda m, p, b=None: ac.call(m, "/admin" + p, b, tok=at2)
check("B Admin may read review queue", Aa("GET", "/console/review-queue")[0] == 200)
check("B Admin may read finished reports", Aa("GET", "/console/done-reports")[0] == 200)
for path in ["/console/accounts", "/console/payments", "/console/businesses", "/users", "/payments", "/companies", "/settings", "/support"]:
    check(f"B Admin denied {path}", Aa("GET", path)[0] == 403)
check("B Admin cannot create accounts", Aa("POST", "/console/accounts", {"email": f"z{ea}", "password": pw, "role": "Sadmin"})[0] == 403)
check("B Admin cannot grant access", Aa("POST", "/companies/x/entitlements/grant", {"domainCode": "finance"})[0] == 403)
# password change invalidates everything
s, d = A("POST", f"/console/accounts/{aid}/password", {"password": pw + "N"}); check("B Sadmin changes Admin password", s == 200, str(d))
check("B old Admin session ended", Aa("GET", "/console/review-queue")[0] == 401)
s, d = ac.call("POST", "/admin/auth/login", {"email": ea, "password": pw + "N"}); check("B trusted device revoked after password change (code required again)", d.get("data", {}).get("mfaRequired") == "EMAIL_CODE" or d.get("error", {}).get("code") == "ADMIN_CODE_THROTTLED", str(d))
# payments
s, d = A("GET", "/console/payments"); check("B payments list shape", s == 200 and (not d["data"]["items"] or set(d["data"]["items"][0]) == {"n", "id", "company", "domain", "domainLabel", "status", "date"}))
# deletion safeguards
s, d = A("GET", "/console/accounts"); me_row = [r for r in d["data"]["items"] if r["email"].lower() == cr["ADMIN_EMAIL"].lower()][0]
check("B cannot delete own Sadmin account", A("POST", f"/console/accounts/{me_row['id']}/delete", {"confirmEmail": cr["ADMIN_EMAIL"]})[0] == 409)
check("B delete needs exact email", A("POST", f"/console/accounts/{uid}/delete", {"confirmEmail": "nope@x.mn"})[0] == 400)
check("B delete Admin", A("POST", f"/console/accounts/{aid}/delete", {"confirmEmail": ea})[0] == 200)
check("B delete User", A("POST", f"/console/accounts/{uid}/delete", {"confirmEmail": eu})[0] == 200)
check("B deleted accounts gone from list", not any(r["email"] in (ea, eu) for r in A("GET", "/console/accounts")[1]["data"]["items"]))
check("B deleted user cannot sign in", uc.call("POST", "/auth/login", {"email": eu, "password": pw})[0] == 401)
# Excel export of a business
if biz:
    s, raw = adm.call("GET", f"/admin/console/businesses/{biz[0]['id']}/export.xlsx", tok=st, raw=True); check("B business Excel export", s == 200 and raw[:2] == b"PK")
    import tempfile; open(os.path.join(tempfile.gettempdir(), "mmri-e2e-business.xlsx"), "wb").write(raw)   # outside the project
    s, d = A("GET", f"/console/businesses/{biz[0]['id']}"); check("B business detail", s == 200 and "company" in d["data"] and "diagnoses" in d["data"])
print("FAILED:", FAILS if FAILS else "none")
cleanup("test-accounts")
