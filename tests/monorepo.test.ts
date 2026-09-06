import { describe, expect, test } from "bun:test";
import { scanTarget } from "../src/scanner/scan";
import { FIXTURE_DIR, memoryFileSystem, repoFiles } from "./helpers/memory-fs";

const RUNTIME = { bun: "1.4.2", node: "22.22.0" };

const MONOREPO = {
  "package.json": JSON.stringify({ name: "root", private: true, workspaces: ["packages/*"] }),
  "bun.lock": '{"lockfileVersion":2,"packages":{}}',
  "packages/a/package.json": JSON.stringify({
    name: "a",
    dependencies: { "better-sqlite3": "^9" },
  }),
  "packages/a/index.ts": 'import "node:path";',
  "packages/b/package.json": JSON.stringify({ name: "b", dependencies: { zod: "^3" } }),
  "packages/b/index.ts": 'import "node:fs";',
};

async function scan(files: Record<string, string>, options: Record<string, unknown> = {}) {
  const result = await scanTarget(FIXTURE_DIR, {
    fs: memoryFileSystem(repoFiles(files)),
    runtime: RUNTIME,
    ...options,
  });
  if (!result.ok) {
    throw new Error(`scan failed: ${result.error.message}`);
  }
  return result.value;
}

describe("monorepo scanning", () => {
  test("scans the root and every workspace package, and aggregates", async () => {
    const report = await scan(MONOREPO);

    expect(report.targets?.map((target) => target.relative)).toEqual([
      ".",
      "packages/a",
      "packages/b",
    ]);
    expect(report.targets?.find((target) => target.relative === "packages/a")?.verdict).toBe(
      "risky",
    );
    expect(report.targets?.find((target) => target.relative === "packages/b")?.verdict).toBe(
      "ready",
    );
    expect(report.stats?.nodeBuiltins).toBe(2);
  });

  test("findings carry the directory they came from", async () => {
    const report = await scan(MONOREPO);
    const native = report.findings.find((finding) => finding.id === "install/native-addon");
    expect(native?.path).toBe("/repo/packages/a");
  });

  test("--scope narrows the scan and leaves the root out", async () => {
    const report = await scan(MONOREPO, { scope: "packages/b" });
    expect(report.targets).toBeUndefined();
    expect(report.findings.some((finding) => finding.id === "install/native-addon")).toBe(false);
  });

  test("--scope on a repository without workspaces is a usage error", async () => {
    const result = await scanTarget(FIXTURE_DIR, {
      fs: memoryFileSystem(repoFiles({ "package.json": JSON.stringify({ name: "app" }) })),
      runtime: RUNTIME,
      scope: "anything",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("E_USAGE");
    }
  });

  test("--scope that matches nothing names the available packages", async () => {
    const result = await scanTarget(FIXTURE_DIR, {
      fs: memoryFileSystem(repoFiles(MONOREPO)),
      runtime: RUNTIME,
      scope: "packages/z",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.hint).toContain("packages/a");
      expect(result.error.hint).toContain("packages/b");
    }
  });

  test("pnpm workspaces are detected from pnpm-workspace.yaml", async () => {
    const report = await scan({
      "package.json": JSON.stringify({ name: "root", private: true }),
      "pnpm-workspace.yaml": "packages:\n  - 'apps/*'\n",
      "apps/web/package.json": JSON.stringify({ name: "web" }),
    });
    expect(report.targets?.map((target) => target.relative)).toEqual([".", "apps/web"]);
  });

  test("a single-package repository keeps the old shape (no targets field)", async () => {
    const report = await scan({ "package.json": JSON.stringify({ name: "app" }) });
    expect(report.targets).toBeUndefined();
  });
});

describe("baseline in a scan", () => {
  test("knows what was already accepted and marks the rest", async () => {
    const first = await scan(MONOREPO);
    const known = first.findings.filter((finding) => finding.id === "install/native-addon");
    const { serializeBaseline } = await import("../src/config/baseline");

    const files = {
      ...MONOREPO,
      "baseline.json": serializeBaseline(known),
    };

    const second = await scan(files, { baselinePath: `${FIXTURE_DIR}/baseline.json` });
    expect(second.baseline?.known).toBe(known.length);
    expect(second.baseline?.new).toBe(second.findings.length - known.length);
  });

  test("a missing baseline file is an error with the command that creates one", async () => {
    const result = await scanTarget(FIXTURE_DIR, {
      fs: memoryFileSystem(repoFiles(MONOREPO)),
      runtime: RUNTIME,
      baselinePath: `${FIXTURE_DIR}/nope.json`,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("E_IO");
      expect(result.error.hint).toContain("--write-baseline");
    }
  });
});
