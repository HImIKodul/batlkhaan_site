/* WS-E helper: build the PDF source JSON (exactly what the service hands the Python renderer) from a report JSON fetched from the API.
   Usage: npx tsx scripts/qa-wse-dump-pdf-source.mts <report.json> <out.json> [domainCode] */
import fs from "node:fs";
import { buildReportPdfSource } from "../src/report/pdf-artifact.js";
const [,, inp, out, dom] = process.argv;
const r = JSON.parse(fs.readFileSync(inp, "utf8")); const rep = r.data ?? r;
const src = buildReportPdfSource(rep.payload, rep.narrative);
fs.writeFileSync(out, JSON.stringify({ ...src, render: { domainCode: dom ?? null } }));
console.log("ok", out);
