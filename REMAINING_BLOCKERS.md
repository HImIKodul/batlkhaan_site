# BusinessMRI.mn remaining blockers

**Local acceptance remains BLOCKED.** No push, deployment or production modification was performed. Environment restrictions and external-provider requirements are separate; this is not an assertion that only external work remains.

| Category | Remaining work | Evidence / next action |
|---|---|---|
| Execution environment | Docker connect and Internet/localhost sockets return `EPERM`; Chromium cannot launch successfully | [Environment diagnostics](CODEX_PROGRESS/03-executed-acceptance/environment-current.json), [sandboxed browser result](CODEX_PROGRESS/03-executed-acceptance/browser-sandboxed/results.json) |
| Execution permissions | This task is `workspace-write`, restricted network, approval policy `never`; no escalation permission tool is available | Run narrowly guarded commands in the normal authorized Linux terminal; do not disable sandbox/security globally, change socket permissions or expose services publicly |
| Local DB/security verification | Current identity/backup, migration 31, drift, FKs, real token/session and payment contention tests | `python3 ops/acceptance/host.py preflight`, then `database`, then `contracts`; [database report](DATABASE_FINAL_VERIFICATION.md) |
| Local HTTP/browser verification | Real authorization/tenant matrix, session expiry, admin/audits, customer flows, five domains, actual API PDFs, mobile/keyboard/axe/cross-browser | Guarded `workflows`, `domains`, `browser` stages; no service-test PASS exists here |
| Exact local runtime | Only Node 22.23.2/npm 10.9.8 were available; required 22.16.0/10.9.2 clean install is unverified | Select/install the pinned versions in the normal terminal and run `exact-runtime`; do not relax engine requirements |
| Local operations/performance | Source gate reaches operations and fails at denied loopback listener; real restore/runtime-role/performance proof remains incomplete | Run guarded `source` and `performance` after DB/service prerequisites; production least privilege requires separate authorized QA role setup |
| Dependency advisory access | Actual backend/frontend npm audit attempts failed with registry `EAI_AGAIN` | Run current online audits on a network-enabled host. No vulnerability-free result is claimed |
| Manual accessibility | Real-device/touch, keyboard and screen-reader acceptance | Automated browser runs are prepared, but manual checks still require the owner/operator. Axe alone is insufficient |
| External Resend | Authorized sender/domain DNS, recipient inbox/headers, slow/rejected delivery and bounce/complaint evidence | [External acceptance checklist](docs/engineering/EXTERNAL_ACCEPTANCE_CHECKLIST.md); no mail was sent |
| External QPay | Authorized sandbox merchant/invoice code, callback reachability, payment/refund evidence and any historical combined-set resolution | Same checklist; no real/provider-connected payment or reconciliation was performed |

## What changed locally

- The source secret scanner works through standard file-backed Git stdout, keeps its complete selection/rules/bounds, and rejects an intentional canary. The complete source gate still remains BLOCKED at the real listener test.
- Test harness repairs prevent missing victim fixtures/owner controls and inconclusive authorization cases from becoming acceptance. Admin browser failures now produce failure exit status; fixture cleanup is invocation-scoped. Review tests no longer request impossible TOTP offsets beyond the server's accepted clock window.
- Fresh-domain tests now request and inspect actual API PDFs (three pages, hashes/branding/score), and respect the new ledger FK during cleanup. The inspector was verified on the existing sample, not through a live API.
- All 325 design checkpoint entries were reconciled into a content manifest, with distinct variants archived and protected data retained in place. One proven unused direct dependency (`lucide-react`) was removed with exact recovery files; the frontend build/lockfile check passed.

None of these local changes substitutes for the blocked real PostgreSQL/browser/provider results. Harness service paths are prepared and syntax/guard checked, but must still be exercised and repaired from actual host evidence.

## Excluded from this local objective

- Expensive exhaustive CSS A/B comparisons: NOT APPLICABLE under the user's bounded-testing instruction. Current bounded functional/mobile/accessibility checks remain required.
- Connected production/deployment gates: NOT APPLICABLE to this local-only run; production readiness is not certified.
- GitHub push/publication/deployment: NOT APPLICABLE and explicitly prohibited.

Start with the read-only preflight in [LOCAL_ACCEPTANCE_COMMANDS.md](docs/engineering/LOCAL_ACCEPTANCE_COMMANDS.md). The current task cannot obtain the missing host permissions itself; keep affected items BLOCKED until genuine host/provider evidence exists.
