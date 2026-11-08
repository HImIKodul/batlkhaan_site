#!/usr/bin/env python3
"""Build the repaired 61,440-question runtime bundles beside the old ones.

Source of truth: integration/final_61440/MMRI_FINAL_61440_QUESTION_BANK.csv
Only question wording (textMn / canonical `question`) is replaced, matched by exact
question ID. IDs, options, scores, states, routing, weights and policies are copied
untouched from the previous accepted bundles, which stay in place for rollback.
Usage: python3 -I scripts/build-final-61440-repaired-bundles.py   (run from backend/)
"""
import csv, hashlib, json, os, sys

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV = os.path.join(BACKEND, "integration/final_61440/MMRI_FINAL_61440_QUESTION_BANK.csv")
M = os.path.join(BACKEND, "methodology")
DATE = "2026-10-29"

def sha_bytes(b): return hashlib.sha256(b).hexdigest()
def dumps(o): return json.dumps(o, ensure_ascii=False, separators=(",", ":"))

rows = list(csv.DictReader(open(CSV, encoding="utf-8-sig", newline="")))
csv_sha = sha_bytes(open(CSV, "rb").read())
by_dom = {}
for r in rows:
    by_dom.setdefault(r["DomainCode"], {})[r["QuestionID"]] = r["Question"]

# key, csv code, old bundle, new bundle, old canonical bank, new canonical bank, versions
MKT_OLD = "MMRI_v3.0.3_QBANK_v3.1.3_STEP6_OF6_ACCEPTED_FINAL.json"
MKT_NEW = "MMRI_v3.0.3_QBANK_v3.1.3_STEP6_OF6_ACCEPTED_FINAL.json"
BM = [
    ("people", "HRMRI", "4.1.4", "4.1.5", "HRMRI", "people"),
    ("finance", "FINMRI", "4.2.4", "4.2.5", "FINMRI", "finance"),
    ("it", "ISMRI", "4.3.4", "4.3.5", "ISMRI", "it"),
    ("operations", "OPMRI", "4.4.4", "4.4.5", "OPMRI", "operations"),
]

def apply_text(questions, texts, idkey, textkey):
    changed = 0
    ids = set()
    for q in questions:
        qid = q[idkey]
        ids.add(qid)
        new = texts[qid]
        if q[textkey] != new:
            q[textkey] = new
            changed += 1
    assert ids == set(texts), "question ID set mismatch"
    return changed

manifest = {
    "version": "MMRI-FINAL-61440-REPAIRED-v1.0.0",
    "created": DATE,
    "sourceCsv": "integration/final_61440/MMRI_FINAL_61440_QUESTION_BANK.csv",
    "sourceCsvSha256": csv_sha,
    "status": "FINAL_REPAIRED_INTEGRATED",
    "scope": "Question wording only; IDs, options, scores, routing, weights and policies unchanged.",
    "domains": {},
}

# ---- Marketing
raw = open(os.path.join(M, MKT_OLD), "rb").read().decode("utf-8")
d = json.loads(raw)
old_sha_array = sha_bytes(dumps(d["questions"]).encode())
n = apply_text(d["questions"], by_dom["MARKETING"], "questionId", "textMn")
new_array_sha = sha_bytes(dumps(d["questions"]).encode())
d["bundleVersion"] = "MMRI-v3.0.4-QBANK-v3.1.4-FINAL-61440-REPAIRED"
d["methodologyVersion"] = "3.0.4"
d["questionBankVersion"] = "3.1.4"
d["releaseStatus"] = "FINAL_REPAIRED_61440"
d["generatedAtUtc"] = DATE + "T00:00:00Z"
d["finalRepaired61440"] = {
    "status": "FINAL_REPAIRED", "date": DATE, "sourceMethodologyVersion": "3.0.3",
    "sourceQuestionBankVersion": "3.1.3", "sourceCsvSha256": csv_sha,
    "previousQuestionArraySha256": old_sha_array, "questionArraySha256": new_array_sha,
    "questionTextChanged": n, "idsChanged": False, "optionsChanged": False,
    "scoresChanged": False, "routingChanged": False, "weightsChanged": False,
}
out = dumps(d)
open(os.path.join(M, MKT_NEW), "w", encoding="utf-8").write(out)
mk_sha = sha_bytes(out.encode())
manifest["domains"]["marketing"] = {
    "methodologyVersion": "3.0.4", "questionBankVersion": "3.1.4", "file": MKT_NEW,
    "sha256": mk_sha, "questionArraySha256": new_array_sha, "questions": len(d["questions"]),
    "questionTextChanged": n, "engineKind": "MARKETING_V3",
    "previousFile": MKT_OLD,
}
print("marketing", n, mk_sha, new_array_sha)

# ---- BusinessMRI domains
os.makedirs(os.path.join(M, "businessmri-v2.5-runtime-bundles"), exist_ok=True)
os.makedirs(os.path.join(M, "domain-question-banks-businessmri-v2.5"), exist_ok=True)
for key, code, ov, nv, mri, _ in BM:
    old_name = f"MMRI_{code}_Methodology_{ov}_BUSINESSMRI_V2.json"
    new_name = f"MMRI_{code}_Methodology_{nv}_BUSINESSMRI_V2.json"
    d = json.load(open(os.path.join(M, "businessmri-v2.4-runtime-bundles", old_name), encoding="utf-8"))
    n = apply_text(d["questions"], by_dom[code], "questionId", "textMn")
    qbv = f"BUSINESSMRI-v2.5-{mri}"
    d["methodologyVersion"] = nv
    d["questionBankVersion"] = qbv
    d["releaseStatus"] = "FINAL_REPAIRED_61440"
    d["bundleVersion"] = f"MMRI-BUSINESSMRI-{mri}-v2.5-RUNTIME-{nv}"
    d["generatedAtUtc"] = DATE + "T00:00:00Z"
    d["finalRepaired61440"] = {
        "status": "FINAL_REPAIRED", "date": DATE, "sourceMethodologyVersion": ov,
        "sourceQuestionBankVersion": f"BUSINESSMRI-v2.4-{mri}", "sourceCsvSha256": csv_sha,
        "questionTextChanged": n, "idsChanged": False, "optionsChanged": False,
        "scoresChanged": False, "routingChanged": False, "weightsChanged": False,
    }
    out = dumps(d)
    open(os.path.join(M, "businessmri-v2.5-runtime-bundles", new_name), "w", encoding="utf-8").write(out)
    sha = sha_bytes(out.encode())

    # canonical domain bank (same wording, keyed by question id)
    cb_old = f"{key}-businessmri-v2.4-accepted.json"
    cb_new = f"{key}-businessmri-v2.5-final-repaired.json"
    cb = json.load(open(os.path.join(M, "domain-question-banks-businessmri-v2.4", cb_old), encoding="utf-8"))
    cn = apply_text(cb["questions"], by_dom[code], "id", "question")
    assert cn == n, (key, cn, n)
    cb["release"] = f"BUSINESSMRI-{mri}-{nv}-FINAL-REPAIRED-61440"
    cb["status"] = "FINAL_REPAIRED_61440"
    cb["finalRepaired61440"] = {"date": DATE, "sourceCsvSha256": csv_sha, "questionTextChanged": cn}
    cout = dumps(cb)
    open(os.path.join(M, "domain-question-banks-businessmri-v2.5", cb_new), "w", encoding="utf-8").write(cout)
    manifest["domains"][key] = {
        "mri": mri, "methodologyVersion": nv, "questionBankVersion": qbv, "file": new_name,
        "sha256": sha, "canonicalBank": cb_new, "canonicalBankSha256": sha_bytes(cout.encode()),
        "questions": len(d["questions"]), "categories": 64, "cells": 3072, "goals": 5,
        "questionTextChanged": n, "engineKind": "BUSINESSMRI_V2", "previousFile": old_name,
    }
    print(key, n, sha)

json.dump(manifest, open(os.path.join(M, "businessmri-v2.5-runtime-bundles", "manifest-final-61440-repaired.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
