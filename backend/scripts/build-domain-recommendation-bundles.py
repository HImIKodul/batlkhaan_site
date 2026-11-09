#!/usr/bin/env python3
"""
Derive the v2.6 non-Marketing runtime bundles from the validated v2.5 bundles.

Why: the v2.0-v2.5 non-Marketing bundles shipped Marketing's recommendation contract
(`categoryObjectives` = MS01..MS64, Marketing role labels), so no finding could resolve an
objective and every non-Marketing assessment produced zero recommendations.

What this changes (and nothing else):
  * contracts/MMRI_FINAL_Recommendation_Engine_Contract.json
      - composition.categoryObjectives  -> 64 domain objectives keyed by the domain's own category ids
      - composition.cellInterventions   -> TEXT of the shared construct interventions that carried
                                           Marketing wording (cell ids and intervention codes unchanged)
  * contracts/MMRI_FINAL_Respondent_Authority_Contract.json
      - roles[] labels/codes/scope for R02..R11 (numeric authority matrices are NOT touched)
  * version/provenance metadata

Questions, categories, cells, scoring, IDs, runtime policy are copied untouched; the script asserts it.

Authored content: backend/methodology/recommendation-contracts/<domain>.json and _shared.json
Usage: python3 scripts/build-domain-recommendation-bundles.py            (from backend/)
"""
import copy
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "methodology" / "businessmri-v2.5-runtime-bundles"
OUT_DIR = ROOT / "methodology" / "businessmri-v2.6-runtime-bundles"
CONTENT = ROOT / "methodology" / "recommendation-contracts"

DOMAINS = {
    "finance": ("MMRI_FINMRI_Methodology_4.2.5_BUSINESSMRI_V2.json", "MMRI_FINMRI_Methodology_4.2.7_BUSINESSMRI_V2.json", "FINMRI"),
    "it": ("MMRI_ISMRI_Methodology_4.3.5_BUSINESSMRI_V2.json", "MMRI_ISMRI_Methodology_4.3.7_BUSINESSMRI_V2.json", "ISMRI"),
    "people": ("MMRI_HRMRI_Methodology_4.1.5_BUSINESSMRI_V2.json", "MMRI_HRMRI_Methodology_4.1.7_BUSINESSMRI_V2.json", "HRMRI"),
    "operations": ("MMRI_OPMRI_Methodology_4.4.5_BUSINESSMRI_V2.json", "MMRI_OPMRI_Methodology_4.4.7_BUSINESSMRI_V2.json", "OPMRI"),
}
REC = "MMRI_FINAL_Recommendation_Engine_Contract.json"
AUTH = "MMRI_FINAL_Respondent_Authority_Contract.json"


def dumps(obj) -> str:
    # Matches the serialization of the existing bundles byte-for-byte (compact, UTF-8, no trailing newline).
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def build(domain: str) -> str:
    src_name, out_name, prefix = DOMAINS[domain]
    raw = (SRC_DIR / src_name).read_bytes()
    base = json.loads(raw)
    assert dumps(base).encode("utf-8") == raw, f"{src_name}: source is not in canonical compact form"
    content = json.loads((CONTENT / f"{domain}.json").read_text(encoding="utf-8"))
    shared = json.loads((CONTENT / "_shared.json").read_text(encoding="utf-8"))
    assert content["domainCode"] == domain and content["basedOnMethodologyVersion"] == base["methodologyVersion"]

    out = copy.deepcopy(base)
    target_version = content["targetMethodologyVersion"]
    base_version = base["methodologyVersion"]

    # ---- recommendation contract -------------------------------------------------------------
    rec = out["contracts"][REC]
    cats = {c["ID"]: c for c in out["categories"]}
    assert len(cats) == 64 and all(cid.startswith(prefix + "-C") for cid in cats), "unexpected category ids"
    authored = content["categoryObjectives"]
    assert set(authored) == set(cats), "authored objectives must cover exactly the domain's 64 category ids"
    objectives = []
    for cid in sorted(cats):  # same ordering as the bundle's category ids
        a = authored[cid]
        assert a["objective"].strip() and "аркетинг" not in a["objective"]
        objectives.append({
            "category": cid,
            "name": cats[cid]["Category"],                      # exact existing capability name
            "weight": cats[cid]["Category weight %"],
            "defaultOwner": a["defaultOwner"],
            "sponsor": a["sponsor"],
            "objective": a["objective"].strip(),
        })
    rec["composition"]["categoryObjectives"] = objectives

    overridden = []
    for iv in rec["composition"]["cellInterventions"]:
        patch = shared["cellInterventionOverrides"].get(iv["cell"])
        if patch:
            before = {k: iv[k] for k in patch}
            assert before != patch
            iv.update(patch)
            overridden.append(iv["cell"])
    assert sorted(overridden) == sorted(shared["cellInterventionOverrides"]), "an intervention override found no target"

    # ---- authority roles (labels only) --------------------------------------------------------
    auth = out["contracts"][AUTH]
    old_roles = {r["id"]: r for r in auth["roles"]}
    new_roles = {r["id"]: r for r in content["roles"]}
    assert set(new_roles) == {f"R{i:02d}" for i in range(2, 12)}, "roles R02..R11 must be provided"
    auth["roles"] = [old_roles["R01"]] + [new_roles[f"R{i:02d}"] for i in range(2, 12)]
    assert all(set(r) == set(old_roles["R01"]) for r in auth["roles"])

    # ---- version + provenance ------------------------------------------------------------------
    questions_sha = sha(dumps(out["questions"]))
    assert questions_sha == sha(dumps(base["questions"])), "questions changed"
    content_sha = sha(dumps({"domain": content, "shared": shared}))
    out["methodologyVersion"] = target_version
    out["bundleVersion"] = base["bundleVersion"].replace("-v2.5-", "-v2.6-").replace(f"-{base_version}", f"-{target_version}")
    out["releaseStatus"] = "FINAL_RECOMMENDATION_CONTRACT_REPAIRED"
    out["semanticVersionClass"] = "CONTRACT_ONLY"
    out["generatedAtUtc"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    # questionBankVersion intentionally unchanged: the question bank content is byte-identical.
    out["recommendationContractRepair"] = {
        "status": "REPAIRED",
        "reason": "Non-Marketing bundles carried Marketing recommendation objectives (MS01..MS64) and Marketing role labels.",
        "sourceMethodologyVersion": base_version,
        "sourceBundleSha256": hashlib.sha256(raw).hexdigest(),
        "supersedesMethodologyVersion": content.get("supersedes"),
        "sourceQuestionBankVersion": base["questionBankVersion"],
        "questionBankContentUnchanged": True,
        "questionsCanonicalSha256": questions_sha,
        "categoryObjectives": len(objectives),
        "interventionTextNeutralised": sorted(overridden),
        "authorityRoleLabelsReplaced": [f"R{i:02d}" for i in range(2, 12)],
        "authorityMatricesUnchanged": True,
        "contentSha256": content_sha,
    }
    out["sourceManifest"] = {
        **out["sourceManifest"],
        f"MMRI_{prefix}_RECOMMENDATION_CONTRACT_SOURCE.json": {
            "version": target_version, "sha256": content_sha, "chunks": len(objectives), "size": len(objectives),
            "role": "DOMAIN_RECOMMENDATION_CONTRACT_SOURCE",
        },
    }

    # ---- invariants: nothing but the intended parts changed ------------------------------------
    for key in ("categories", "cellTemplates", "cellInstances", "questions", "profileQuestions", "runtimePolicy"):
        assert dumps(out[key]) == dumps(base[key]), f"{key} must be untouched"
    for name, contract in base["contracts"].items():
        if name not in (REC, AUTH):
            assert dumps(out["contracts"][name]) == dumps(contract), f"contract {name} must be untouched"
    for key in ("domainAuthority", "constructAuthority", "authority", "reliabilityAdjustment"):
        assert dumps(out["contracts"][AUTH][key]) == dumps(base["contracts"][AUTH][key]), f"authority.{key} must be untouched"

    text = dumps(out)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / out_name).write_text(text, encoding="utf-8")
    digest = sha(text)
    print(f"{domain:10} {base_version} -> {target_version}  {out_name}  sha256={digest}")
    return digest


if __name__ == "__main__":
    selected = sys.argv[1:] or list(DOMAINS)
    for d in selected:
        build(d)
