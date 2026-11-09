import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { constants as fsConstants } from "node:fs";
import { access, stat } from "node:fs/promises";
import type { ApiConfig } from "./config.js";

type MethodKey = string;

export class OperationalMetrics {
  private readonly startedAt = Date.now();
  private requestsTotal = 0;
  private errorsTotal = 0;
  private readonly statusClass = new Map<string, number>();
  private readonly methodCounts = new Map<MethodKey, number>();
  private activeRequests = 0;
  private durationMsSum = 0;

  begin(req: IncomingMessage) {
    const started = process.hrtime.bigint();
    this.activeRequests += 1;
    this.requestsTotal += 1;
    const method = req.method ?? "UNKNOWN";
    this.methodCounts.set(method, (this.methodCounts.get(method) ?? 0) + 1);
    let ended = false;
    return (statusCode: number) => {
      if (ended) return;
      ended = true;
      this.activeRequests = Math.max(0, this.activeRequests - 1);
      const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
      this.durationMsSum += durationMs;
      const klass = `${Math.floor(statusCode / 100)}xx`;
      this.statusClass.set(klass, (this.statusClass.get(klass) ?? 0) + 1);
      if (statusCode >= 500) this.errorsTotal += 1;
    };
  }

  snapshot(){ return { activeRequests:this.activeRequests, requestsTotal:this.requestsTotal, errorsTotal:this.errorsTotal }; }

  render(config: ApiConfig, acceptingTraffic=true) {
    const lines = [
      "# HELP mmri_up Whether this process is running.",
      "# TYPE mmri_up gauge",
      "mmri_up 1",
      "# HELP mmri_accepting_traffic Whether this instance is accepting customer traffic.",
      "# TYPE mmri_accepting_traffic gauge",
      `mmri_accepting_traffic ${acceptingTraffic?1:0}`,
      "# HELP mmri_uptime_seconds Process uptime in seconds.",
      "# TYPE mmri_uptime_seconds gauge",
      `mmri_uptime_seconds ${Math.max(0, Math.floor((Date.now() - this.startedAt) / 1000))}`,
      "# HELP mmri_http_requests_total Total HTTP requests accepted by the process.",
      "# TYPE mmri_http_requests_total counter",
      `mmri_http_requests_total ${this.requestsTotal}`,
      "# HELP mmri_http_active_requests Current active HTTP requests.",
      "# TYPE mmri_http_active_requests gauge",
      `mmri_http_active_requests ${this.activeRequests}`,
      "# HELP mmri_http_errors_total Total HTTP 5xx responses.",
      "# TYPE mmri_http_errors_total counter",
      `mmri_http_errors_total ${this.errorsTotal}`,
      "# HELP mmri_http_request_duration_ms_sum Sum of request durations in milliseconds.",
      "# TYPE mmri_http_request_duration_ms_sum counter",
      `mmri_http_request_duration_ms_sum ${this.durationMsSum.toFixed(3)}`,
      `mmri_process_resident_memory_bytes ${process.memoryUsage().rss}`,
      `mmri_process_heap_used_bytes ${process.memoryUsage().heapUsed}`,
      `mmri_release_info{release_sha="${escapeLabel(config.releaseSha)}",instance_id="${escapeLabel(config.instanceId)}"} 1`,
    ];
    for (const [klass, count] of [...this.statusClass.entries()].sort()) {
      lines.push(`mmri_http_responses_total{status_class="${escapeLabel(klass)}"} ${count}`);
    }
    for (const [method, count] of [...this.methodCounts.entries()].sort()) {
      lines.push(`mmri_http_requests_by_method_total{method="${escapeLabel(method)}"} ${count}`);
    }
    return `${lines.join("\n")}\n`;
  }
}

export async function reportStorageReady(config:ApiConfig){
  if(config.environment!=="production")return;
  const info=await stat(config.reportStorageDir);
  if(!info.isDirectory())throw new Error("Report storage is not a directory");
  await access(config.reportStorageDir,fsConstants.R_OK|fsConstants.W_OK);
}

export function validMetricsCredential(req: IncomingMessage, config: ApiConfig) {
  const header = req.headers["x-metrics-token"];
  const raw = Array.isArray(header) ? header[0] : header;
  const auth = req.headers.authorization;
  const supplied = raw || (auth?.startsWith("Bearer ") ? auth.slice(7) : "");
  return safeEqual(supplied ?? "", config.metricsToken);
}

export async function databaseReady(config: ApiConfig, ping: () => Promise<unknown>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Database readiness timeout")), config.readinessDbTimeoutMs);
    timer.unref?.();
  });
  try {
    await Promise.race([ping(), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function structuredRequestLog(args: {
  requestId: string; method: string; path: string; status: number; durationMs: number; releaseSha: string; instanceId: string;
}) {
  return JSON.stringify({
    ts: new Date().toISOString(),
    level: args.status >= 500 ? "error" : args.status >= 400 ? "warn" : "info",
    event: "http_request",
    requestId: args.requestId, method: args.method, path: args.path, status: args.status,
    durationMs: Number(args.durationMs.toFixed(2)), releaseSha: args.releaseSha, instanceId: args.instanceId,
  });
}

function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && aa.length > 0 && timingSafeEqual(aa, bb);
}
function escapeLabel(value: string) { return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " "); }
