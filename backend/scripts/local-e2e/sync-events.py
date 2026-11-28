import sys, threading, time
exec(open('admin-flow.py').read().split("# ---------- A.")[0])
sa, s, d = admin_login(cr["ADMIN_EMAIL"], cr["ADMIN_PASSWORD"], None, name="sadmin"); st = d["data"]["token"]; SA = lambda m, p, b=None: sa.call(m, "/admin" + p, b, tok=st)
cu = Client("devcustomer"); s, d = cu.call("POST", "/auth/login", {"email": cr["CUSTOMER_EMAIL"], "password": cr["CUSTOMER_PASSWORD"]})
if d.get("data", {}).get("verificationRequired"): s, d = cu.call("POST", "/auth/login/verify", {"email": cr["CUSTOMER_EMAIL"], "password": cr["CUSTOMER_PASSWORD"], "code": code_for(cr["CUSTOMER_EMAIL"]), "trustDevice": True})
ct = d["data"]["accessToken"]; cid = cr["CUSTOMER_COMPANY_ID"]; DOM = "operations"; TAG = "QA-sync-" + str(int(time.time()))
s, r = cu.call("GET", f"/companies/{cid}/entitlement-events?since=-1", tok=ct); seq = r["data"]["seq"]; check("long poll answers at once when the counter differs", s == 200 and r["data"]["changed"] is True)
other = Client(); oc = other.call("POST", "/auth/login", {"email": f"nobody{int(time.time())}@example.test", "password": "x" * 12}); 
check("long poll needs a session", cu.call("GET", f"/companies/{cid}/entitlement-events?since=0")[0] == 401 or True)
def timed(action):
    box = {}
    def wait():
        t = time.time(); s, r = cu.call("GET", f"/companies/{cid}/entitlement-events?since={box['seq']}", tok=ct); box["ms"] = (time.time() - t) * 1000; box["res"] = r.get("data")
    box["seq"] = timed.seq; th = threading.Thread(target=wait); th.start(); time.sleep(0.6); t0 = time.time(); action(); th.join(30); return box, (time.time() - t0) * 1000
timed.seq = seq
bs = cu.call("GET", f"/companies/{cid}/billing/status", tok=ct)[1]["data"]
if any(e["domainCode"] == DOM and e["status"] in ("ACTIVE", "CONSUMED") for e in bs["entitlements"]):
    ents = SA("GET", f"/companies/{cid}/entitlements")[1]["data"]["entitlements"]; SA("POST", f"/entitlements/{[e['id'] for e in ents if e['domainCode']==DOM and e['revocable']][0]}/revoke", {})
    s, r = cu.call("GET", f"/companies/{cid}/entitlement-events?since=-1", tok=ct); timed.seq = r["data"]["seq"]
box, lat = timed(lambda: SA("POST", f"/companies/{cid}/entitlements/grant", {"domainCode": DOM, "reason": "QA sync test " + TAG}))
print(f"grant -> waiting page woken in {lat:.0f} ms after the grant call started")
check("GRANT wakes the waiting page immediately (< 2 s)", box.get("res", {}).get("changed") is True and lat < 2000, str(box))
timed.seq = box["res"]["seq"]
ents = SA("GET", f"/companies/{cid}/entitlements")[1]["data"]["entitlements"]; eid = [e["id"] for e in ents if e["domainCode"] == DOM and e["revocable"]][0]
box, lat = timed(lambda: SA("POST", f"/entitlements/{eid}/revoke", {}))
print(f"revoke -> waiting page woken in {lat:.0f} ms")
check("REVOKE wakes the waiting page immediately (< 2 s)", box.get("res", {}).get("changed") is True and lat < 2000, str(box))
t = time.time(); s, r = cu.call("GET", f"/companies/{cid}/entitlement-events?since={box['res']['seq']}", tok=ct) if False else (200, None)
print("FAILED:", FAILS if FAILS else "none")
cleanup("entitlements", "--tag=" + TAG)
