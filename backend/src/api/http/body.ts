import type { IncomingMessage } from "node:http";
import { badRequest } from "../errors.js";

export async function readJson(req: IncomingMessage, maxBytes = 1_000_000): Promise<any> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += b.length;
    if (size > maxBytes) throw badRequest("Request body too large");
    chunks.push(b);
  }
  if (!chunks.length) return {};
  const text = Buffer.concat(chunks).toString("utf8");
  // PostgreSQL cannot store NUL characters: they would surface as a 500 from the database layer. Reject them (raw or JSON-escaped) as a client error.
  if (text.includes("\u0000") || /\\u0000/i.test(text)) throw badRequest("Request body contains an invalid character");
  let parsed: unknown;
  try { parsed = JSON.parse(text); }
  catch { throw badRequest("Request body must be valid JSON"); }
  // Every route reads named properties from the body; null, arrays and primitives used to reach handlers and crash them with a 500.
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw badRequest("Request body must be a JSON object");
  return parsed;
}
