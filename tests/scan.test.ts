import { describe, expect, test } from "bun:test";
import { exitCodeForSeverities } from "../src/rules/severity";
import { scanTarget } from "../src/scanner/scan";
import { FIXTURE_DIR, memoryFileSystem, repoFiles } from "./helpers/memory-fs";

const RUNTIME = { bun: "1.4.2", node: "22.22.0" };

async function scan(files: Record<string, string>) {
  const result = await scanTarget(FIXTURE_DIR, {
    fs: memoryFileSystem(repoFiles(files)),
    runtime: RUNTIME,
  });
  if (!result.ok) {
    throw new Error(`scan failed: ${result.error.message}`);
  }
  return result.value;
}

describe("scanTarget", () => {
  test("reports a blocked repository and carries the stats behind the verdict", async () => {
    const report = await scan({
      "package.json": JSON.stringify({ name: "app", dependencies: { sharp: "^0.32.0" } }),
      "package-lock.json": JSON.stringify({
        lockfileVersion: 3,
        packages: {
          "": { name: "app" },
          "node_modules/sharp": { version: "0.32.6", hasInstallScript: true },
        },
      }),
    });

    expect(report.tool).toBe("bunready");
    expect(report.verdict).toBe("blocked");
    expect(report.counts.blocker).toBeGreaterThan(0);
    expect(report.stats?.directDependencies).toBe(1);
    expect(report.stats?.lockedPackages).toBe(1);
    expect(exitCodeForSeverities(report.findings.map((finding) => finding.severity))).toBe(1);
  });

  test("a repository with nothing to report is ready and exits 0", async () => {
    const report = await scan({ "package.json": JSON.stringify({ name: "app" }) });

    expect(report.verdict).toBe("ready");
    expect(report.counts.blocker).toBe(0);
    expect(exitCodeForSeverities(report.findings.map((finding) => finding.severity))).toBe(0);
  });

  test("every finding carries a severity, an id, a title and a detail", async () => {
    const report = await scan({
      "package.json": JSON.stringify({ name: "app", dependencies: { "better-sqlite3": "^9" } }),
    });

    expect(report.findings.length).toBeGreaterThan(0);
    for (const finding of report.findings) {
      expect(finding.id.length).toBeGreaterThan(0);
      expect(finding.title.length).toBeGreaterThan(0);
      expect(finding.detail.length).toBeGreaterThan(0);
      expect(["blocker", "risk", "info"]).toContain(finding.severity);
    }
  });

  test("a missing package.json is an error, not a ready verdict", async () => {
    const result = await scanTarget(FIXTURE_DIR, { fs: memoryFileSystem({}), runtime: RUNTIME });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("E_IO");
      expect(result.error.hint).toBeDefined();
    }
  });

  test("an unreadable package.json is reported as a parse error", async () => {
    const result = await scanTarget(FIXTURE_DIR, {
      fs: memoryFileSystem(repoFiles({ "package.json": "{ broken" })),
      runtime: RUNTIME,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("E_PARSE");
    }
  });
});
