"""Sign-in for ALL THREE roles (Sadmin, Admin, User) is the same: e-mail + password -> six-digit e-mail code -> access; a trusted device skips the code. No authenticator anywhere.
Uses the three permanent demonstration accounts; the trusted-device rows this test creates are removed again at the end."""
import atexit, json, os, re, subprocess, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, "admin-flow.py")).read().split("# ---------- A.")[0])
PGU = subprocess.run(["docker", "exec", "mmri-v3-local-postgres-1", "printenv", "POSTGRES_USER"], capture_output=True, text=True).stdout.strip()


def sql(q):
    return subprocess.run(["docker", "exec", "mmri-v3-local-postgres-1", "psql", "-U", PGU, "-d", "mmri_dev_clean", "-Atc", q], capture_output=True, text=True).stdout.strip()


started = sql("select now()")
atexit.register(lambda: sql(f"delete from trusted_devices where \"createdAt\" >= '{started}'::timestamp - interval '1 minute'"))   # also when a check aborts the run
OUT = os.path.join(BACKEND_DIR, ".mock-mailbox", "outbox.jsonl")


def last_mail(email):
    m = None
    for line in open(OUT, encoding="utf8"):
        j = json.loads(line)
        if j.get("to") == email:
            m = j
    return m


def tok(d):
    return d.get("data", {}).get("token") or d.get("data", {}).get("accessToken")


ROLES = [("Sadmin", cr["ADMIN_EMAIL"], cr["ADMIN_PASSWORD"], "/admin/auth/login"),
         ("Admin", cr["REVIEWER_EMAIL"], cr["REVIEWER_PASSWORD"], "/admin/auth/login"),
         ("User", cr["CUSTOMER_EMAIL"], cr["CUSTOMER_PASSWORD"], "/auth/login")]
for role, email, pw, path in ROLES:
    admin = role != "User"
    if role == "Admin":
        time.sleep(65)   # the administrator sign-in rate limit (per minute) stays in force; the test simply spaces its requests
    verify = path if admin else "/auth/login/verify"
    c = Client()
    # 1. password only: no session, a code is requested
    s, d = c.call("POST", path, {"email": email, "password": pw, "trustDevice": True} if admin else {"email": email, "password": pw})
    need = d.get("data", {}).get("mfaRequired") == "EMAIL_CODE" if admin else d.get("data", {}).get("verificationRequired") is True
    check(f"{role}: password alone gives NO session, an e-mail code is required", s == 200 and need and not tok(d), str(d)[:160])
    mail = last_mail(email)
    mins = 5 if admin else 10
    check(f"{role}: the mailed code is six digits and the stated lifetime ({mins} min) is the real one",
          bool(mail) and re.search(r"\b\d{6}\b", mail["text"]) is not None and f"{mins} минут" in mail["text"] and d["data"].get("expiresInMinutes") == mins, str(mail)[:140] if mail else "no mail")
    if admin:
        check(f"{role}: any extra code field is ignored (only the e-mailed code counts)", tok(c.call("POST", path, {"email": email, "password": pw, "totpCode": "123456"})[1]) is None)
    # 2. wrong code refused
    wrong = {"email": email, "password": pw, "emailCode": "000000"} if admin else {"email": email, "password": pw, "code": "000000"}
    s, d = c.call("POST", verify, wrong)
    check(f"{role}: a wrong code is refused", s in (400, 401) and not tok(d), f"{s} {str(d)[:100]}")
    # 3. right code -> access, trusted device saved
    code = re.search(r"\b(\d{6})\b", last_mail(email)["text"]).group(1)
    good = {"email": email, "password": pw, "emailCode": code, "trustDevice": True} if admin else {"email": email, "password": pw, "code": code, "trustDevice": True}
    s, d = c.call("POST", verify, good)
    check(f"{role}: the right code opens the session", s == 200 and bool(tok(d)), f"{s} {str(d)[:100]}")
    again = {"email": email, "password": pw, "emailCode": code} if admin else {"email": email, "password": pw, "code": code}
    check(f"{role}: the code is single-use", c.call("POST", verify, again)[0] in (400, 401, 429))
    check(f"{role}: a trusted-device credential was saved", any(x.name == "mmri_td" for x in c.jar))
    # 4. trusted device: no code
    s, d = c.call("POST", path, {"email": email, "password": pw})
    check(f"{role}: a trusted device does not repeat the e-mail verification", s == 200 and bool(tok(d)), str(d)[:120])
    # 5. another device is not trusted
    s, d = Client().call("POST", path, {"email": email, "password": pw})
    check(f"{role}: another (untrusted) device still needs a code", s in (200, 429) and not tok(d))
print("FAILED:", FAILS if FAILS else "none")
sys.exit(1 if FAILS else 0)
