import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPTS = resolve(__dirname, "../../scripts");
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

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "contracts-"));
  mkdirSync(join(dir, "contracts"));
  writeFileSync(join(dir, "contracts/a.ts"), "export const a = 1;\n");
  writeFileSync(join(dir, "contracts/b.ts"), "export const b = 2;\n");
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("contracts:check", () => {
  it("passes right after the lock is generated", () => {
    expect(run("contracts-generate-lock.mjs").code).toBe(0);
    expect(run("contracts-check.mjs").code).toBe(0);
  });

  it("fails when the lock file is missing", () => {
    const result = run("contracts-check.mjs");
    expect(result.code).toBe(1);
    expect(result.output).toContain("contracts.lock.json is missing");
  });

  it("fails when a contract was edited by hand", () => {
    run("contracts-generate-lock.mjs");
    writeFileSync(join(dir, "contracts/a.ts"), "export const a = 99;\n");
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
    writeFileSync(join(dir, "contracts/c.ts"), "export const c = 3;\n");
    expect(run("contracts-check.mjs").output).toContain("not in the lock file: c.ts");
  });

  it("ignores Windows line endings", () => {
    run("contracts-generate-lock.mjs");
    writeFileSync(join(dir, "contracts/a.ts"), "export const a = 1;\r\n");
    expect(run("contracts-check.mjs").code).toBe(0);
  });
});

describe("contracts:sync", () => {
  it("copies the backend's contracts and regenerates the lock", () => {
    const source = join(dir, "backend-contracts");
    mkdirSync(source);
    writeFileSync(join(source, "a.ts"), "export const a = 'from backend';\n");

    expect(run("contracts-sync.mjs", { CONTRACTS_SOURCE: source }).code).toBe(0);
    expect(readFileSync(join(dir, "contracts/a.ts"), "utf8")).toContain("from backend");
    expect(run("contracts-check.mjs").code).toBe(0);
  });

  it("explains itself when the source folder does not exist", () => {
    const result = run("contracts-sync.mjs", { CONTRACTS_SOURCE: join(dir, "nope") });
    expect(result.code).toBe(1);
    expect(result.output).toContain("Contracts source not found");
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

describe("contracts:sync details", () => {
  it("removes contracts the backend deleted", () => {
    const source = join(dir, "backend-contracts");
    mkdirSync(source);
    writeFileSync(join(source, "a.ts"), "export const a = 1;\n");

    expect(run("contracts-sync.mjs", { CONTRACTS_SOURCE: source }).code).toBe(0);
    expect(existsSync(join(dir, "contracts/b.ts"))).toBe(false);
    expect(run("contracts-check.mjs").code).toBe(0);
  });

  it("creates the contracts folder on a fresh project", () => {
    const source = join(dir, "backend-contracts");
    mkdirSync(source);
    writeFileSync(join(source, "a.ts"), "export const a = 1;\n");
    rmSync(join(dir, "contracts"), { recursive: true });

    expect(run("contracts-sync.mjs", { CONTRACTS_SOURCE: source }).code).toBe(0);
    expect(existsSync(join(dir, "contracts/a.ts"))).toBe(true);
  });

  it("refuses to sync a folder onto itself", () => {
    const result = run("contracts-sync.mjs", { CONTRACTS_SOURCE: join(dir, "contracts") });
    expect(result.code).toBe(1);
    expect(result.output).toContain("own contracts folder");
  });

  it("refuses an empty source", () => {
    const source = join(dir, "empty");
    mkdirSync(source);
    expect(run("contracts-sync.mjs", { CONTRACTS_SOURCE: source }).output).toContain("No .ts contract files");
  });
});
