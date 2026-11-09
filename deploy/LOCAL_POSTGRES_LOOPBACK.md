# Local development PostgreSQL: loopback-only binding

**Problem (found 2026-11-09):** the development container `mmri-v3-local-postgres-1` publishes `0.0.0.0:55432`, uses the default password `mmri`, `listen_addresses='*'` and `pg_hba: host all all all scram-sha-256`. Anything on the same network that can reach the laptop can try to log in to a database that holds real-looking customer data. It was created from a compose file that no longer exists (`/home/kirby/MMRI_TEST_20_20/...`); `docker-compose.local.yml` in this repository now binds `127.0.0.1:55432`.
This does not affect production (Windows server): there PostgreSQL must listen on loopback only (see `deploy/WINDOWS_SERVER_DEPLOYMENT.md`).

## Option A - no restart (immediate, needs sudo, reversible)
Block external access to the published port at the Docker firewall hook:
```
sudo iptables -I DOCKER-USER -p tcp --dport 55432 ! -s 127.0.0.1 -j DROP
# verify from another machine: connection to <laptop-ip>:55432 must time out; local psql must still work
# undo:  sudo iptables -D DOCKER-USER -p tcp --dport 55432 ! -s 127.0.0.1 -j DROP
```
(The rule is lost on reboot unless persisted; Option B is the permanent fix.)

## Option B - recreate the container with a loopback binding (permanent; ~10 s outage)
Do this when no test or migration is running. The data lives in the named volume `mmri-v3-local_mmri_v3_local_postgres` and is not touched.
1. Backup: `pg_dump -Fc` the databases you care about (see `ops/backup-postgres.sh`) and verify with a scratch restore.
2. Record the old configuration: `docker inspect mmri-v3-local-postgres-1 > ~/BUSINESSMRI_DB_BACKUPS/container_inspect_<date>.json` (mode 600; contains the password).
3. Stop clients (dev API :4000, QA API :4200, scratch APIs). They reconnect on their own afterwards but in-flight requests fail.
4. `docker stop mmri-v3-local-postgres-1 && docker rm mmri-v3-local-postgres-1` (removes the container only, NOT the volume - never use `-v`).
5. `docker compose -p mmri-v3-local -f docker-compose.local.yml up -d` (the project name `mmri-v3-local` makes compose reuse the existing volume `mmri-v3-local_mmri_v3_local_postgres`).
6. Verify: `ss -ltn | grep 55432` shows `127.0.0.1:55432` only; `docker exec ... psql -U mmri -d mmri -c "select count(*) from users"` returns the same counts as before; start the dev API and run `curl http://127.0.0.1:4000/health`.
7. Rollback: stop/remove the new container and recreate it from the saved inspect (same image `postgres:16-alpine`, same volume, `-p 55432:5432`, same env) - the data volume is unchanged.
## Recommended afterwards
Rotate the default password (`ALTER USER mmri PASSWORD '<long random>'`), update `DATABASE_URL` in `backend/.env` and the QA env files, restart the services, and keep the new password out of Git. This is intentionally NOT done automatically because it breaks every running service until their env files are updated.
