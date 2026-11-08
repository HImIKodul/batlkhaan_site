# BusinessMMRI.mn — dedicated physical server setup (Mongolia)

Target: one dedicated server, **16 GB RAM, 14th-generation Intel Core i5** (6–14 cores depending on the SKU), located in Mongolia.
This replaces the earlier low-cost VPS assumption. Nothing here is executed by the repository; it is the checked procedure to follow, using the
project's own scripts (`ops/`, `deploy/`). **Do not deploy, switch traffic, or enable real payments until the owner approves in writing.**

Status of the application for this target: the stack is containerised (`deploy/docker-compose.production.yml`: `migrate`, `api`, `web`) and expects an
external PostgreSQL, immutable `@sha256` images, and a TLS-terminating proxy in front of the web container (port 8080, now bound to loopback).
`MMRI_MAIL_PROVIDER` must stay `disabled` until a real mail provider is implemented (the preflight refuses anything else); see `EXTERNAL_REQUIREMENTS.md`.

## 1. Hardware and site checklist

| Item | Requirement |
|---|---|
| CPU/RAM | 14th-gen Core i5, 16 GB. No ECC on this class: compensate with backups, not trust. Add RAM later only if the memory budget in §5 is exceeded |
| Storage | 2 × NVMe (≥ 500 GB each) as a mirror (mdadm RAID1) **or** 1 NVMe + a second internal SSD for local backups. The live database is already ≈ 2.2 GB (five methodology bundles); plan for 10× growth plus report PDFs and WAL |
| Power | Online/line-interactive **UPS** with ≥ 20 min runtime and a USB/serial link to the host (NUT) so the server shuts down cleanly; BIOS "restore on AC power loss = power on" |
| Network | **Static public IPv4** with inbound **80 and 443** actually reachable from the internet (some residential links block them: get a business line, or colocate in a Mongolian data centre). Wired Gigabit, router/firewall under your control. IPv6 optional |
| Domain | A `.mn` (or other) domain with DNS you control; A record to the static IP; low TTL (300 s) during cutover. CAA record limiting issuance to your CA |
| Physical | Locked room, dust filtering, temperature < 30 °C, serial/asset label; a documented person who can power-cycle it |

QPay's servers must be able to call your HTTPS callback, so the static IP and open 443 are functional requirements, not optional.

## 2. Operating system and baseline hardening

1. Ubuntu Server 24.04 LTS (minimal), full-disk encryption **optional** (it blocks unattended reboot after power loss; if used, document the recovery procedure and use TPM/network unlock). Time zone `Asia/Ulaanbaatar`, `chrony` for NTP.
2. Updates: `unattended-upgrades` for security fixes; reboot window agreed (kernel updates) outside business hours.
3. Accounts: a non-root admin user with SSH keys only (`PasswordAuthentication no`, `PermitRootLogin no`); consider SSH only over a VPN (WireGuard) or on a non-default port with `fail2ban`.
4. Firewall (`ufw`): default deny incoming; allow 80/tcp and 443/tcp from anywhere; SSH from your admin IPs/VPN only; **nothing else** (PostgreSQL 5432, API 4000, web 8080 stay private).
5. `smartmontools` (weekly short, monthly long test, mail/alert on failure), `lm-sensors`, `nut` (UPS).
6. Swap: 4 GB swapfile with `vm.swappiness=10` (a safety net, not a plan).
7. Journald size limit (`SystemMaxUse=1G`); Docker log rotation is already set in the compose file (20 MB × 5 per service).

## 3. PostgreSQL 16 on the host

Install `postgresql-16` from the Ubuntu/PGDG packages and keep it on the **host** (simpler tuning and backups than a container for a single dedicated server).

- `listen_addresses = '127.0.0.1,<docker bridge IP>'` (e.g. `172.17.0.1`); `pg_hba.conf`: `scram-sha-256` for the bridge subnet only; no remote access.
- Roles per `deploy/POSTGRES_LEAST_PRIVILEGE.md`: `MMRI_MIGRATION_USER` (owns the schema) and `MMRI_RUNTIME_USER` (DML only). The two connection strings must differ (`DATABASE_URL` vs `MIGRATION_DATABASE_URL`; the preflight enforces it).
- Starting configuration for 16 GB (adjust after measuring):

```
shared_buffers = 4GB
effective_cache_size = 10GB
maintenance_work_mem = 1GB
work_mem = 32MB                 # × concurrent sorts; the API pool is capped (§5)
max_connections = 100
wal_compression = on
checkpoint_timeout = 15min
max_wal_size = 4GB
random_page_cost = 1.1          # NVMe
effective_io_concurrency = 200
log_min_duration_statement = 500ms
log_checkpoints = on
log_connections = off
password_encryption = scram-sha-256
```

- Keep `fsync` and `synchronous_commit` **on**. Enable data checksums when creating the cluster (`initdb --data-checksums`).
- From a container the host is reached through the bridge gateway; put `host.docker.internal:host-gateway` under `extra_hosts` in a compose **override** file (do not edit the shipped file) and point `DATABASE_URL`/`MIGRATION_DATABASE_URL` at it.

## 4. Docker, images, and the local registry

The deploy script runs `docker compose pull` of images pinned as `name@sha256:<digest>`. Without a cloud registry, run a private registry on loopback:

1. Install Docker Engine + the compose plugin from Docker's apt repository; add only the deploy user to the `docker` group.
2. `docker run -d --restart=always -p 127.0.0.1:5000:5000 --name registry registry:2`.
3. Build from a **clean checkout of the tagged commit** (never from a working tree): `backend/Dockerfile.production`, `backend/Dockerfile.migrate`, `frontend/Dockerfile.production`; tag `127.0.0.1:5000/mmri-api:<RELEASE_SHA>` etc., push, and read the digest (`docker inspect --format '{{index .RepoDigests 0}}' …`). Put those three `@sha256` references in `MMRI_API_IMAGE`, `MMRI_WEB_IMAGE`, `MMRI_MIGRATE_IMAGE`.
4. Back up the registry volume with the rest (§8) or keep the Dockerfiles and tag so images can be rebuilt reproducibly.

## 5. Application configuration and resource budget

`deploy/.env.production` (mode 600, owner = deploy user, **never committed**). Create it from the preflight's requirements (`ops/preflight.mjs` lists every check):

- Four **distinct** random secrets, ≥ 48 characters each: `ACCESS_TOKEN_SECRET`, `PASSWORD_PEPPER`, `AUDIT_HASH_SALT`, `METRICS_TOKEN`. Generate fresh values for the new server; **do not reuse values from any development machine, harness or backup** (the harness now has its own). Once users exist, `PASSWORD_PEPPER` can never change without invalidating every password.
- `ALLOWED_ORIGINS=https://<your domain>`, `COOKIE_SECURE=true`, `MMRI_PUBLIC_APP_URL=https://<your domain>`.
- Proxy topology: `TRUST_PROXY=true`, `TRUST_PROXY_HOPS=2` (host proxy → nginx in the web container → API). With 1 the API would record the proxy's address as the client.
- `MMRI_API_REPLICA_COUNT=1` (a shared rate limiter does not exist yet), `RELEASE_SHA=<commit>`, `INSTANCE_ID=<hostname>`.
- Methodology: production methodology is **3.0.3** (Marketing) plus the four 4.x.7 domain bundles; targets are `MMRI_TARGET_*` as in `backend/.env.example`. Methodology 3.0.4 is a separate, governed future release: do not import it.
- Billing: `MMRI_BILLING_PROVIDER=qpay`, `MMRI_BILLING_ENFORCEMENT=true`, prices `MMRI_DIAGNOSTIC_PRICE_MNT=300000`, `MMRI_RETAKE_PRICE_MNT=300000`, QPay variables (see `EXTERNAL_REQUIREMENTS.md`). Until QPay is verified use **`manual`** mode or keep payments off; never `mock`.
- Database pool: set `connection_limit` in the runtime `DATABASE_URL` (e.g. `?connection_limit=20`) so the API cannot exhaust `max_connections`.

Memory budget (16 GB): PostgreSQL ≈ 4 GB shared + ≈ 2 GB backends; OS page cache ≈ 5 GB; API (Node) ≈ 1–1.5 GB (set `NODE_OPTIONS=--max-old-space-size=1536`); PDF rendering spikes ≈ 0.3–0.5 GB per concurrent job (keep PDF concurrency low); nginx ≈ 50 MB; reverse proxy ≈ 50 MB; monitoring ≈ 0.5 GB. This fits, with swap as headroom. Re-measure under the load test in §9.

## 6. TLS reverse proxy (host)

Run Caddy (or nginx + certbot) on the host: public 80/443 → `127.0.0.1:8080`.

```
yourdomain.mn {
  encode zstd gzip
  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
    -Server
  }
  reverse_proxy 127.0.0.1:8080
}
```

Automatic certificates need inbound 80 (HTTP-01); if ISP filtering prevents it use DNS-01 with your DNS provider's API. Redirect HTTP→HTTPS, enable OCSP stapling (Caddy default), alert on certificate expiry < 14 days. The web container's nginx already sets CSP/frame/referrer headers; do not duplicate them in the proxy.

## 7. Process supervision

Compose already restarts `api`/`web` (`unless-stopped`) and health-checks `/ready` and `/healthz`. Enable Docker at boot (`systemctl enable docker`) and verify a **full power-cycle test**: pull the plug (with the UPS bypassed in a maintenance window), confirm the server returns to a working site unattended.

## 8. Backups (the application's own tools)

- `ops/backup-all.sh` creates a verified set (PostgreSQL + report-storage + manifest with the migration-chain hash); `ops/verify-backup-set.sh` re-verifies. Run nightly from a systemd timer under the deploy user; keep 14 daily / 8 weekly / 12 monthly.
- Copy every set **off the machine, encrypted** (`age` or `gpg`) to a second physical location or an object store; local-only backups do not survive theft, fire, or a failed disk. Keep the encryption key separately from the backups.
- Optional point-in-time recovery: WAL archiving to the same off-host target.
- **Restore drill monthly** into an isolated database with `ops/restore-backup-set.sh`; record the time taken. A backup that has never been restored is not a backup.
- Alert if the newest set is older than 26 hours.

## 9. Monitoring and acceptance

- External uptime probe (from outside Mongolia) on `https://<domain>/healthz` (the only health route the public web proxy exposes) plus a real login-page fetch; page on 2 consecutive failures.
- The API's own `/ready` and `/metrics` (protected by `X-Metrics-Token`/Bearer `METRICS_TOKEN`, see `deploy/OBSERVABILITY.md`) are **not** routed publicly. For local monitoring publish the API on loopback only, in the compose override file: `api: ports: ["127.0.0.1:4000:4000"]`, and let the host's Prometheus/Netdata agent scrape `http://127.0.0.1:4000/metrics` with the token and probe `/ready`.
- Metrics to alert on: add `node_exporter` + a small Prometheus/Grafana (or Netdata) and alert on: disk > 80 %, RAM > 90 %, swap in use, load, PostgreSQL connections > 80, 5xx rate, p95 latency, backup age, certificate expiry, SMART errors, UPS on battery.
- Logs: ship Docker/journal logs off-host or rotate; never log request bodies or secrets (the API already redacts).
- Before go-live run, in this order: `node ops/scan-secrets.mjs`, `node ops/verify-lockfiles.mjs`, `node ops/migration-chain.mjs --verify`, `node ops/preflight.mjs`, the five-domain PDF consistency check, the fresh-user gate against a **clone**, then `MMRI_CONNECTED_RELEASE_GATE=YES bash ops/connected-release-gate.sh` on the real server, and a **load test** (e.g. 50 concurrent questionnaires + PDF generation) while watching §5's memory budget.

## 10. Cutover and rollback

Follow `deploy/RELEASE_RUNBOOK.md` and `ops/deploy-production.sh` (requires `MMRI_DEPLOY_PRODUCTION=YES`). Migrating existing data: restore the latest verified backup set of the current system into the new PostgreSQL first, run `ops/preflight.mjs` and the migrate container (all 29 migrations are already applied there, so it is a no-op check), compare `db:verify:diagnosis` samples, then switch DNS. Rollback: `ops/rollback-application.sh` (previous image digests) and, only if a destructive change was applied, `ops/restore-postgres.sh` from the pre-deploy set; stored reports and hashes are append-only. Keep the old system running read-only until the new one has served real traffic for an agreed period.
