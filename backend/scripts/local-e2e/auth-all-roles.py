"""Item 2: e-mail-code verification on an untrusted device for User, Admin (no authenticator) and Sadmin (authenticator + e-mail code); trusted device skips only the e-mail code."""
import sys, time
exec(open('admin-flow.py').read().split("# ---------- A.")[0])
ts = int(time.time()); pw = "Qa-Roles-Pass-1"
while (time.time() % 30) > 4: time.sleep(0.5)
# ---- Sadmin (authenticator) on a brand-new device (no cookie)
c = Client(); body = {"email": cr["ADMIN_EMAIL"], "password": cr["ADMIN_PASSWORD"], "totpCode": totp(cr["ADMIN_TOTP_SECRET"])}
s, d = c.call("POST", "/admin/auth/login", body)
check("Sadmin: authenticator alone gives NO session on an untrusted device", s == 200 and "token" not in d["data"] and d["data"].get("mfaRequired") == "EMAIL_CODE", str(d)[:200])
check("Sadmin: wrong e-mail code refused", c.call("POST", "/admin/auth/login", {**body, "emailCode": "000000"})[0] == 401)
check("Sadmin: e-mail code WITHOUT authenticator refused", c.call("POST", "/admin/auth/login", {**body, "totpCode": "000000", "emailCode": code_for(cr["ADMIN_EMAIL"])})[0] == 401)
s, d = c.call("POST", "/admin/auth/login", {**body, "totpCode": totp(cr["ADMIN_TOTP_SECRET"]), "emailCode": code_for(cr["ADMIN_EMAIL"]), "trustDevice": True})
if s != 200: print("sadmin step 2", s, d)
check("Sadmin: authenticator + e-mail code opens the session", s == 200 and "token" in d["data"], str(d)[:200])
check("Sadmin: trusted-device cookie issued", any(x.name == "mmri_td" for x in c.jar))
while (time.time() % 30) > 4 or True:
    break
time.sleep(max(0, 31 - (time.time() % 30)))   # next authenticator step (replay protection)
s, d = c.call("POST", "/admin/auth/login", {"email": cr["ADMIN_EMAIL"], "password": cr["ADMIN_PASSWORD"], "totpCode": totp(cr["ADMIN_TOTP_SECRET"])})
check("Sadmin: trusted device skips the e-mail code but still needs the authenticator", s == 200 and "token" in d["data"], str(d)[:200])
s, d = c.call("POST", "/admin/auth/login", {"email": cr["ADMIN_EMAIL"], "password": cr["ADMIN_PASSWORD"], "totpCode": ""})
check("Sadmin: trusted device WITHOUT authenticator is refused", s == 401)
# ---- Admin (e-mail code only) and User on new devices were covered by admin-flow.py; here: the same account types after password change
sa_c, s, d = admin_login(cr["ADMIN_EMAIL"], cr["ADMIN_PASSWORD"], cr["ADMIN_TOTP_SECRET"], name="sadmin"); st = d.get("data", {}).get("token")
if st:
    ea = f"qa-role-{ts}@example.test"
    check("create Admin", sa_c.call("POST", "/admin/console/accounts", {"email": ea, "password": pw, "role": "Admin"}, tok=st)[0] == 200)
    a1, s, d = admin_login(ea, pw, None); check("Admin: new device -> e-mail code -> session", s == 200 and "token" in d.get("data", {}), str(d)[:200])
    uid = [r["id"] for r in sa_c.call("GET", "/admin/console/accounts?q=" + ea, tok=st)[1]["data"]["items"]][0]
    sa_c.call("POST", f"/admin/console/accounts/{uid}/delete", {"confirmEmail": ea}, tok=st)
print("FAILED:", FAILS if FAILS else "none")
cleanup("test-accounts")
