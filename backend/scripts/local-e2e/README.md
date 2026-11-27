# Local end-to-end API tests (development machine only)

Run against the local stack (web 5291 -> API 4300, database `mmri_dev_clean`, mock mailer). They read `~/mmri-secrets/local-dev-credentials.env` and `backend/.qa-credentials.local`, never print secrets, never call the AI service and never touch production.

| Script | What it proves |
|---|---|
| `review-lifecycle.py` | Review, save, publish, recall and republish for ALL FIVE domains on **fresh disposable fixtures** (`src/qa-review-fixtures.ts`), so it is repeatable: customer blocking, plan + text edits, concurrent ИЛГЭЭХ, PDF = 3 pages, no AI revision. |
| `auth-all-roles.py` | E-mail code on an untrusted device for Sadmin (authenticator + code), Admin and User; trusted device skips only the e-mail code. |
| `sync-events.py` | A grant / revoke wakes a waiting customer page within milliseconds. |
| `verify-demo.py` | The permanent demonstration data (three accounts, every customer state, both consoles). |
| `stage-demo.py` | Builds the staged states of the demonstration data (not a test). |
| `admin-flow.py` | Account, role, console and Excel checks (also the shared helpers). |

The authenticator code of the synthetic Sadmin works once per 30 s step, so the scripts wait for a fresh step. Trusted-device cookies are kept in `jar-*.txt` (git-ignored).
Fixture generator: `MMRI_QA_SEED_LOCAL_DB=127.0.0.1:55432/mmri_dev_clean npx tsx src/qa-review-fixtures.ts --domains=finance --hours-ago=2`

Every test removes what it created (`src/qa-cleanup.ts`: `fixtures`, `entitlements`, `test-accounts`), so running them never leaves extra accounts or fixtures. The accounts used are the three demonstration accounts from `~/mmri-secrets/local-dev-credentials.env`.
