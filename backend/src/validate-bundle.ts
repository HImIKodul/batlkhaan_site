import { readFile } from "node:fs/promises";
import type { MethodologyBundle } from "./lib/bundle-types.js";
import { validateBundle } from "./lib/validate-bundle-core.js";

const path = process.argv[2];
if (!path) throw new Error("Usage: tsx src/validate-bundle.ts <bundle.json>");
const bundle = JSON.parse(await readFile(path, "utf8")) as MethodologyBundle;
const issues = validateBundle(bundle);
if (issues.length) {
  for (const issue of issues) console.error(`ERROR ${issue.code}: ${issue.message}`);
  process.exit(1);
}
console.log("Bundle validation PASS");
console.log(`categories=${bundle.categories.length} cells=${bundle.cellInstances.length} questions=${bundle.questions.length}`);
