import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPTS = resolve(__dirname, "../../scripts");
const HEADER = "// Generated from magica-backend/src/contracts by `pnpm contracts:sync` (run in the backend repo). Do not edit by hand.\n";
const BACKEND_HINT = "Run `pnpm contracts:sync` in ../magica-backend";
let dir: string;

// runs a real script in a throwaway project folder
function run(script: string, env: Record<string, string> = {}) {
  try {
    const stdout = execFileSync(process.execPath, [join(SCRIPTS, script)], {
      cwd: dir,
      env: { ...process.env, ...env },
      encoding: "utf8",
      stdio: "pipe",
    });
    return { code: 0, output: stdout };
  } catch (error) {
    const failure = error as { status: number; stdout: string; stderr: string };
    return { code: failure.status, output: failure.stdout + failure.stderr };
  }
}

// a contract file as the backend pushes it: generated header first
const pushed = (body: string) => HEADER + body;
const write = (file: string, text: string) => writeFileSync(join(dir, "contracts", file), text);
const snapshot = () => Object.fromEntries(readdirSync(join(dir, "contracts")).map((f) => [f, readFileSync(join(dir, "contracts", f), "utf8")]));

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "contracts-"));
  mkdirSync(join(dir, "contracts"));
  write("a.ts", pushed("export const a = 1;\n"));
  write("b.ts", pushed('import { a } from "./a";\nexport const b = a + 1;\n'));
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("contracts:check", () => {
  it("passes right after the lock is written", () => {
    expect(run("contracts-generate-lock.mjs").code).toBe(0);
    const result = run("contracts-check.mjs");
    expect(result.code).toBe(0);
    expect(result.output).toContain("All contracts verified");
  });

  it("fails when the lock file is missing", () => {
    const result = run("contracts-check.mjs");
    expect(result.code).toBe(1);
    expect(result.output).toContain("contracts.lock.json is missing");
    expect(result.output).toContain(BACKEND_HINT);
  });

  it("fails when a contract was edited by hand", () => {
    run("contracts-generate-lock.mjs");
    write("a.ts", pushed("export const a = 99;\n"));
    const result = run("contracts-check.mjs");
    expect(result.code).toBe(1);
    expect(result.output).toContain("drift: a.ts");
  });

  it("fails when a contract file is deleted", () => {
    run("contracts-generate-lock.mjs");
    unlinkSync(join(dir, "contracts/b.ts"));
    expect(run("contracts-check.mjs").output).toContain("missing contract file: b.ts");
  });

  it("fails when a contract file is not in the lock", () => {
    run("contracts-generate-lock.mjs");
    write("c.ts", pushed("export const c = 3;\n"));
    expect(run("contracts-check.mjs").output).toContain("not in the lock file: c.ts");
  });

  it("ignores Windows line endings", () => {
    run("contracts-generate-lock.mjs");
    write("a.ts", pushed("export const a = 1;\n").replace(/\n/g, "\r\n")); // header too
    expect(run("contracts-check.mjs").code).toBe(0);
  });
});

describe("contracts:check insists on the pushed form", () => {
  // the lock is regenerated each time, so only the new rules can fail here
  const lockThen = () => (run("contracts-generate-lock.mjs"), run("contracts-check.mjs"));

  it.each([
    ['from "./a.js"', 'import { a } from "./a.js";\nexport const b = a;\n'],
    ["a side-effect import", 'import "./a.js";\nexport const b = 1;\n'],
    ["a dynamic import", 'export const load = () => import("./a.js");\n'],
    ["a re-export", 'export * from "./a.js";\n'],
    ["a type import", 'import type { A } from "./a.js";\nexport type B = A;\n'],
    ["single quotes", "import { a } from './a.js';\nexport const b = a;\n"],
    ["a parent folder", 'import { a } from "../a.js";\nexport const b = a;\n'],
  ])("fails a relative import that ends in .js (%s)", (_name, body) => {
    write("b.ts", pushed(body));
    const result = lockThen();
    expect(result.code).toBe(1);
    expect(result.output).toContain("b.ts");
    expect(result.output).toContain(".js");
    expect(result.output).toContain(BACKEND_HINT);
  });

  it("names the import that is wrong", () => {
    write("b.ts", pushed('import { a } from "./a.js";\n'));
    expect(lockThen().output).toContain('"./a.js"');
  });

  it("reports every offending file, not just the first", () => {
    write("a.ts", pushed('export * from "./b.js";\n'));
    write("b.ts", pushed('export * from "./a.js";\n'));
    const output = lockThen().output;
    expect(output).toContain("a.ts");
    expect(output).toContain("b.ts");
  });

  it("allows imports from packages and extensionless relative imports", () => {
    write("b.ts", pushed('import { z } from "zod";\nimport { a } from "./a";\nimport x from "some-pkg/dist/index.js";\nexport const b = [z, a, x];\n'));
    expect(lockThen().code).toBe(0);
  });

  it("does not mistake .json or .jsx for .js", () => {
    write("b.ts", pushed('import data from "./data.json";\nimport View from "./view.jsx";\nexport const b = [data, View];\n'));
    expect(lockThen().code).toBe(0);
  });

  it("fails a file without the generated header", () => {
    write("b.ts", "export const b = 2;\n");
    const result = lockThen();
    expect(result.code).toBe(1);
    expect(result.output).toContain("b.ts");
    expect(result.output).toContain("header");
    expect(result.output).toContain(BACKEND_HINT);
  });

  it("fails a file whose first line is something else, even if the header appears later", () => {
    write("b.ts", "// hand-written\n" + pushed("export const b = 2;\n"));
    expect(lockThen().output).toContain("b.ts");
  });

  it("fails a file that starts with a blank line before the header", () => {
    write("b.ts", "\n" + pushed("export const b = 2;\n"));
    expect(lockThen().code).toBe(1);
  });

  it("checks the header on every file", () => {
    write("a.ts", "export const a = 1;\n");
    write("b.ts", "export const b = 2;\n");
    const output = lockThen().output;
    expect(output).toContain("a.ts");
    expect(output).toContain("b.ts");
  });
});

describe("contracts:check on a damaged project", () => {
  it("explains an unreadable lock file instead of crashing", () => {
    writeFileSync(join(dir, "contracts.lock.json"), '<<<<<<< HEAD\n{ "a.ts": "1" }\n=======\n');
    const result = run("contracts-check.mjs");
    expect(result.code).toBe(1);
    expect(result.output).toContain("not valid JSON");
    expect(result.output).not.toContain("SyntaxError");
  });

  it("rejects a lock file that is not an object", () => {
    writeFileSync(join(dir, "contracts.lock.json"), "[]");
    expect(run("contracts-check.mjs").output).toContain("wrong shape");
  });

  it("explains a missing contracts folder", () => {
    rmSync(join(dir, "contracts"), { recursive: true });
    writeFileSync(join(dir, "contracts.lock.json"), "{}");
    const result = run("contracts-check.mjs");
    expect(result.code).toBe(1);
    expect(result.output).toContain("folder is missing");
  });
});

describe("contracts:sync", () => {
  it("does not copy anything; it says where the sync lives", () => {
    const result = run("contracts-sync.mjs");
    expect(result.code).toBe(1);
    expect(result.output).toContain("pushed from the backend");
    expect(result.output).toContain(BACKEND_HINT);
    expect(result.output).toContain("FRONTEND_REPO_PATH");
    expect(result.output).toContain("pnpm contracts:check");
  });

  it("leaves the contracts and the lock exactly as they were", () => {
    run("contracts-generate-lock.mjs");
    const before = { files: snapshot(), lock: readFileSync(join(dir, "contracts.lock.json"), "utf8") };

    run("contracts-sync.mjs");

    expect(snapshot()).toEqual(before.files);
    expect(readFileSync(join(dir, "contracts.lock.json"), "utf8")).toBe(before.lock);
  });

  it("ignores a source folder even if one is named, so the old pull can't come back", () => {
    const source = join(dir, "backend-contracts");
    mkdirSync(source);
    writeFileSync(join(source, "evil.ts"), "export const evil = 1;\n");

    const result = run("contracts-sync.mjs", { CONTRACTS_SOURCE: source });

    expect(result.code).toBe(1);
    expect(existsSync(join(dir, "contracts/evil.ts"))).toBe(false);
    expect(existsSync(join(dir, "contracts.lock.json"))).toBe(false);
  });

  it("creates nothing in a project that has no contracts folder", () => {
    rmSync(join(dir, "contracts"), { recursive: true });
    expect(run("contracts-sync.mjs").code).toBe(1);
    expect(existsSync(join(dir, "contracts"))).toBe(false);
  });
});
