# BusinessMRI.mn — FINAL_ACCEPTANCE_REPORT

**Overall: BLOCKED — local acceptance is incomplete; no release/deployment readiness is claimed.**

Updated 2026-11-10 from the saved checkpoint. No SQL statement, migration, database cleanup, real payment, external email, push or deployment was executed in this continuation. The designated QA company and main/historical records were not modified. Current live counts and a restorable backup remain unverified.

Current item inventory: **155 PASS, 0 current FAIL, 17 BLOCKED, 0 top-level NOT RUN, 3 NOT APPLICABLE**. The 17 include six previously NOT RUN checks now explicitly blocked by identified prerequisites. Manual accessibility subchecks remain NOT RUN within their blocked composite item. Existing passing evidence is carried forward at its original scope; these counts do not mean 155 fresh live tests. No previously blocked service/provider check was promoted to PASS.

Machine-readable matrices: [current authoritative matrix](CODEX_PROGRESS/02-critical-finalization/acceptance-matrix.json), [execution-follow-up copy](CODEX_PROGRESS/03-executed-acceptance/acceptance-matrix.json). The saved prior matrix/report remain in the follow-up evidence directory.

## Execution result and least-privilege diagnosis

`python3 ops/acceptance/diagnose.py` records `NoNewPrivs=1`, seccomp filtering, zero effective capabilities and `EPERM` for Internet-socket creation and Docker/localhost connects. The precise provider/kernel filter implementation is not exposed. These are capability errors before application/daemon communication, not an observed PostgreSQL password or HTTP application failure. The Docker socket was not made world-writable; no namespace escape, global sandbox disable or production connection was attempted.

This task has restricted network access and approval policy `never`; no supported permission-escalation tool is available. A prompt here cannot grant the missing capabilities. A read-only normal-terminal preflight was requested while independent local work continued; no host results have been received. [Guarded Linux-terminal commands](docs/engineering/LOCAL_ACCEPTANCE_COMMANDS.md) are prepared instead of relabeling blocked tests.

The Node captured-stdout issue was isolated separately: inherited/file-backed stdio succeeds. The secret scanner now uses file-backed Git output while preserving exact file selection, scan rules, fail-closed errors and its 64 MiB limit. The full source gate proceeds through its earlier checks and stops at the genuine operations TCP-listener restriction. Chromium now keeps its sandbox enabled and still cannot launch successfully here.

Evidence: [environment](CODEX_PROGRESS/03-executed-acceptance/environment-current.json), [stdio diagnosis](CODEX_PROGRESS/03-executed-acceptance/node-process-diagnostics.json), [preflight/runtime records](CODEX_PROGRESS/03-executed-acceptance/host/host-results.json), [sandboxed browser](CODEX_PROGRESS/03-executed-acceptance/browser-sandboxed/results.json), [full gate attempt](CODEX_PROGRESS/03-executed-acceptance/source-release-gate-final.log).

## Newly executed local checks

| Check | Actual result / limit | Evidence |
|---|---|---|
| Default source secret scan and intentional canary | PASS: default Git capture succeeds, zero current hits; canary rejected with exit 1 as expected | [scan](CODEX_PROGRESS/03-executed-acceptance/scanner-current.json), [negative result](CODEX_PROGRESS/03-executed-acceptance/scanner-canary-result.txt) |
| Dependency cleanup, lock consistency and frontend production build | PASS after removing only unused lucide-react; no advisory-remediation claim | [cleanup](FINAL_SOURCE_CLEANUP_REPORT.md), [build](CODEX_PROGRESS/03-executed-acceptance/frontend-build-after-cleanup.log) |
| 325-entry reconciliation and recovery archive | PASS inventory/preservation: 599 expanded paths, 297 distinct-content variants preserved; no design-tree deletion/overwrite | [manifest](CODEX_PROGRESS/03-executed-acceptance/design-reconciliation.json) |
| Actual PDF inspector | PASS on existing three-page 67-score sample; incorrect score rejected. No live API PDF acceptance | [sample checks](CODEX_PROGRESS/03-executed-acceptance/actual-pdf-inspector.log) |
| Host and real-DB target guards | PASS for remote/wrong-user/wrong-port refusal and forced QA/public schema; not DB transaction proof | [host guards](CODEX_PROGRESS/03-executed-acceptance/host-guard-tests.log), [remote refusal](CODEX_PROGRESS/03-executed-acceptance/remote-refusal-results.txt) |
| Changed script syntax / Python compilation | PASS; service stages remain unexecuted | [JavaScript](CODEX_PROGRESS/03-executed-acceptance/script-syntax.log), [TypeScript](CODEX_PROGRESS/03-executed-acceptance/typescript-script-syntax.json) |
| Exact runtime probe | BLOCKED: available Node 22.23.2/npm 10.9.8 differ from 22.16.0/10.9.2. No engine-strict relaxation | [versions](CODEX_PROGRESS/03-executed-acceptance/host/runtime-available.json) |
| Backend/frontend online npm audits | BLOCKED: actual requests failed with registry EAI_AGAIN; no current advisory verdict | [backend](CODEX_PROGRESS/03-executed-acceptance/backend-npm-audit.json), [frontend](CODEX_PROGRESS/03-executed-acceptance/frontend-npm-audit.json) |

## Every previously BLOCKED / NOT RUN item

The command column distinguishes an actual suite attempt from an executed prerequisite probe. A shared preflight or failed browser launch is not proof that dependent service assertions ran. Full commands, evidence paths, repair IDs and owner actions are stored per item in the matrix.

| ID | Previous → current | Actual command executed | Test execution / evidence |
|---|---|---|---|
| DB-01 | BLOCKED → **BLOCKED** | `python3 ops/acceptance/host.py preflight` | Prerequisite stopped at Docker access; no SQL/service assertions |
| DB-02 | BLOCKED → **BLOCKED** | `python3 ops/acceptance/host.py preflight` | Prerequisite stopped at Docker access; no SQL/service assertions |
| DB-03 | BLOCKED → **BLOCKED** | `python3 ops/acceptance/host.py preflight` | Prerequisite stopped at Docker access; no SQL/service assertions |
| HTTP-01 | BLOCKED → **BLOCKED** | `python3 ops/acceptance/host.py preflight` | Prerequisite stopped at Docker access; no SQL/service assertions |
| ADMIN-01 | BLOCKED → **BLOCKED** | `BASE=http://127.0.0.1:5391/ OUT=CODEX_PROGRESS/03-executed-acceptance/browser-sandboxed node qa/ui-final-bounded.mjs` | Sandboxed browser launch failed; no page assertions |
| UI-01 | BLOCKED → **BLOCKED** | `BASE=http://127.0.0.1:5391/ OUT=CODEX_PROGRESS/03-executed-acceptance/browser-sandboxed node qa/ui-final-bounded.mjs` | Sandboxed browser launch failed; no page assertions |
| UI-02 | BLOCKED → **BLOCKED** | `BASE=http://127.0.0.1:5391/ OUT=CODEX_PROGRESS/03-executed-acceptance/browser-sandboxed node qa/ui-final-bounded.mjs` | Sandboxed browser launch failed; no page assertions |
| OPS-01 | BLOCKED → **BLOCKED** | `PATH=/home/kirby/.nvm/versions/node/v22.23.2/bin:$PATH bash ops/release-gate.sh` | Full source gate reaches operations; listener EPERM |
| GATE-01 | BLOCKED → **BLOCKED** | `PATH=/home/kirby/.nvm/versions/node/v22.23.2/bin:$PATH bash ops/release-gate.sh` | Full source gate reaches operations; listener EPERM |
| EXT-MAIL | BLOCKED → **BLOCKED** | `None; not executed` | Explicit authorized Resend test environment, owned domain/DNS and recipient/provider evidence |
| EXT-QPAY | BLOCKED → **BLOCKED** | `None; not executed` | Explicit authorized QPay sandbox merchant, test callbacks/payments/refunds and genuine historical-set records |
| NR-01 | NOT RUN → **BLOCKED** | `python3 ops/acceptance/host.py exact-runtime` | Version probe only; clean installation did not run |
| NR-02 | NOT RUN → **BLOCKED** | `python3 ops/acceptance/host.py preflight` | Prerequisite stopped at Docker access; no SQL/service assertions |
| NR-03 | NOT RUN → **NOT APPLICABLE** | `None; not executed` | User explicitly excludes expensive exhaustive CSS comparisons; bounded mobile/functional/axe coverage remains required |
| NR-04 | NOT RUN → **BLOCKED** | `BASE=http://127.0.0.1:5391/ OUT=CODEX_PROGRESS/03-executed-acceptance/browser-sandboxed node qa/ui-final-bounded.mjs` | Sandboxed browser launch failed; no page assertions |
| NR-05 | NOT RUN → **BLOCKED** | `python3 ops/acceptance/host.py preflight` | Prerequisite stopped at Docker access; no SQL/service assertions |
| NR-06 | NOT RUN → **BLOCKED** | `python3 ops/acceptance/host.py preflight` | Prerequisite stopped at Docker access; no SQL/service assertions |
| NR-07 | NOT RUN → **BLOCKED** | `NPM_CONFIG_USERCONFIG=/dev/null NPM_CONFIG_REGISTRY=https://registry.npmjs.org npm audit --json --fetch-retries=0 --fetch-timeout=5000` | Executed in backend and frontend; registry EAI_AGAIN |
| NR-08 | NOT RUN → **NOT APPLICABLE** | `None; not executed` | Connected production gates are outside the local-only objective; production readiness remains unverified |
| NR-09 | NOT RUN → **NOT APPLICABLE** | `None; not executed` | Push/deployment/publication are explicitly prohibited by the user |

### Required owner action and repair disposition

| ID | Guarded next command / action | Defect repaired, if any | Remaining dependency |
|---|---|---|---|
| DB-01 | python3 ops/acceptance/host.py database | H10 | Normal Linux Docker access; current QA identity and a successful restored backup before migration |
| DB-02 | python3 ops/acceptance/host.py contracts | H04 | Migration 31 and a usable isolated PostgreSQL connection |
| DB-03 | python3 ops/acceptance/host.py contracts | None | Migration 31 and real PostgreSQL transaction/unique-index contention evidence |
| HTTP-01 | python3 ops/acceptance/host.py workflows | H07, H08 | Owned flow clone, real API, seeded victim resources and owner positive controls |
| ADMIN-01 | python3 ops/acceptance/host.py browser | H05, H06 | Owned flow review fixtures, actual browser and persistent DB audit/session evidence |
| UI-01 | python3 ops/acceptance/host.py browser | H08 | Working sandboxed Chromium/localhost and the isolated mock mailbox |
| UI-02 | python3 ops/acceptance/host.py browser | H02, H03 | Five-domain real browser/save/retake/report data on an owned flow clone |
| OPS-01 | python3 ops/acceptance/host.py source | H01 | Permission to bind a loopback listener; source gate reaches that test |
| GATE-01 | python3 ops/acceptance/host.py source | H01 | Operations runtime listener; scanner subprocess obstruction was repaired |
| EXT-MAIL | Follow docs/engineering/EXTERNAL_ACCEPTANCE_CHECKLIST.md | None | Explicit authorized Resend test environment, owned domain/DNS and recipient/provider evidence |
| EXT-QPAY | Follow docs/engineering/EXTERNAL_ACCEPTANCE_CHECKLIST.md | None | Explicit authorized QPay sandbox merchant, test callbacks/payments/refunds and genuine historical-set records |
| NR-01 | python3 ops/acceptance/host.py exact-runtime | None | Install/select exact Node 22.16.0 and npm 10.9.2 in the normal terminal; perform clean install/build |
| NR-02 | python3 ops/acceptance/host.py domains | H02, H03 | Usable QA-derived HTTP stack; five actual PDF API downloads and frozen-score agreement |
| NR-03 | User explicitly excludes expensive exhaustive CSS comparisons; bounded mobile/functional/axe coverage remains required | None | User explicitly excludes expensive exhaustive CSS comparisons; bounded mobile/functional/axe coverage remains required |
| NR-04 | python3 ops/acceptance/host.py browser | None | Usable Chromium/Firefox/WebKit plus owner-operated real-device/keyboard/screen-reader acceptance |
| NR-05 | python3 ops/acceptance/host.py database | H10 | Actual QA backup/restore/migration/drift proof; separate authorized runtime-role setup for least-privilege drill |
| NR-06 | python3 ops/acceptance/host.py performance | None | Usable owned flow stack for two-user bounded journeys and resource measurements |
| NR-07 | Registry DNS/network access for actual current audits; live OpenAI is outside this deterministic local acceptance | H09 | Registry DNS/network access for actual current audits; live OpenAI is outside this deterministic local acceptance |
| NR-08 | Connected production gates are outside the local-only objective; production readiness remains unverified | None | Connected production gates are outside the local-only objective; production readiness remains unverified |
| NR-09 | Push/deployment/publication are explicitly prohibited by the user | None | Push/deployment/publication are explicitly prohibited by the user |

## Harness defects repaired; service verification still pending

No new business-logic defect was demonstrated against PostgreSQL or a browser because those services were unreachable. The following concrete harness defects were found while making the required checks executable. Passing syntax/helper tests do not verify their live paths.

| ID | Finding / repair | Verification |
|---|---|---|
| H01 | Captured Node Git stdout returned EPERM despite child success. File-backed stdout; identical complete Git selection, fail-closed error handling, 64 MiB bound | Default scan PASS; canary rejection PASS; full gate reaches actual operations listener |
| H02 | Fresh-domain cleanup omitted new restrictive-FK payment ledger. Delete invocation-owned ledger rows before its invoices | Syntax PASS; real PostgreSQL cleanup still BLOCKED |
| H03 | Fresh-domain gate asserted obsolete >=4-page PDF model. Download actual API PDF, validate hashes/filename, exactly 3 pages, branding/metadata and frozen score | Inspector positive/negative sample checks PASS; API journey still BLOCKED |
| H04 | Null-user negative-case audits could survive auth test cleanup. Use unique invocation fingerprint and scoped cleanup for all own audits | Syntax/target guard PASS; PostgreSQL residue proof BLOCKED |
| H05 | Admin browser assertion failures did not force nonzero exit; responsive fixture admins were incompletely tracked. Failure exit status and complete invocation-owned admin tracking; bounded viewport option retains assertions | Syntax PASS; real browser workflows BLOCKED |
| H06 | Review harness used +2/+3 TOTP offsets outside server +/-1 window and lost retake IDs in evidence. Wait for a valid unused TOTP step without changing replay state; preserve actual retake IDs | Syntax PASS; actual MFA/review workflow BLOCKED |
| H07 | Authorization matrix could use empty victim IDs or omit owner positive controls. Require valid resources/owner credentials and block composite acceptance on inconclusive WARN cases | Syntax PASS; live authorization/tenant proof BLOCKED |
| H08 | Recovery UI tests used sleeps shorter than response padding and stale hardcoded lifetime text. Wait for real response, select reset-purpose mail, retain one-time/lifetime checks at their authoritative layers | Syntax PASS; browser/HTTP execution BLOCKED |
| H09 | lucide-react had no source/config references or locked dependants. Remove unused direct dependency and sole lock entry; preserve both original files | Frontend build and lockfile consistency PASS; not a vulnerability remediation claim |
| H10 | Service-blocked acceptance needed a guarded host execution path. Identity/backup/restore gate before fixed-QA migration; owned workflow clones, isolated processes and sanitized evidence | URL/remote-target safety tests and syntax PASS; service stages not executed |

A temporary duplicate-fs-import syntax error introduced during the harness edit was corrected before final syntax checks. Earlier invocation/route-count/schema-validation errors remain resolved. No currently unresolved executed assertion FAIL is hidden; environmental failures retain BLOCKED status.

## Preserved prior passing evidence

- 82/82 critical mocked service/in-process route tests; seven strengthened cookie/TTL assertions subsequently passed in a targeted run. These are not real PostgreSQL, HTTP-wire or browser tests. They were not repeated because the production auth/billing implementation is unchanged by this execution-focused continuation.
- QPay mocked transport contracts 45/45, Resend mocked contract, backend typecheck/build, schema validation and unchanged historical migration proof remain at their recorded scope. The 31-migration source chain is still `1f0d6448ccb656a091497eae0556f4b481f46ee291227e8fa31ebee7e66e6312`; source integrity does not prove migration application.
- Prior security/config/readiness/backup-script/operations-static checks remain recorded. The current full source gate re-executed its reachable components and failed at the operations listener. The actual restore/production-role drill did not run.
- Earlier bounded CSS/native-motion, deterministic five-domain renderer and 61,440-question census evidence is retained. It does not certify current browser layouts, live report API behavior or new database migration/transaction behavior.

## Source and data cleanup

[FINAL_SOURCE_CLEANUP_REPORT.md](FINAL_SOURCE_CLEANUP_REPORT.md) lists all 325 dispositions, expanded paths, large-file hashes, dependency proof, the recovery archive/hash and restoration commands. No unproven duplicate-looking test/source was removed; all distinct variants and methodology/migration history were preserved. The active source remains canonical; older variants were not silently merged.

[DATABASE_FINAL_VERIFICATION.md](DATABASE_FINAL_VERIFICATION.md) separates identity/backup/migration safety guards from the still-unrun database assertions. The runner restores QA backups into new named disposable databases, never over main. Fixture-heavy flows use QA-derived clones, keeping the designated QA database single-company. No such restore/database creation occurred here.

Final source map: [FINAL_SOURCE_STRUCTURE.md](docs/engineering/FINAL_SOURCE_STRUCTURE.md). New execution tools are in `ops/acceptance/`, guarded real/HTTP/browser helpers in `backend/scripts/` and `qa/`, and follow-up evidence in `CODEX_PROGRESS/03-executed-acceptance/`. Local recovery archives, raw diffs, credential mailboxes, dumps and clean-install copies are ignored from source delivery.

Customer-facing branding scan remains PASS for BusinessMRI.mn. Legacy internal schema/migration/technical names retain compatibility. New PDF checks verify actual metadata/headers/badges when run; the current live-browser/API proof is still blocked.

## Remaining dependencies are not all external

[REMAINING_BLOCKERS.md](REMAINING_BLOCKERS.md) separates local execution permissions, pinned runtime, real DB/HTTP/browser/operations/performance verification, current dependency advisories and manual accessibility from genuine external Resend/QPay requirements.

[EXTERNAL_ACCEPTANCE_CHECKLIST.md](docs/engineering/EXTERNAL_ACCEPTANCE_CHECKLIST.md) specifies configuration, sender DNS/authentication, controlled delivery tests and authorized QPay sandbox/callback/refund/reconciliation evidence. No provider delivery/payment was made. Automatic mail webhook ingestion/durable delivery processing is not claimed; if required it is separate engineering, not just an absent credential.

Start with the read-only host preflight and retain BLOCKED until real artifacts exist. Do not push, deploy, expose the API publicly or modify production.

## Appendix A — every critical test case

All items below are **PASS** from the 82-case mocked/in-process suite. The cookie/TTL cases also have the final seven-case targeted evidence. These are not browser or PostgreSQL results.

| ID | Status | Case |
|---|---|---|
| UNIT-001 | PASS | verification and recovery service contracts (mock database) > stores only a purpose-bound hash, a 30 minute expiry and sends a one-time fragment link |
| UNIT-002 | PASS | verification and recovery service contracts (mock database) > does not mail ineligible accounts 0 |
| UNIT-003 | PASS | verification and recovery service contracts (mock database) > does not mail ineligible accounts 1 |
| UNIT-004 | PASS | verification and recovery service contracts (mock database) > does not mail ineligible accounts 2 |
| UNIT-005 | PASS | verification and recovery service contracts (mock database) > does not mail ineligible accounts 3 |
| UNIT-006 | PASS | verification and recovery service contracts (mock database) > enforces hour resend limit inside the locked transaction |
| UNIT-007 | PASS | verification and recovery service contracts (mock database) > enforces cooldown resend limit inside the locked transaction |
| UNIT-008 | PASS | verification and recovery service contracts (mock database) > a concurrent email change cannot send a new token to the old mailbox |
| UNIT-009 | PASS | verification and recovery service contracts (mock database) > invalidates older tokens only in the same purpose |
| UNIT-010 | PASS | verification and recovery service contracts (mock database) > verification mail uses a different hash namespace and route |
| UNIT-011 | PASS | verification and recovery service contracts (mock database) > rejects invalid, expired, consumed or cross-purpose tokens 0 |
| UNIT-012 | PASS | verification and recovery service contracts (mock database) > rejects invalid, expired, consumed or cross-purpose tokens 1 |
| UNIT-013 | PASS | verification and recovery service contracts (mock database) > rejects invalid, expired, consumed or cross-purpose tokens 2 |
| UNIT-014 | PASS | verification and recovery service contracts (mock database) > rejects invalid, expired, consumed or cross-purpose tokens 3 |
| UNIT-015 | PASS | verification and recovery service contracts (mock database) > rejects invalid, expired, consumed or cross-purpose tokens 4 |
| UNIT-016 | PASS | verification and recovery service contracts (mock database) > rejects weak passwords before claiming tokens |
| UNIT-017 | PASS | verification and recovery service contracts (mock database) > a lost one-time claim cannot change credentials |
| UNIT-018 | PASS | verification and recovery service contracts (mock database) > reset changes password, bumps token version, revokes customer and admin sessions |
| UNIT-019 | PASS | verification and recovery service contracts (mock database) > verification establishes mailbox-owner password and verified timestamp |
| UNIT-020 | PASS | verification and recovery service contracts (mock database) > rechecks erased/disabled user under the token claim lock |
| UNIT-021 | PASS | verification and recovery service contracts (mock database) > registration duplicates do not reveal existence or create sessions |
| UNIT-022 | PASS | verification and recovery service contracts (mock database) > new public registrations explicitly require verification |
| UNIT-023 | PASS | verification and recovery service contracts (mock database) > pending accounts get the same login denial as invalid credentials |
| UNIT-024 | PASS | payment activation contracts (mock transaction, PostgreSQL race tests separate) > claims every constituent before granting exactly one entitlement |
| UNIT-025 | PASS | payment activation contracts (mock transaction, PostgreSQL race tests separate) > rejects overlapping payment sets on any constituent |
| UNIT-026 | PASS | payment activation contracts (mock transaction, PostgreSQL race tests separate) > rejects missing, duplicated or inconsistent transaction evidence 0 |
| UNIT-027 | PASS | payment activation contracts (mock transaction, PostgreSQL race tests separate) > rejects missing, duplicated or inconsistent transaction evidence 1 |
| UNIT-028 | PASS | payment activation contracts (mock transaction, PostgreSQL race tests separate) > rejects missing, duplicated or inconsistent transaction evidence 2 |
| UNIT-029 | PASS | payment activation contracts (mock transaction, PostgreSQL race tests separate) > rejects missing, duplicated or inconsistent transaction evidence 3 |
| UNIT-030 | PASS | payment activation contracts (mock transaction, PostgreSQL race tests separate) > refuses new activation while historical combined sets are unresolved |
| UNIT-031 | PASS | payment activation contracts (mock transaction, PostgreSQL race tests separate) > reconciliation of PAID cannot regrant entitlement |
| UNIT-032 | PASS | payment activation contracts (mock transaction, PostgreSQL race tests separate) > reconciliation of REFUNDED cannot regrant entitlement |
| UNIT-033 | PASS | payment activation contracts (mock transaction, PostgreSQL race tests separate) > rejects changed settled reference |
| UNIT-034 | PASS | payment activation contracts (mock transaction, PostgreSQL race tests separate) > partial totals never grant rights |
| UNIT-035 | PASS | administrator authorization and session contracts > SUPER_ADMIN includes every defined reviewer permission |
| UNIT-036 | PASS | administrator authorization and session contracts > reviewers cannot manage accounts or administrators |
| UNIT-037 | PASS | administrator authorization and session contracts > sensitive actions require fresh reauthentication and audit denial |
| UNIT-038 | PASS | administrator authorization and session contracts > rejects missing administrator session |
| UNIT-039 | PASS | administrator authorization and session contracts > rejects revoked administrator session |
| UNIT-040 | PASS | administrator authorization and session contracts > rejects idle administrator session |
| UNIT-041 | PASS | administrator authorization and session contracts > rejects absolute administrator session |
| UNIT-042 | PASS | administrator authorization and session contracts > rejects disabled administrator session |
| UNIT-043 | PASS | administrator authorization and session contracts > audit metadata excludes passwords, tokens, MFA codes and report text |
| UNIT-044 | PASS | administrator authorization and session contracts > audit write failures are surfaced |
| UNIT-045 | PASS | administrator authorization and session contracts > a pending MFA admin cannot count as the remaining active super administrator |
| UNIT-046 | PASS | reset versus session issuance races (mock transaction) > a password changed during login cannot issue a new session |
| UNIT-047 | PASS | reset versus session issuance races (mock transaction) > reset invalidates a concurrent refresh including rotated grace=false |
| UNIT-048 | PASS | reset versus session issuance races (mock transaction) > reset invalidates a concurrent refresh including rotated grace=true |
| UNIT-049 | PASS | reset versus session issuance races (mock transaction) > logout takes the same user lock before revoking its whole family |
| UNIT-050 | PASS | administrator credential and MFA session boundaries > valid password plus TOTP produces only a hashed opaque session in storage |
| UNIT-051 | PASS | administrator credential and MFA session boundaries > fails closed on disabled-user |
| UNIT-052 | PASS | administrator credential and MFA session boundaries > fails closed on erased-user |
| UNIT-053 | PASS | administrator credential and MFA session boundaries > fails closed on disabled-admin |
| UNIT-054 | PASS | administrator credential and MFA session boundaries > fails closed on missing-mfa |
| UNIT-055 | PASS | administrator credential and MFA session boundaries > fails closed on tampered-secret |
| UNIT-056 | PASS | administrator credential and MFA session boundaries > a concurrent replay losing the MFA conditional update creates no session |
| UNIT-057 | PASS | administrator credential and MFA session boundaries > login lockout blocks even valid credentials |
| UNIT-058 | PASS | administrator credential and MFA session boundaries > reauthentication cannot bypass persistent lockout |
| UNIT-059 | PASS | administrator credential and MFA session boundaries > reauthentication cannot refresh a revoked session |
| UNIT-060 | PASS | administrator credential and MFA session boundaries > a concurrent password reset wins over admin login |
| UNIT-061 | PASS | administrator credential and MFA session boundaries > the fifth failed credential check atomically sets a fifteen minute lockout |
| UNIT-062 | PASS | QPay callback authentication and transaction recovery > invalid callback token never calls QPay or grants access:  |
| UNIT-063 | PASS | QPay callback authentication and transaction recovery > invalid callback token never calls QPay or grants access: wrong-token |
| UNIT-064 | PASS | QPay callback authentication and transaction recovery > callback cannot treat an upstream outage as payment |
| UNIT-065 | PASS | QPay callback authentication and transaction recovery > a valid callback still requires a verified fully paid transaction set |
| UNIT-066 | PASS | QPay callback authentication and transaction recovery > a stale unique-index snapshot retries against a new transaction |
| UNIT-067 | PASS | QPay callback authentication and transaction recovery > recording a confirmed refund revokes active and consumed rights |
| UNIT-068 | PASS | SUPER_ADMIN customer email and status workflows > changing email invalidates old-mailbox tokens and requires fresh ownership proof |
| UNIT-069 | PASS | SUPER_ADMIN customer email and status workflows > disabling customer invalidates outstanding reset and verification links |
| UNIT-070 | PASS | SUPER_ADMIN customer email and status workflows > customer management cannot change a dedicated admin email |
| UNIT-071 | PASS | administrator route audit persistence boundary > no mutation runs when its durable authorization audit cannot be stored |
| UNIT-072 | PASS | administrator route audit persistence boundary > successful mutation has authorization, business and completion audit records |
| UNIT-073 | PASS | administrator route audit persistence boundary > failed mutation has a durable failed outcome |
| UNIT-074 | PASS | administrator route audit persistence boundary > permission denial cannot reach a mutation |
| UNIT-075 | PASS | customer account erasure cannot bypass dedicated administrator protections |
| UNIT-076 | PASS | provider rejection records a sanitized delivery failure without leaking provider details |
| UNIT-077 | PASS | registration returns generic 202 with no session cookie or access token |
| UNIT-078 | PASS | recovery response is identical and covers the provider deadline: success |
| UNIT-079 | PASS | recovery response is identical and covers the provider deadline: failure |
| UNIT-080 | PASS | recovery response is identical and covers the provider deadline: slow |
| UNIT-081 | PASS | verification requests use the same generic response and fixed timing |
| UNIT-082 | PASS | verification confirmation clears the refresh cookie and returns no session |

## Appendix B — every QPay transport contract check

All items below are **PASS** using mocked fetch responses only.

| ID | Status | Check |
|---|---|---|
| QPAY-001 | PASS | concurrent provider checks share one auth request |
| QPAY-002 | PASS | both checks still reach payment verification |
| QPAY-003 | PASS | multiple paid rows are summed to invoice amount |
| QPAY-004 | PASS | multi-row payment reference is deterministic |
| QPAY-005 | PASS | invoice response maps provider invoice id |
| QPAY-006 | PASS | cached auth token is reused |
| QPAY-007 | PASS | manual provider returns configured static QR text |
| QPAY-008 | PASS | manual provider never self-confirms payment |
| QPAY-009 | PASS | mock provider is clearly test-only data |
| QPAY-010 | PASS | mock check never unlocks by itself |
| QPAY-011 | PASS | QPay requests reject redirects |
| QPAY-012 | PASS | QPay requests reject redirects |
| QPAY-013 | PASS | duplicate transaction rows are counted once |
| QPAY-014 | PASS | QPay requests reject redirects |
| QPAY-015 | PASS | QPay requests reject redirects |
| QPAY-016 | PASS | aggregate cannot inflate a partial payment |
| QPAY-017 | PASS | QPay requests reject redirects |
| QPAY-018 | PASS | QPay requests reject redirects |
| QPAY-019 | PASS | unconfirmed payment is never counted |
| QPAY-020 | PASS | QPay requests reject redirects |
| QPAY-021 | PASS | QPay requests reject redirects |
| QPAY-022 | PASS | foreign currency is rejected |
| QPAY-023 | PASS | QPay requests reject redirects |
| QPAY-024 | PASS | QPay requests reject redirects |
| QPAY-025 | PASS | conflicting duplicate amounts are rejected |
| QPAY-026 | PASS | QPay requests reject redirects |
| QPAY-027 | PASS | QPay requests reject redirects |
| QPAY-028 | PASS | paid row without transaction identity is rejected |
| QPAY-029 | PASS | paid result exposes every unique constituent transaction |
| QPAY-030 | PASS | pagination page numbers advance correctly |
| QPAY-031 | PASS | pagination page numbers advance correctly |
| QPAY-032 | PASS | complete paginated payment is summed and retains identities |
| QPAY-033 | PASS | pagination shares one overall verification deadline |
| QPAY-034 | PASS | pagination page numbers advance correctly |
| QPAY-035 | PASS | empty-page fails closed |
| QPAY-036 | PASS | pagination page numbers advance correctly |
| QPAY-037 | PASS | oversize-count fails closed |
| QPAY-038 | PASS | pagination page numbers advance correctly |
| QPAY-039 | PASS | invalid-rows fails closed |
| QPAY-040 | PASS | pagination page numbers advance correctly |
| QPAY-041 | PASS | pagination page numbers advance correctly |
| QPAY-042 | PASS | repeated-page fails closed |
| QPAY-043 | PASS | pagination page numbers advance correctly |
| QPAY-044 | PASS | pagination page numbers advance correctly |
| QPAY-045 | PASS | changing-count fails closed |

No deployment approval or production readiness is implied by this report.

