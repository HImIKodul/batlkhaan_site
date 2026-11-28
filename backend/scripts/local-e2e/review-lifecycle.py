"""Repeatable report-review lifecycle test for ALL FIVE domains. Every run builds its own disposable fixtures (new completed QA assessments + review rows), so it never depends on, or consumes, earlier test data."""
import json, os, re, subprocess, sys, threading, time
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, "admin-flow.py")).read().split("# ---------- A.")[0])
BACKEND = "/home/kirby/MMRI_RECOVERY_1f0e28e/backend"
REV_EMAIL, REV_PW = cr["REVIEWER_EMAIL"], cr["REVIEWER_PASSWORD"]   # the permanent demonstration Admin (nothing is created here)
qa = {"email": cr["CUSTOMER_EMAIL"], "password": cr["CUSTOMER_PASSWORD"]}
DOMAINS = ["marketing", "it", "finance", "people", "operations"]

# ---- disposable fixtures
env = dict(os.environ, MMRI_QA_SEED_LOCAL_DB="127.0.0.1:55432/mmri_dev_clean")
t0 = time.time(); out = subprocess.run(["npx", "tsx", "src/qa-review-fixtures.ts", "--hours-ago=2"], cwd=BACKEND, env=env, capture_output=True, text=True, timeout=900)
line = [l for l in out.stdout.splitlines() if l.startswith("FIXTURES ")]
if not line: print(out.stdout[-800:], out.stderr[-800:]); sys.exit("fixture generation failed")
fx = json.loads(line[0][9:]); FIX = fx["fixtures"]; print(f"fixtures {fx['runTag']} created in {time.time()-t0:.0f}s")

# ---- sessions (e-mail code for every account; trusted-device cookies are reused between runs)
sa, s, d = admin_login(cr["ADMIN_EMAIL"], cr["ADMIN_PASSWORD"], None, name="sadmin"); check("Sadmin signs in (e-mail code / trusted device)", s == 200, str(d)[:200]); st = d["data"]["token"]
ac, s, d = admin_login(REV_EMAIL, REV_PW, None, name="reviewer"); check("Admin signs in", s == 200, str(d)[:200]); at = d["data"]["token"]
AD = lambda m, p, b=None: ac.call(m, "/admin" + p, b, tok=at)
cu = Client("democustomer"); s, d = cu.call("POST", "/auth/login", {"email": qa["email"], "password": qa["password"]})
if d.get("data", {}).get("verificationRequired"): s, d = cu.call("POST", "/auth/login/verify", {"email": qa["email"], "password": qa["password"], "code": code_for(qa["email"]), "trustDevice": True})
ct = d["data"]["accessToken"]; CU = lambda p, raw=False: cu.call("GET", p, tok=ct, raw=raw)
BLOCK = ["/report", "/results", "/report-payload", "/report/pdf", "/report/pdf/metadata"]

# ---- queue: fresh fixtures are present, due in ~22 h, ordered by deadline
items = AD("GET", "/console/review-queue")[1]["data"]["items"]
mine = {i["domain"]: i for i in items if i["id"] in {v["reviewId"] for v in FIX.values()}}
check("all five fixtures are in the review queue", set(mine) == set(DOMAINS), str(list(mine)))
for dom, i in mine.items():
    left = (time.mktime(time.strptime(i["deadlineAt"][:19], "%Y-%m-%dT%H:%M:%S")) - time.timezone) - time.time()
    check(f"{dom}: deadline = submission + 24 h, ~22 h left", 21.8 * 3600 < left < 22.1 * 3600 and abs((time.mktime(time.strptime(i["deadlineAt"][:19], "%Y-%m-%dT%H:%M:%S")) - time.mktime(time.strptime(i["submittedAt"][:19], "%Y-%m-%dT%H:%M:%S"))) - 86400) < 2)

results = {}
for dom in DOMAINS:
    rid, asm = FIX[dom]["reviewId"], FIX[dom]["assessmentId"]; P = f"[{dom}] "
    for pth in BLOCK: check(P + f"customer blocked before publication {pth}", CU(f"/assessments/{asm}{pth}", raw=True)[0] == 409)
    s, d = AD("POST", f"/reviews/{rid}/draft-without-ai", {}); check(P + "draft built without AI", s in (200, 202), str(d)[:160])
    for _ in range(40):
        time.sleep(1); stt = AD("GET", f"/reviews/{rid}")[1]["data"]["review"]["status"]
        if stt in ("AWAITING_REVIEW", "IN_REVIEW"): break
    check(P + "draft ready", stt in ("AWAITING_REVIEW", "IN_REVIEW"), stt)
    check(P + "claim", AD("POST", f"/reviews/{rid}/claim", {})[0] == 200); check(P + "lock", AD("POST", f"/reviews/{rid}/lock", {})[0] == 200)
    meta = AD("GET", f"/reviews/{rid}")[1]["data"]; v0 = meta.get("validation") or {}
    check(P + "generated draft passes validation (canonical capability names intact)", v0.get("state") == "PASS", str(v0)[:300])
    claims = [c for c in meta["claims"] if c.get("editable") is not False]
    target = [c for c in claims if c["sectionId"] == "S06"][0]; new_text = target["text"] + " Туршилтын засвар."
    # plan: change one stage heading through the existing validated plan endpoint
    plan = AD("GET", f"/reviews/{rid}/annual-plan")[1]["data"]; stages = plan["plan"]["stages"]
    head = stages[0]["headingMn"]; newhead = (head[:70] + " (шинэчилсэн)") if len(head) > 70 else head + " (шинэчилсэн)"
    stages[0]["headingMn"] = newhead
    s, d = AD("PUT", f"/reviews/{rid}/annual-plan", {"baseRevision": plan["revision"], "reason": "Шууд засвар", "plan": {"stages": [{k: st_[k] for k in ("guide", "headingMn", "startDay", "durationDays", "dependencyNoteMn", "actions") if k in st_} for st_ in stages]}})
    check(P + "plan wording saved via the validated plan model", s == 200, str(d)[:240]); rev = d["data"]["revision"] if s == 200 else meta["revision"]
    s, d = AD("PUT", f"/reviews/{rid}/draft", {"baseRevision": rev, "reason": "Шууд засвар", "edits": [{"claimId": target["claimId"], "text": new_text}]}); check(P + "report text saved (private draft)", s == 200, str(d)[:200])
    m2 = AD("GET", f"/reviews/{rid}")[1]["data"]; check(P + "still private, edits persisted", m2["review"]["status"] == "IN_REVIEW" and any(c["text"] == new_text for c in m2["claims"]))
    check(P + "validation still PASS after the edits", (m2.get("validation") or {}).get("state") == "PASS", str(m2.get("validation"))[:300])
    for pth in BLOCK: check(P + f"customer still blocked after save {pth}", CU(f"/assessments/{asm}{pth}", raw=True)[0] == 409)
    deadline = m2["review"]["deadlineAt"]; rev = m2["revision"]
    # publish twice concurrently: exactly one publication, no corrupted state
    res = []
    def go(): res.append(AD("POST", f"/reviews/{rid}/approve", {"baseRevision": rev}))
    th = [threading.Thread(target=go) for _ in range(2)]; [t.start() for t in th]; [t.join() for t in th]
    codes = sorted(r[0] for r in res); pub = [r for r in res if r[0] == 200 and not r[1]["data"].get("alreadyPublished")]
    check(P + "concurrent ИЛГЭЭХ publishes exactly once", len(pub) == 1 and all(c in (200, 409) for c in codes), str([(r[0], str(r[1])[:90]) for r in res]))
    check(P + "customer report available", CU(f"/assessments/{asm}/report", raw=True)[0] == 200)
    s, pdf = CU(f"/assessments/{asm}/report/pdf", raw=True); check(P + "customer PDF available", s == 200 and pdf[:4] == b"%PDF")
    check(P + "PDF has 3 pages", len(re.findall(rb"/Type\s*/Page[^s]", pdf)) == 3)
    body = json.dumps(CU(f"/assessments/{asm}/report")[1], ensure_ascii=False)
    check(P + "online report = reviewed text and reviewed plan", "Туршилтын засвар." in body and "(шинэчилсэн)" in body)
    check(P + "in ДУУССАН, not in ХЯНАХ", any(i["id"] == rid for i in AD("GET", "/console/done-reports")[1]["data"]["items"]) and not any(i["id"] == rid for i in AD("GET", "/console/review-queue")[1]["data"]["items"]))
    check(P + "БУЦААХ recalls", AD("POST", f"/console/reviews/{rid}/recall", {})[0] == 200)
    for pth in BLOCK: check(P + f"customer blocked after recall {pth}", CU(f"/assessments/{asm}{pth}", raw=True)[0] == 409)
    r2 = AD("GET", f"/reviews/{rid}")[1]["data"]
    check(P + "recall keeps edits, plan, deadline and submission time", r2["review"]["deadlineAt"] == deadline and any(c["text"] == new_text for c in r2["claims"]) and r2["review"]["status"] == "IN_REVIEW")
    check(P + "back in ХЯНАХ with the original deadline", any(i["id"] == rid and i["deadlineAt"] == deadline for i in AD("GET", "/console/review-queue")[1]["data"]["items"]))
    AD("POST", f"/reviews/{rid}/lock", {}); rev = AD("GET", f"/reviews/{rid}")[1]["data"]["revision"]
    s, d = AD("POST", f"/reviews/{rid}/approve", {"baseRevision": rev}); check(P + "republish", s == 200 and d["data"].get("status") == "PUBLISHED", str(d)[:240])
    check(P + "customer sees the report again", CU(f"/assessments/{asm}/report", raw=True)[0] == 200)
n_ai = subprocess.run(["docker", "exec", "mmri-v3-local-postgres-1", "psql", "-U", subprocess.run(["docker", "exec", "mmri-v3-local-postgres-1", "printenv", "POSTGRES_USER"], capture_output=True, text=True).stdout.strip(), "-d", "mmri_dev_clean", "-Atc",
    "select count(*) from report_review_revisions where \"reviewId\" like '" + fx["runTag"] + "%' and source not in ('MANUAL','GENERATED')"], capture_output=True, text=True).stdout.strip()
check("no AI-sourced revision exists for this run", n_ai == "0", n_ai)
cleanup("fixtures", "--run-tag=" + fx["runTag"])   # the disposable assessments, reviews and report files of this run
print("FAILED:", FAILS if FAILS else "none")
sys.exit(1 if FAILS else 0)
