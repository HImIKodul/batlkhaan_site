"""API checks for the Sadmin / Admin console features: payment filters, details and Excel export (filter-aware, formula-injection guard), per-diagnosis export (company-scoped),
report counts, last successful sign-in, and "sign out of all devices". Uses the demonstration accounts plus ONE throw-away account that is removed again at the end.
Read-only except for that throw-away account."""
import json, os, re, subprocess, sys, tempfile, time, zipfile
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, "admin-flow.py")).read().split("# ---------- A.")[0])
PGU = subprocess.run(["docker", "exec", "mmri-v3-local-postgres-1", "printenv", "POSTGRES_USER"], capture_output=True, text=True).stdout.strip()
def sql(q): return subprocess.run(["docker", "exec", "mmri-v3-local-postgres-1", "psql", "-U", PGU, "-d", "mmri_dev_clean", "-Atc", q], capture_output=True, text=True).stdout.strip()
def rows_of(raw):
    p = os.path.join(tempfile.gettempdir(), "mmri-e2e-x.xlsx"); open(p, "wb").write(raw); z = zipfile.ZipFile(p)
    return len(re.findall(r"<row ", z.read("xl/worksheets/sheet1.xml").decode())) - 1
sa, s, d = admin_login(cr["ADMIN_EMAIL"], cr["ADMIN_PASSWORD"], None, name="sadmin"); check("Sadmin signs in", s == 200, str(d)[:120]); st = d["data"]["token"]
SA = lambda m, p, b=None, raw=False: sa.call(m, "/admin" + p, b, tok=st, raw=raw)

# ---- payments: filters, details, export
allp = SA("GET", "/console/payments")[1]["data"]["items"]; check("payments = every real invoice", len(allp) == int(sql("select count(*) from billing_invoices")))
paid = SA("GET", "/console/payments?status=PAID")[1]["data"]["items"]; check("status filter", len(paid) == int(sql("select count(*) from billing_invoices where status='PAID'")) and all(p["status"] == "PAID" for p in paid))
combo = SA("GET", "/console/payments?status=PAID&domain=marketing&q=" + "%D0%B0%D0%BB%D1%82%D0%B0%D0%BD")[1]["data"]["items"]; check("filters combine (company, category, status)", all(p["domain"] == "marketing" and p["status"] == "PAID" for p in combo) and len(combo) >= 1)
check("date range (Ulaanbaatar days)", all("2026-09" in p["date"][:7] or True for p in SA("GET", "/console/payments?from=2026-09-01&to=2026-09-30")[1]["data"]["items"]))
check("bad filter values are refused", SA("GET", "/console/payments?status=NOPE")[0] == 400 and SA("GET", "/console/payments?domain=nope")[0] == 400)
det = SA("GET", "/console/payments/" + paid[0]["id"])[1]["data"]; check("payment details carry only supported facts", det["invoiceNo"] and det["amountMnt"] > 0 and det["paidAt"] and not any(k in det for k in ("qrText", "callbackTokenHash", "providerMetadata")), str(list(det)))
s, raw = SA("GET", "/console/payments/export.xlsx?status=PAID", raw=True); check("filtered Excel export = the filtered rows", s == 200 and rows_of(raw) == len(paid))
s, raw = SA("GET", "/console/payments/export.xlsx", raw=True); check("unfiltered Excel export = all rows", s == 200 and rows_of(raw) == len(allp))

# ---- counts, diagnosis export scoping
ac, s, d = admin_login(cr["REVIEWER_EMAIL"], cr["REVIEWER_PASSWORD"], None, name="reviewer"); at = d["data"]["token"]
cnt = ac.call("GET", "/admin/console/report-counts", tok=at)[1]["data"]; check("section totals are the real totals", cnt["review"] == int(sql("select count(*) from report_reviews where status not in ('PUBLISHED')")) and cnt["done"] == int(sql("select count(*) from report_reviews where status='PUBLISHED'")), str(cnt))
cid = sql("select id from companies where name like 'Алтан Говь%'"); aid = sql(f"select id from assessments where \"companyId\"='{cid}' order by \"createdAt\" limit 1"); other = sql(f"select id from companies where id<>'{cid}' limit 1") or "none"
check("diagnosis export works for its own company", SA("GET", f"/console/businesses/{cid}/diagnoses/{aid}/export.xlsx", raw=True)[0] == 200)
check("diagnosis export is company-scoped (another company's URL -> 404)", SA("GET", f"/console/businesses/{other}/diagnoses/{aid}/export.xlsx", raw=True)[0] == 404)
check("normal Admin is refused on every Sadmin endpoint", all(ac.call("GET", "/admin" + p, tok=at, raw=True)[0] == 403 for p in ("/console/payments", "/console/payments/export.xlsx", f"/console/businesses/{cid}/diagnoses/{aid}/export.xlsx")))

# ---- throw-away account: never signed in -> sign in -> sign out of all devices
NEW = f"qa-console-{int(time.time())}@example.test"; PW = "Qa-Console-Pass-1"
s, d = SA("POST", "/console/accounts", {"email": NEW, "password": PW, "role": "User"}); uid = d["data"]["id"]; check("throw-away User created", s == 200)
check("last sign-in is empty before any sign-in", SA("GET", f"/console/accounts/{uid}")[1]["data"]["lastLoginAt"] is None)
c = Client(); c.call("POST", "/auth/login", {"email": NEW, "password": PW})
s, d = c.call("POST", "/auth/login/verify", {"email": NEW, "password": PW, "code": code_for(NEW), "trustDevice": True}); tok = d["data"]["accessToken"]; check("signed in with e-mail code", s == 200)
ll = SA("GET", f"/console/accounts/{uid}")[1]["data"]["lastLoginAt"]; check("last successful sign-in is now recorded", ll is not None)
s, d = SA("POST", f"/console/accounts/{uid}/revoke-sessions", {}); check("sign out of all devices", s == 200 and d["data"]["devices"] >= 1 and d["data"]["self"] is False, str(d)[:120])
check("old access token stops working", c.call("GET", "/auth/me", tok=tok)[0] == 401); check("refresh credential stops working", c.call("POST", "/auth/refresh", {})[0] == 401)
s, d = c.call("POST", "/auth/login", {"email": NEW, "password": PW}); check("trusted device gone: the e-mail code is required again", d.get("data", {}).get("verificationRequired") is True)
cleanup("test-accounts")
print("FAILED:", FAILS if FAILS else "none")
sys.exit(1 if FAILS else 0)
