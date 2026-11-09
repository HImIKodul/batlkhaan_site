# MMRI Production Observability — Backend Step 19

Operational endpoints are deliberately separate from customer diagnostic behavior.

- `GET /live` — process liveness only. No database or external-provider dependency.
- `GET /ready` — traffic readiness. Requires serving state, PostgreSQL readiness, and readable/writable persistent report storage. Returns 503 during drain or dependency failure.
- `GET /health` — compatibility health with release SHA, instance ID, and `serving`/`draining` lifecycle.
- `GET /metrics` — Prometheus text protected by `X-Metrics-Token` or Bearer `METRICS_TOKEN` using constant-time comparison.

Metrics include request/error counters, active requests, request duration sum, process memory, release/instance identity, and `mmri_accepting_traffic` (1 serving / 0 draining).

Every completed request emits one bounded JSON log containing only request ID, method, query-free path, status, duration, release SHA, and instance ID. Unknown production exceptions are logged with the same request ID but without raw SQL/provider/filesystem/customer content.

Minimum alerts:
- readiness failure >2 minutes;
- 5xx rate >2% for 5 minutes;
- p95 latency >1.5s for 10 minutes;
- authentication/rate-limit spikes;
- PostgreSQL saturation/unavailability;
- report-storage unavailability;
- backup job or verification failure;
- process restart loop;
- `mmri_accepting_traffic=0` outside an approved deployment window.

The API uses drain-first shutdown. `/ready` fails before connection shutdown begins so a reverse proxy/load balancer can remove the instance before active HTTP work is terminated.
