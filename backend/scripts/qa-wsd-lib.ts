/* Shared helpers for the workstream-D regression scripts. Refuses to run against anything but the private clone mmri_ws_d. */
import { randomUUID } from "node:crypto";
import { prisma } from "../src/db.js";

if (!/\/mmri_ws_d\b/.test(process.env.DATABASE_URL ?? "")) { console.error("Refusing to run: DATABASE_URL is not the private clone mmri_ws_d"); process.exit(2); }
export const API = process.env.API ?? "http://127.0.0.1:4114";
export const ORIGIN = process.env.ORIGIN ?? "http://127.0.0.1:4214";
export let fail = 0;
export const rec = (n: string, ok: boolean, d = "") => { if (!ok) fail++; console.log((ok ? "PASS " : "FAIL ") + n + (d ? " | " + d : "")); };
export async function http(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(API + "/api/v1" + path, { method, headers: { origin: ORIGIN, "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  let json: any = null; try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, body: json, data: json?.data ?? json };
}
export async function registerUser(prefix: string) {
  const email = `${prefix}.${randomUUID().slice(0, 8)}@mmri.test`; const password = "Qa-Wsd-" + randomUUID().slice(0, 12) + "!9";
  const r = await http("POST", "/auth/register", undefined, { email, password, displayName: prefix });
  if (r.status !== 201) throw new Error("register failed " + r.status + " " + JSON.stringify(r.body));
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return { email, password, id: user.id, token: r.data.accessToken as string };
}
export async function loginQa() {
  const email = "qa.local@mmri.test"; const line = (await import("node:fs")).readFileSync("/home/kirby/Downloads/MMRI_FUNCTIONAL_REPAIR/harness/creds-qa.local", "utf8");
  const password = /password=(.*)/.exec(line)![1].trim();
  const r = await http("POST", "/auth/login", undefined, { email, password });
  if (r.status !== 200) throw new Error("qa login failed " + r.status);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return { email, id: user.id, token: r.data.accessToken as string };
}
export { prisma, randomUUID };
