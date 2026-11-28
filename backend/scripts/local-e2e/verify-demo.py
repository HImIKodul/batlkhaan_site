"""Verifies the permanent demonstration data through the real APIs (read-only except one recall + republish of a demo report, which also proves the PDF pipeline).
Exactly three accounts, all three sign in, every customer-facing state exists, all five domains have valid published example reports, both administrator consoles are populated."""
import json, os, re, subprocess, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, "admin-flow.py")).read().split("# ---------- A.")[0])
PGU = subprocess.run(["docker", "exec", "mmri-v3-local-postgres-1", "printenv", "POSTGRES_USER"], capture_output=True, text=True).stdout.strip()
def sql(q): return subprocess.run(["docker", "exec", "mmri-v3-local-postgres-1", "psql", "-U", PGU, "-d", "mmri_dev_clean", "-Atc", q], capture_output=True, text=True).stdout.strip()
cid = cr["CUSTOMER_COMPANY_ID"]

# ---- three accounts only
check("exactly three accounts in the database", sql("select count(*) from users") == "3" and sql("select count(*) from admin_accounts") == "2")
check("no other company, QA record or review of another company", sql("select count(*) from companies") == "1" and sql("select count(*) from users where email like 'qa%' or email like 'erased%'") == "0")
# ---- all three authenticate with e-mail + password + e-mail code
sa, s, d = admin_login(cr["ADMIN_EMAIL"], cr["ADMIN_PASSWORD"], None); check("Sadmin signs in (e-mail code)", s == 200 and d["data"]["admin"]["role"] == "SUPER_ADMIN", str(d)[:160]); st = d["data"]["token"]
ac, s, d = admin_login(cr["REVIEWER_EMAIL"], cr["REVIEWER_PASSWORD"], None); check("Admin signs in (e-mail code)", s == 200 and d["data"]["admin"]["role"] == "REPORT_REVIEWER", str(d)[:160]); at = d["data"]["token"]
cu = Client(); s, d = cu.call("POST", "/auth/login", {"email": cr["CUSTOMER_EMAIL"], "password": cr["CUSTOMER_PASSWORD"]}); check("User: password accepted, e-mail code required", d.get("data", {}).get("verificationRequired") is True)
s, d = cu.call("POST", "/auth/login/verify", {"email": cr["CUSTOMER_EMAIL"], "password": cr["CUSTOMER_PASSWORD"], "code": code_for(cr["CUSTOMER_EMAIL"])}); check("User signs in (e-mail code)", s == 200, str(d)[:160]); ct = d["data"]["accessToken"]
SA = lambda m, p, b=None: sa.call(m, "/admin" + p, b, tok=st); AD = lambda m, p, b=None: ac.call(m, "/admin" + p, b, tok=at); CU = lambda p, raw=False: cu.call("GET", p, tok=ct, raw=raw)

# ---- Sadmin console
accts = SA("GET", "/console/accounts")[1]["data"]["items"]; check("ADMIN SHIT lists exactly the three accounts", sorted(a["role"] for a in accts) == ["Admin", "Sadmin", "User"], str(accts))
pays = SA("GET", "/console/payments")[1]["data"]["items"]; by_status = {}
for p in pays: by_status[p["status"]] = by_status.get(p["status"], 0) + 1
check("PAYMENTS has real invoices in every status (paid, pending, created, failed, cancelled)", all(by_status.get(k, 0) >= 1 for k in ("PAID", "PENDING", "CREATED", "FAILED", "CANCELLED")), str(by_status))
check("PAYMENTS covers all five categories", {p["domain"] for p in pays} == {"marketing", "it", "finance", "people", "operations"})
biz = SA("GET", "/console/businesses")[1]["data"]["items"]; check("DATA lists the one example company with an e-mail", len(biz) == 1 and biz[0]["email"] == cr["CUSTOMER_EMAIL"], str(biz))
det = SA("GET", f"/console/businesses/{biz[0]['id']}")[1]["data"]; labels = [g["label"] for g in det["diagnoses"]]
check("DATA shows dated diagnoses for all five categories (history + retake)", len(labels) >= 11 and all(re.search(r"\(\d{4}\.\d{2}\.\d{2}\)$", l) for l in labels) and {g["domain"] for g in det["diagnoses"]} == {"marketing", "it", "finance", "people", "operations"}, str(labels))
check("company information is complete", all(det["company"].get(k) not in (None, "") for k in ("name", "industry", "businessModel", "employeeCount", "companyAgeYears", "marketType", "country")) and "QA" not in det["company"]["name"], det["company"]["name"])
check("every diagnosis lists real questions with answers", all(g["answers"] and all(a["question"] and a["answer"] for a in g["answers"]) for g in det["diagnoses"]))
s, raw = sa.call("GET", f"/admin/console/businesses/{biz[0]['id']}/export.xlsx", tok=st, raw=True); check("business Excel export", s == 200 and raw[:2] == b"PK")

# ---- customer-facing states
asm = sql(f"select id||'|'||\"domainCode\"||'|'||status||'|'||coalesce((select status from report_reviews r where r.\"assessmentId\"=a.id),'-') from assessments a where \"companyId\"='{cid}' order by \"domainCode\",\"createdAt\"").splitlines()
rows = [r.split("|") for r in asm]
def of(dom): return [r for r in rows if r[1] == dom]
check("Marketing: two published reports + a retake IN PROGRESS", [r[2:] for r in of("marketing")] == [["COMPLETED", "PUBLISHED"], ["COMPLETED", "PUBLISHED"], ["IN_PROGRESS", "-"]], str(of("marketing")))
check("IT: published first report + retake awaiting review", [r[2:] for r in of("it")] == [["COMPLETED", "PUBLISHED"], ["COMPLETED", "AWAITING_REVIEW"]], str(of("it")))
check("Finance: published first report + retake awaiting review", [r[2:] for r in of("finance")] == [["COMPLETED", "PUBLISHED"], ["COMPLETED", "AWAITING_REVIEW"]], str(of("finance")))
check("People: two published reports", [r[2:] for r in of("people")] == [["COMPLETED", "PUBLISHED"], ["COMPLETED", "PUBLISHED"]], str(of("people")))
check("Operations: two published reports", [r[2:] for r in of("operations")] == [["COMPLETED", "PUBLISHED"], ["COMPLETED", "PUBLISHED"]], str(of("operations")))
ents = {}
for e in SA("GET", f"/companies/{cid}/entitlements")[1]["data"]["entitlements"]: ents.setdefault(e["domainCode"], []).append((e["status"], e["origin"]))
check("access states: admin grant used by the in-progress retake, paid access ready (not started) for People, none elsewhere", any(o == "ADMIN_GRANT" for _, o in ents.get("marketing", [])) and any(s_ == "ACTIVE" for s_, _ in ents.get("people", [])) and not any(s_ == "ACTIVE" for dom in ("it", "finance", "operations") for s_, _ in ents.get(dom, [])), str(ents))
for dom in ("marketing", "people", "operations"):
    last = [r for r in of(dom) if r[3] == "PUBLISHED"][-1][0]
    check(f"customer reads the published {dom} report + PDF", CU(f"/assessments/{last}/report", raw=True)[0] == 200 and CU(f"/assessments/{last}/report/pdf", raw=True)[0] == 200)
for dom in ("it", "finance"):
    waiting = [r for r in of(dom) if r[3] == "AWAITING_REVIEW"][0][0]; first = of(dom)[0][0]
    check(f"{dom}: new report is withheld, previous report is readable", CU(f"/assessments/{waiting}/report", raw=True)[0] == 409 and CU(f"/assessments/{first}/report", raw=True)[0] == 200)
inprog = [r for r in of("marketing") if r[2] == "IN_PROGRESS"][0][0]; check("in-progress diagnosis has saved answers", int(sql(f"select count(*) from answers where \"assessmentId\"='{inprog}'")) >= 10)

# ---- Admin console
q = AD("GET", "/console/review-queue")[1]["data"]["items"]; done = AD("GET", "/console/done-reports")[1]["data"]["items"]
check("ХЯНАХ ТАЙЛАН has a positive and an overdue countdown", len(q) == 2 and any(time.mktime(time.strptime(i["deadlineAt"][:19], "%Y-%m-%dT%H:%M:%S")) - time.timezone > time.time() for i in q) and any(time.mktime(time.strptime(i["deadlineAt"][:19], "%Y-%m-%dT%H:%M:%S")) - time.timezone < time.time() for i in q), str([(i["domain"], i["deadlineAt"]) for i in q]))
check("ДУУССАН ТАЙЛАН has the 8 published example reports", len(done) == 8 and {i["domain"] for i in done} == {"marketing", "it", "finance", "people", "operations"}, str(len(done)))
# recall + republish one report: no AI, PDF renders again
rid = [i["id"] for i in done if i["domain"] == "operations"][0]
check("recall a published report", AD("POST", f"/console/reviews/{rid}/recall", {})[0] == 200)
AD("POST", f"/reviews/{rid}/lock", {}); rev = AD("GET", f"/reviews/{rid}")[1]["data"]["revision"]
s, d = AD("POST", f"/reviews/{rid}/approve", {"baseRevision": rev}); check("republish it (PDF rendered again)", s == 200 and d["data"].get("status") == "PUBLISHED", str(d)[:200]); AD("POST", f"/reviews/{rid}/unlock", {})
check("no AI-sourced revision exists", sql("select count(*) from report_review_revisions where source not in ('MANUAL','GENERATED')") == "0")
check("database constraints are all validated", sql("select count(*) from pg_constraint where not convalidated") == "0")
print("FAILED:", FAILS if FAILS else "none")
sys.exit(1 if FAILS else 0)
