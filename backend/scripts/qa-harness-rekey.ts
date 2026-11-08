/* Re-seals the QA customer and the QA administrator of ONE scrubbed harness clone (mmri_ws_a..h) after the harness secrets were replaced.
   Why: password hashes depend on PASSWORD_PEPPER and admin MFA secrets are encrypted with ACCESS_TOKEN_SECRET (+":admin-mfa"), so changing the harness
   env makes the existing test accounts unusable. This keeps every test credential exactly as it is (same passwords, same TOTP secret) and only
   re-hashes / re-encrypts them under the NEW isolated secrets. It never touches production: it accepts only database names mmri_ws_[a-h].
   Env: REKEY_DB, DATABASE_URL_BASE (e.g. postgresql://…@host:port/), OLD_ACCESS_TOKEN_SECRET, NEW_ACCESS_TOKEN_SECRET, NEW_PASSWORD_PEPPER,
        QA_CREDS (file with email=/password=), ADMIN_CREDS (file with email=/password=/secret=). Prints status only, never a secret. */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/api/auth/crypto.js";
import { decryptSecret, encryptSecret } from "../src/api/admin/totp.js";

const need = (k: string) => { const v = process.env[k]; if (!v) throw new Error(`missing ${k}`); return v; };
const db = need("REKEY_DB");
if (!/^mmri_ws_[a-h]$/.test(db)) throw new Error(`refusing database ${db}: only scrubbed harness clones mmri_ws_a..h are allowed`);
const creds = (file: string) => Object.fromEntries(readFileSync(file, "utf8").split("\n").filter(l => l.includes("=")).map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const qa = creds(need("QA_CREDS")), admin = creds(need("ADMIN_CREDS"));
const oldKey = need("OLD_ACCESS_TOKEN_SECRET") + ":admin-mfa", newKey = need("NEW_ACCESS_TOKEN_SECRET") + ":admin-mfa", pepper = need("NEW_PASSWORD_PEPPER");
if (need("NEW_ACCESS_TOKEN_SECRET") === need("OLD_ACCESS_TOKEN_SECRET")) throw new Error("new and old ACCESS_TOKEN_SECRET are identical: nothing would be isolated");

const prisma = new PrismaClient({ datasources: { db: { url: `${need("DATABASE_URL_BASE")}${db}?schema=public` } } });
try {
  for (const [label, c] of [["QA customer", qa], ["QA administrator", admin]] as const) {
    const user = await prisma.user.findUnique({ where: { email: c.email }, select: { id: true } });
    if (!user) { console.log(`${db}: ${label} not present (skipped)`); continue; }
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(c.password, pepper) } });
    console.log(`${db}: ${label} password re-hashed under the new pepper`);
  }
  const au = await prisma.user.findUnique({ where: { email: admin.email }, select: { id: true } });
  const acc = au ? await prisma.adminAccount.findUnique({ where: { userId: au.id } }) : null;
  if (acc?.mfaSecretEnc) {
    const plain = decryptSecret(acc.mfaSecretEnc, oldKey);
    if (admin.secret && plain !== admin.secret) throw new Error(`${db}: decrypted MFA secret does not match the credentials file; refusing to re-seal`);
    await prisma.adminAccount.update({ where: { id: acc.id }, data: { mfaSecretEnc: encryptSecret(plain, newKey), failedLogins: 0, lockedUntil: null } });
    console.log(`${db}: QA administrator MFA secret re-encrypted under the new key`);
  } else console.log(`${db}: no administrator MFA record to re-seal`);
} finally { await prisma.$disconnect(); }
