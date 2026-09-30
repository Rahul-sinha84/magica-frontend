import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CONTRACTS_DIR, contractFiles, fail, hashContracts, LOCK_FILE, SYNC_HINT } from "./lib/contracts.mjs";

if (!existsSync(LOCK_FILE)) {
  fail(`${LOCK_FILE} is missing. ${SYNC_HINT}`);
}

let expected;
try {
  expected = JSON.parse(readFileSync(LOCK_FILE, "utf8"));
} catch {
  fail(`${LOCK_FILE} is not valid JSON (a merge conflict?). ${SYNC_HINT}`);
}
if (typeof expected !== "object" || expected === null || Array.isArray(expected)) {
  fail(`${LOCK_FILE} has the wrong shape. ${SYNC_HINT}`);
}

const actual = hashContracts();
const problems = [];

for (const file of Object.keys(expected)) {
  if (!(file in actual)) problems.push(`missing contract file: ${file}`);
  else if (actual[file] !== expected[file]) problems.push(`drift: ${file} was edited by hand`);
}
for (const file of Object.keys(actual)) {
  if (!(file in expected)) problems.push(`not in the lock file: ${file}`);
}

// The lock only proves a file matches what was pushed. These two checks prove it is the pushed
// form: Next.js can't resolve "./x.js" to x.ts at build time (tests and tsc can, so nothing else
// fails until deploy), and the header marks a file as generated.
const HEADER = "// Generated from magica-backend";
const JS_RELATIVE_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["'](\.{1,2}\/[^"']*\.js)["']/g;

for (const file of contractFiles(CONTRACTS_DIR)) {
  const text = readFileSync(join(CONTRACTS_DIR, file), "utf8");
  if (!text.split("\n", 1)[0].startsWith(HEADER)) {
    problems.push(`${file}: does not start with the "${HEADER}" header line, so it was not pushed by the backend`);
  }
  for (const [, specifier] of text.matchAll(JS_RELATIVE_SPECIFIER)) {
    problems.push(`${file}: the import "${specifier}" ends in .js, which Next.js can't resolve to a .ts file when building`);
  }
}

if (problems.length > 0) {
  fail(`${problems.map((problem) => `  ${problem}`).join("\n")}\n\nContracts check failed. ${SYNC_HINT}`);
}

console.log("All contracts verified");
