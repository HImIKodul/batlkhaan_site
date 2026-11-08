import readline from "node:readline";
import { Writable } from "node:stream";
import { prisma } from "./db.js";
import { loadApiConfig } from "./api/config.js";
import { AdminService, type AdminRole } from "./api/admin/admin-service.js";
import { otpauthUri } from "./api/admin/totp.js";

/* Admin provisioning (no public admin registration exists).
   npm run admin:bootstrap -- --email you@company.mn [--role SUPER_ADMIN|REPORT_REVIEWER|BILLING_REVIEWER]   (password typed at a hidden prompt)
   npm run admin:reset-mfa  -- --email you@company.mn
   npm run admin:disable    -- --email you@company.mn        npm run admin:enable -- --email you@company.mn
   npm run admin:list
   The password is never taken from the command line or the environment. For automation only: --password-stdin reads one line from stdin.
   The one-time MFA secret is printed to this terminal only; it is never written to a log or file. */
const [, , command, ...rest] = process.argv;
const arg = (name: string) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : undefined; };
const flag = (name: string) => rest.includes(`--${name}`);

function ask(prompt: string, hidden: boolean): Promise<string> {
  return new Promise(resolve => {
    const muted = new Writable({ write(chunk, enc, cb) { if (!hidden) process.stdout.write(chunk, enc as BufferEncoding); cb(); } });
    const rl = readline.createInterface({ input: process.stdin, output: muted, terminal: true });
    process.stdout.write(prompt);
    rl.question("", answer => { rl.close(); if (hidden) process.stdout.write("\n"); resolve(answer); });
  });
}
async function readStdinLine(): Promise<string> { const chunks: Buffer[] = []; for await (const c of process.stdin) chunks.push(c as Buffer); return Buffer.concat(chunks).toString("utf8").split(/\r?\n/)[0]; }

async function main() {
  const config = loadApiConfig(); const svc = new AdminService(config);
  if (command === "bootstrap") {
    const email = arg("email"); const role = (arg("role") ?? "SUPER_ADMIN") as AdminRole;
    if (!email) throw new Error("--email is required");
    if (!["SUPER_ADMIN", "REPORT_REVIEWER", "BILLING_REVIEWER"].includes(role)) throw new Error("invalid --role");
    if (role === "SUPER_ADMIN") { const n = await prisma.adminAccount.count({ where: { role: "SUPER_ADMIN", status: { not: "DISABLED" } } }); if (n > 0 && !flag("allow-additional-super")) throw new Error("A SUPER_ADMIN already exists. Pass --allow-additional-super to add another deliberately."); }
    let password: string;
    if (flag("password-stdin")) password = await readStdinLine();
    else { if (!process.stdin.isTTY) throw new Error("No terminal: type the password interactively or use --password-stdin"); password = await ask("Admin password (hidden, 14+ chars, upper+lower+digit): ", true); const again = await ask("Repeat password: ", true); if (again !== password) throw new Error("Passwords do not match"); }
    const r = await svc.createAdmin({ email, password, role });
    console.log(`\nAdministrator created: ${r.email} (${r.role})\nStatus: PENDING_MFA until the first successful login.\n\nMFA enrollment (shown ONCE, not stored in clear text):\n  Secret : ${r.totpSecret}\n  URI    : ${otpauthUri(r.email, r.totpSecret)}\nAdd the secret to an authenticator app (manual entry, time-based, 6 digits, 30 s), then sign in at /#/admin/login.`);
  } else if (command === "reset-mfa") {
    const email = arg("email"); if (!email) throw new Error("--email is required");
    const r = await svc.resetMfa(email); console.log(`MFA reset, all sessions revoked. New secret (shown ONCE):\n  Secret : ${r.totpSecret}\n  URI    : ${otpauthUri(email, r.totpSecret)}`);
  } else if (command === "disable" || command === "enable") {
    const email = arg("email"); if (!email) throw new Error("--email is required");
    await svc.setStatus(email, command === "disable" ? "DISABLED" : "ACTIVE"); console.log(command === "disable" ? "Administrator disabled and sessions revoked." : "Administrator re-enabled (MFA must be confirmed again at next login).");
  } else if (command === "list") {
    const rows = await prisma.adminAccount.findMany({ orderBy: { createdAt: "asc" } });
    for (const a of rows) { const u = await prisma.user.findUnique({ where: { id: a.userId }, select: { email: true } }); console.log(`${a.role.padEnd(16)} ${a.status.padEnd(12)} ${u?.email}`); }
    if (!rows.length) console.log("No administrators yet.");
  } else { console.log("Commands: bootstrap | reset-mfa | disable | enable | list (see header of src/admin-cli.ts)"); process.exitCode = 1; }
}
main().catch(e => { console.error("Error:", e instanceof Error ? e.message : String(e)); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });
