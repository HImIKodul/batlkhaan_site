#!/usr/bin/env python3
"""Question-bank release gate (Phase 2.7). Deterministic checks only; it does NOT certify language quality or semantic uniqueness.
Usage:
  question-bank-gate.py bundle   <bundle.json> [--expect-sha256 HEX]
  question-bank-gate.py workbook <bundle.json> <workbook.xlsx>      (needs openpyxl; compares a candidate workbook to the live bundle)
  question-bank-gate.py selftest <bundle.json>                      (mutates an in-memory copy and asserts the gate catches each defect)
Exit code 0 = no errors, 1 = errors, 2 = usage. Output: JSON on stdout."""
import sys, json, re, hashlib, copy, collections

STATES_OK = {"SCORED", "DNK", "N_A_CLAIM", "UNAVAILABLE", "PARTIAL_APPLICABILITY", "MOSTLY_APPLICABLE", "APPLICABLE"}
ID_RE = re.compile(r"^([A-Z]+)-C(\d\d)-D(\d\d)-Q([1-4])$")
APPLIC = re.compile(r"хамаар")

def check_bundle(b, raw_sha=None, expect_sha=None):
    E = collections.defaultdict(list)
    def err(code, detail): E[code].append(detail)
    qs = b["questions"]; cats = {c["ID"] for c in b["categories"]}; cells = {t["ID"] for t in b["cellTemplates"]}
    ids = [q["questionId"] for q in qs]
    if len(ids) != len(set(ids)): 
        for i, n in collections.Counter(ids).items():
            if n > 1: err("DUPLICATE_ID", i)
    per = collections.Counter(q["categoryId"] for q in qs)
    exp_cats = len(cats)
    if len(qs) != exp_cats * 192: err("QUESTION_COUNT", f"{len(qs)} != {exp_cats}*192")
    for c in cats:
        if per.get(c, 0) != 192: err("PER_CAPABILITY_COUNT", f"{c}={per.get(c,0)}")
    prefixes = set()
    for q in qs:
        m = ID_RE.match(q["questionId"])
        if not m: err("ID_FORMAT", q["questionId"]); continue
        prefixes.add(m.group(1))
        cat = f"{m.group(1)}-C{m.group(2)}"
        if cat != q["categoryId"]: err("CATEGORY_MAPPING", f"{q['questionId']} -> {q['categoryId']}")
        if q["categoryId"] not in cats: err("INVALID_REFERENCE", f"{q['questionId']} category {q['categoryId']}")
        if q["cellId"] not in cells: err("INVALID_REFERENCE", f"{q['questionId']} cell {q['cellId']}")
        if int(m.group(4)) != q["path"]: err("PATH_MISMATCH", q["questionId"])
        opts = q.get("explicitOptions") or []
        if opts:
            if [o["optionIndex"] for o in opts] != list(range(1, len(opts) + 1)): err("OPTION_INDEX", q["questionId"])
            if len(opts) != len(q.get("optionsMn", [])): err("OPTION_COUNT_MISMATCH", q["questionId"])
            if sum(1 for o in opts if o["state"] == "DNK") != 1: err("DNK_COUNT", q["questionId"])
            for o in opts:
                if o["state"] not in STATES_OK: err("ANSWER_STATE", f"{q['questionId']}#{o['optionIndex']}={o['state']}")
                if o["state"] == "SCORED" and not (isinstance(o["score"], (int, float)) and 0 <= o["score"] <= 100): err("SCORE_RANGE", f"{q['questionId']}#{o['optionIndex']}")
                if o["state"] != "SCORED" and o["score"] is not None and o["state"] in ("DNK", "N_A_CLAIM", "UNAVAILABLE"): err("NONSCORING_STATE_HAS_SCORE", f"{q['questionId']}#{o['optionIndex']}")
        # gate rule (cell C01 = applicability gate)
        if q["cellId"] == "C01":
            states = [o["state"] for o in opts]
            if states[-2:] != ["N_A_CLAIM", "DNK"] or "SCORED" in states: err("GATE_ANSWER_PATTERN", f"{q['questionId']} {states}")
            if not APPLIC.search(q["textMn"]): err("GATE_STEM_NOT_APPLICABILITY", f"{q['questionId']}: {q['textMn'][:90]}")
        else:
            if opts and opts[0]["state"] != "SCORED" and any(o["state"] == "UNAVAILABLE" for o in opts) and q["path"] <= 2 and APPLIC.search(opts[0]["labelMn"] or ""):
                err("NONGATE_QUESTION_WITH_APPLICABILITY_ANSWERS", q["questionId"])
        for t in q.get("secondaryTargets", []):
            if t["targetCellId"] not in cells: err("INVALID_REFERENCE", f"{q['questionId']} secondary {t['targetCellId']}")
    if len(prefixes) > 1: err("MIXED_DOMAIN_PREFIXES", sorted(prefixes))
    if expect_sha is not None and raw_sha != expect_sha: err("BUNDLE_CHECKSUM_MISMATCH", f"{raw_sha} != {expect_sha}")
    return E

def check_workbook(b, wb_path):
    import openpyxl
    E = collections.defaultdict(list)
    def err(c, d): E[c].append(d)
    live = {q["questionId"]: q for q in b["questions"]}
    wb = openpyxl.load_workbook(wb_path, read_only=True)
    cats = {r[1]: r[2] for r in wb["64 Categories"].iter_rows(min_row=2, values_only=True) if r[1]}
    if len(cats) != len(b["categories"]): err("CATEGORY_SHEET_COUNT", len(cats))
    rows = [list(r) for r in wb["Questions & Answers"].iter_rows(min_row=2, values_only=True)]
    ids = [r[0] for r in rows]
    if len(rows) != len(live): err("QUESTION_COUNT", f"{len(rows)} != {len(live)}")
    for i, n in collections.Counter(ids).items():
        if n > 1: err("DUPLICATE_ID", i)
    if set(ids) != set(live): err("ID_SET_DIFFERS_FROM_BUNDLE", f"missing={len(set(live)-set(ids))} extra={len(set(ids)-set(live))}")
    for qid, cat, cname, stem, ans in rows:
        q = live.get(qid)
        if not q: continue
        if cat != q["categoryId"]: err("CATEGORY_MAPPING", f"{qid}: {cat}")
        if cats.get(cat) != cname: err("CATEGORY_NAME_MISMATCH", qid)
        labels = [re.sub(r"^\d+\.\s*", "", x).strip() for x in (ans or "").split("\n") if x.strip()]
        if len(labels) != len(q["optionsMn"]): err("OPTION_COUNT_CHANGED", f"{qid}: {len(labels)} vs {len(q['optionsMn'])}")
        if q["cellId"] == "C01":
            if not APPLIC.search(stem or ""): err("GATE_STEM_NOT_APPLICABILITY", f"{qid}: {(stem or '')[:90]}")
            if labels and APPLIC.search(labels[0]) and not APPLIC.search(stem or ""): err("PERFORMANCE_STEM_WITH_APPLICABILITY_ANSWERS", qid)
    return E

def selftest(b):
    base = check_bundle(b)
    res = {"baseline_errors": {k: len(v) for k, v in base.items()}}
    muts = {}
    def m(name, fn, code):
        c = copy.deepcopy(b); fn(c); e = check_bundle(c); muts[name] = {"expected": code, "caught": code in e}
    m("duplicate id", lambda c: c["questions"][5].__setitem__("questionId", c["questions"][4]["questionId"]), "DUPLICATE_ID")
    m("missing question", lambda c: c["questions"].pop(), "QUESTION_COUNT")
    m("wrong capability mapping", lambda c: c["questions"][10].__setitem__("categoryId", c["categories"][1]["ID"]), "CATEGORY_MAPPING")
    m("broken answer state", lambda c: c["questions"][300]["explicitOptions"][0].__setitem__("state", "BOGUS"), "ANSWER_STATE")
    m("score out of range", lambda c: next(o for q in c["questions"][300:400] for o in q["explicitOptions"] if o["state"] == "SCORED").__setitem__("score", 250), "SCORE_RANGE")
    m("invalid cell reference", lambda c: c["questions"][20].__setitem__("cellId", "C99"), "INVALID_REFERENCE")
    def d01(c):
        q = next(q for q in c["questions"] if q["cellId"] == "C01" and q["path"] == 1)
        q["textMn"] = "Мөнгөн хөрөнгийн мэдээллийг цаг тухайд нь харах ажлыг тогтмол хийдэг үү?"  # the known F07 performance-style stem
    m("D01 performance-style gate stem (F07 regression)", d01, "GATE_STEM_NOT_APPLICABILITY")
    def noDnk(c): 
        q = c["questions"][400]; q["explicitOptions"][-1]["state"] = "SCORED"; q["explicitOptions"][-1]["score"] = 50
    m("DNK removed", noDnk, "DNK_COUNT")
    sha = hashlib.sha256(json.dumps(b, sort_keys=True).encode()).hexdigest()
    e = check_bundle(b, raw_sha=sha, expect_sha="0" * 64); muts["checksum mismatch"] = {"expected": "BUNDLE_CHECKSUM_MISMATCH", "caught": "BUNDLE_CHECKSUM_MISMATCH" in e}
    res["mutations"] = muts; res["all_caught"] = all(v["caught"] for v in muts.values()) and not base
    return res

def main():
    a = sys.argv[1:]
    if len(a) < 2: print(__doc__); sys.exit(2)
    mode, bp = a[0], a[1]
    raw = open(bp, "rb").read(); b = json.loads(raw); sha = hashlib.sha256(raw).hexdigest()
    if mode == "bundle":
        exp = a[a.index("--expect-sha256") + 1] if "--expect-sha256" in a else None
        E = check_bundle(b, sha, exp); out = {"bundle": bp, "sha256": sha, "errors": {k: len(v) for k, v in E.items()}, "samples": {k: v[:3] for k, v in E.items()}}
    elif mode == "workbook":
        E = check_workbook(b, a[2]); out = {"workbook": a[2], "errors": {k: len(v) for k, v in E.items()}, "samples": {k: v[:3] for k, v in E.items()}}
    elif mode == "selftest":
        out = selftest(b); print(json.dumps(out, ensure_ascii=False, indent=1)); sys.exit(0 if out["all_caught"] else 1)
    else: sys.exit(2)
    print(json.dumps(out, ensure_ascii=False, indent=1)); sys.exit(1 if out["errors"] else 0)
main()
