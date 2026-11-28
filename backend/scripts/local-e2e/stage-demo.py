"""Stages the permanent demonstration data for the example User (all customer-facing states) and the normal Admin (review queue with positive and overdue countdowns,
published reports to recall/republish). Deterministic, local only, no AI call. Run AFTER `qa-cleanup.ts reset-demo`, `npm run qa:seed` and the account rename.
   python3 stage-demo.py            (steps: basic info, dates, reviews, in-progress diagnosis)"""
import json, os, subprocess, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, "admin-flow.py")).read().split("# ---------- A.")[0])
BACKEND = os.path.dirname(os.path.dirname(HERE))
PGU = subprocess.run(["docker", "exec", "mmri-v3-local-postgres-1", "printenv", "POSTGRES_USER"], capture_output=True, text=True).stdout.strip()
def sql(q): return subprocess.run(["docker", "exec", "mmri-v3-local-postgres-1", "psql", "-U", PGU, "-d", "mmri_dev_clean", "-Atc", q], capture_output=True, text=True).stdout.strip()
cid = cr["CUSTOMER_COMPANY_ID"]
def customer():
    cu = Client("democustomer"); s, d = cu.call("POST", "/auth/login", {"email": cr["CUSTOMER_EMAIL"], "password": cr["CUSTOMER_PASSWORD"]})
    if d.get("data", {}).get("verificationRequired"): s, d = cu.call("POST", "/auth/login/verify", {"email": cr["CUSTOMER_EMAIL"], "password": cr["CUSTOMER_PASSWORD"], "code": code_for(cr["CUSTOMER_EMAIL"]), "trustDevice": True})
    return cu, d["data"]["accessToken"]

# ---- 1. company information: all 20 basic questions answered through the real API
cu, ct = customer()
basic = json.loads(subprocess.run(["npx", "tsx", os.path.join(HERE, "basic-info.mts")], cwd=BACKEND, capture_output=True, text=True).stdout)
s, d = cu.call("PUT", f"/companies/{cid}/profile-answers", basic, tok=ct); check("company information complete (20 basic answers saved)", s == 200, str(d)[:200])

# ---- 2. realistic dates: the two reports that WAIT for review were completed recently (IT: 3 h ago = positive countdown, Finance: 29 h ago = overdue)
rows = [r.split("|") for r in sql("select id,\"domainCode\" from assessments order by \"domainCode\",\"completedAt\"").splitlines()]
by = {}
for i, dom in rows: by.setdefault(dom, []).append(i)
WAIT = {"it": 3, "finance": 29}
for dom, h in WAIT.items():
    a = by[dom][1]; ts = f"now() - interval '{h} hours'"
    sql(f"update assessments set \"completedAt\"={ts}, \"startedAt\"={ts}-interval '75 minutes', \"createdAt\"={ts}-interval '75 minutes' where id='{a}'")
    sql(f"update billing_invoices set \"createdAt\"={ts}-interval '2 hours', \"paidAt\"={ts}-interval '2 hours', \"callbackReceivedAt\"={ts}-interval '2 hours' where \"companyId\"='{cid}' and \"domainCode\"='{dom}' and \"planCode\"='RETAKE'")
    sql(f"update company_entitlements set \"startsAt\"={ts}-interval '2 hours' where \"companyId\"='{cid}' and \"domainCode\"='{dom}' and \"planCode\"='RETAKE'")

# ---- 3. review rows: 8 published reports (history) + the two waiting ones
PUB = [("marketing", 0), ("marketing", 1), ("people", 0), ("people", 1), ("operations", 0), ("operations", 1), ("finance", 0), ("it", 0)]
WAITING = [("it", 1), ("finance", 1)]
for dom, n in PUB + WAITING:
    a = by[dom][n]
    sql(f"insert into report_reviews (id,\"assessmentId\",\"companyId\",\"domainCode\",status,\"submittedAt\",\"deadlineAt\",version,\"currentRevision\",\"remindersSent\",\"createdAt\",\"updatedAt\") select 'demo_{dom}_{n+1}', a.id, a.\"companyId\", a.\"domainCode\", 'SUBMITTED', a.\"completedAt\", a.\"completedAt\" + interval '24 hours', 0, 0, '{{}}', now(), now() from assessments a where a.id='{a}' on conflict do nothing")
ac, s, d = admin_login(cr["REVIEWER_EMAIL"], cr["REVIEWER_PASSWORD"], None, name="reviewer"); check("reviewer signs in", s == 200, str(d)[:200]); at = d["data"]["token"]
AD = lambda m, p, b=None: ac.call(m, "/admin" + p, b, tok=at)
def status(r): return AD("GET", f"/reviews/{r}")[1]["data"]["review"]["status"]
for dom, n in PUB + WAITING:
    rid = f"demo_{dom}_{n+1}"
    if status(rid) == "SUBMITTED":
        AD("POST", f"/reviews/{rid}/draft-without-ai", {})
        for _ in range(60):
            time.sleep(1)
            if status(rid) in ("AWAITING_REVIEW", "IN_REVIEW"): break
    if (dom, n) in PUB and status(rid) != "PUBLISHED":
        AD("POST", f"/reviews/{rid}/claim", {}); AD("POST", f"/reviews/{rid}/lock", {})
        rev = AD("GET", f"/reviews/{rid}")[1]["data"]["revision"]
        s, d = AD("POST", f"/reviews/{rid}/approve", {"baseRevision": rev}); check(f"{rid} published", s == 200, str(d)[:200]); AD("POST", f"/reviews/{rid}/unlock", {})
    else: print(rid, status(rid))

# ---- 4. Marketing retake IN PROGRESS: access granted by the Sadmin (no invoice), started and partly answered through the real customer API
inprog = sql(f"select id from assessments where \"companyId\"='{cid}' and \"domainCode\"='marketing' and status='IN_PROGRESS' limit 1")
cu, ct = customer()
if not inprog:
    sa, s, d = admin_login(cr["ADMIN_EMAIL"], cr["ADMIN_PASSWORD"], None, name="sadmin"); check("Sadmin signs in", s == 200, str(d)[:160]); st = d["data"]["token"]
    if not sql(f"select 1 from assessments where \"companyId\"='{cid}' and \"domainCode\"='marketing' and status in ('PROFILE_PENDING','PAUSED')"):
        s, d = sa.call("POST", f"/admin/companies/{cid}/entitlements/grant", {"domainCode": "marketing"}, tok=st); check("Marketing retake access granted by the Sadmin", s == 200, str(d)[:200])
        s, a = cu.call("POST", f"/companies/{cid}/assessments", {"domainCode": "marketing"}, tok=ct); check("retake created", s == 201, str(a)[:200]); aid = a["data"]["id"]
        cu.call("POST", f"/assessments/{aid}/respondents", {"roleExternalId": "R01", "displayName": "Компанийн захирал"}, tok=ct)
    else: aid = sql(f"select id from assessments where \"companyId\"='{cid}' and \"domainCode\"='marketing' and status in ('PROFILE_PENDING','PAUSED') limit 1")
    pa = cu.call("GET", f"/companies/{cid}", tok=ct)[1]["data"]["profile"]["assessmentProfileAnswers"]
    for _ in range(30):
        s, p = cu.call("POST", f"/assessments/{aid}/start", {"mode": "QUICK", "profileAnswers": pa}, tok=ct)
        if s == 200: break
        time.sleep(10)   # another writer lease from an earlier attempt expires after ~2 minutes
    check("retake started", s == 200, str(p)[:200])
else: aid = inprog
resp = sql(f"select id from assessment_respondents where \"assessmentId\"='{aid}' limit 1")
# take over the writer lease the way the web app does after a closed tab: resume the IN_PROGRESS diagnosis
rev0 = cu.call("GET", f"/assessments/{aid}", tok=ct)[1]["data"]["assessmentRevision"]
for _ in range(20):
    s, p = cu.call("POST", f"/assessments/{aid}/resume", {"expectedAssessmentRevision": rev0}, tok=ct)
    if s == 200: break
    time.sleep(10)   # a lease held by an earlier run expires after ~2 minutes
s, p = cu.call("GET", f"/assessments/{aid}/next-question", tok=ct)
n = int(sql(f"select count(*) from answers where \"assessmentId\"='{aid}'") or 0)
while s == 200 and n < 18 and p["data"].get("nextQuestion"):
    q = p["data"]["nextQuestion"]; opts = [o for o in q["options"] if o["state"] not in ("DNK", "N_A_CLAIM")] or q["options"]
    pick = max(opts, key=lambda o: (o.get("score") if o.get("score") is not None else 0, o["optionIndex"]))
    s, r = cu.call("POST", f"/assessments/{aid}/answers", {"questionId": q["id"], "optionIndex": pick["optionIndex"], "questionIssueId": p["data"]["questionIssueId"], "expectedAssessmentRevision": p["data"]["assessmentRevision"], "clientRequestId": str(__import__("uuid").uuid4()), **({"respondentId": resp} if resp else {})}, tok=ct)
    if s != 200: print("answer failed", s, str(r)[:200]); break
    n += 1; s, p = cu.call("GET", f"/assessments/{aid}/next-question", tok=ct)
check("Marketing retake is IN PROGRESS with saved answers", sql(f"select status from assessments where id='{aid}'") == "IN_PROGRESS" and n >= 10, f"{n} answers")
print("FAILED:", FAILS if FAILS else "none")
