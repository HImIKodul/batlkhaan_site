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
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw badRequest("Request body must be valid JSON"); }
}
