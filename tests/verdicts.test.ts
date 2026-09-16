import { describe, expect, test } from "bun:test";
import { verdictFor } from "../src/report/types";
import { scanTarget } from "../src/scanner/scan";
import { FIXTURE_DIR, memoryFileSystem, repoFiles } from "./helpers/memory-fs";

const RUNTIME = { bun: "1.4.2", node: "22.22.0" };

const MONOREPO = {
  "package.json": JSON.stringify({ name: "root", private: true, workspaces: ["packages/*"] }),
  "packages/blocked/package.json": JSON.stringify({
    name: "blocked",
    dependencies: { sharp: "^0.32.0" },
  }),
  "packages/blocked/index.ts": 'import "node:path";',
  "packages/blocked/package-lock.json": JSON.stringify({
    lockfileVersion: 3,
    packages: {
      "": { name: "blocked" },
      "node_modules/sharp": { version: "0.32.6", hasInstallScript: true },
    },
  }),
  "packages/clean/package.json": JSON.stringify({ name: "clean" }),
  "packages/clean/index.ts": 'import "node:path";',
  "package-lock.json": JSON.stringify({
    lockfileVersion: 3,
    packages: {
      "": { name: "root" },
      "node_modules/sharp": { version: "0.32.6", hasInstallScript: true },
    },
  }),
};

async function scan(files: Record<string, string>, config?: string) {
  const input = config === undefined ? files : { ...files, "bunready.config.json": config };
  const result = await scanTarget(FIXTURE_DIR, {
    fs: memoryFileSystem(repoFiles(input)),
    runtime: RUNTIME,
  });
  if (!result.ok) {
    throw new Error(`scan failed: ${result.error.message}`);
  }
  return result.value;
}

describe("per-target verdicts agree with the report", () => {
  test("a blocked package shows as blocked, and so does the report", async () => {
    const report = await scan(MONOREPO);
    const blocked = report.targets?.find((target) => target.relative === "packages/blocked");
    const clean = report.targets?.find((target) => target.relative === "packages/clean");

    expect(blocked?.verdict).toBe("blocked");
    expect(clean?.verdict).toBe("ready");
    expect(report.verdict).toBe("blocked");
    expect(blocked?.counts.blocker).toBeGreaterThan(0);
    expect(clean?.counts.blocker).toBe(0);
  });

  test("ignoring the blocker lowers the package verdict with the report", async () => {
    const report = await scan(MONOREPO, '{"ignore":["install/lifecycle-script"]}');
    const blocked = report.targets?.find((target) => target.relative === "packages/blocked");

    expect(blocked?.verdict).not.toBe("blocked");
    expect(blocked?.counts.blocker).toBe(0);
    expect(report.counts.blocker).toBe(0);
    expect(report.verdict).toBe(verdictFor(report.findings));
  });

  test("the report verdict is the worst of its findings, and each target's too", async () => {
    const report = await scan(MONOREPO);
    expect(report.verdict).toBe(verdictFor(report.findings));
    expect(report.targets?.length).toBe(3);
    for (const target of report.targets ?? []) {
      // Paths in a report are normalised, so this grouping works on Windows too.
      expect(target.path).not.toContain("\\");
      const own = report.findings.filter((finding) => finding.path === target.path);
      expect(target.verdict).toBe(verdictFor(own));
      expect(target.counts.blocker).toBe(
        own.filter((finding) => finding.severity === "blocker").length,
      );
    }
  });
});
