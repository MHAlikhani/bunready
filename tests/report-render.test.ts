import { describe, expect, test } from "bun:test";
import { createTheme } from "../src/cli/theme";
import { renderHumanReport } from "../src/report/human";
import { renderJsonReport } from "../src/report/json";
import type { ScanReport } from "../src/report/types";

const REPORT: ScanReport = {
  schemaVersion: 1,
  failOn: "blocker",
  tool: "bunready",
  version: "0.1.0",
  target: "C:\\work\\app",
  verdict: "blocked",
  counts: { blocker: 1, risk: 1, info: 0 },
  findings: [
    {
      id: "install/lifecycle-script",
      severity: "blocker",
      title: "sharp installs nothing: its install script will not run",
      detail: "Bun installs dependencies without running their lifecycle scripts.",
      evidence: "the lockfile marks sharp as requiring a build step",
      hint: 'add "sharp" to trustedDependencies in package.json, then reinstall.',
      source: "https://bun.com/docs/pm/lifecycle",
    },
    {
      id: "install/native-addon",
      severity: "risk",
      title: "sharp ships a native addon",
      detail: "Ships prebuilt libvips binaries per platform.",
      evidence: "declared in package.json",
      source: "https://www.npmjs.com/package/sharp",
    },
  ],
  stats: {
    directDependencies: 1,
    devDependencies: 0,
    lockedPackages: 1,
    duplicateVersions: 0,
    lockfiles: ["C:\\work\\app\\package-lock.json"],
    sourceFiles: 4,
    nodeBuiltins: 2,
  },
};

describe("renderHumanReport", () => {
  const plain = createTheme(false);

  test("prints the header, the target and the stats", () => {
    const text = renderHumanReport(REPORT, plain);
    expect(text).toContain("bunready 0.1.0");
    expect(text).toContain("1 locked packages");
    expect(text).toContain("package-lock.json");
    expect(text).toContain("C:\\work\\app");
  });

  test("prints every finding with its severity word, evidence, next step and source", () => {
    const text = renderHumanReport(REPORT, plain);
    expect(text).toContain("blocker");
    expect(text).toContain("risk");
    expect(text).toContain("install/lifecycle-script");
    expect(text).toContain("evidence:");
    expect(text).toContain("next:");
    expect(text).toContain("https://bun.com/docs/pm/lifecycle");
    expect(text).toContain("1 blocker");
    expect(text).toContain("blocked - 1 blocker(s) must be fixed");
  });

  test("says so plainly when there is nothing to report", () => {
    const text = renderHumanReport(
      { ...REPORT, verdict: "ready", counts: { blocker: 0, risk: 0, info: 0 }, findings: [] },
      plain,
    );
    expect(text).toContain("no findings");
    expect(text).toContain("ready - no Bun compatibility blockers found");
  });

  test("adds colour only when the theme is enabled", () => {
    expect(renderHumanReport(REPORT, createTheme(false))).not.toContain("\u001B[");
    expect(renderHumanReport(REPORT, createTheme(true))).toContain("\u001B[");
  });
});

describe("multi-target and baseline rendering", () => {
  const plain = createTheme(false);
  const multi: ScanReport = {
    ...REPORT,
    verdict: "risky",
    counts: { blocker: 0, risk: 1, info: 1 },
    targets: [
      {
        path: "/work/app",
        relative: ".",
        kind: "root",
        name: "root",
        verdict: "ready",
        counts: { blocker: 0, risk: 0, info: 0 },
      },
      {
        path: "/work/app/packages/a",
        relative: "packages/a",
        kind: "workspace",
        name: "a",
        verdict: "risky",
        counts: { blocker: 0, risk: 1, info: 0 },
      },
    ],
    baseline: { path: "baseline.json", known: 1, new: 1 },
    findings: [
      { ...REPORT.findings[0]!, severity: "risk", path: "/work/app/packages/a", isNew: true },
      { ...REPORT.findings[1]!, path: "/work/app", isNew: false },
    ],
  };

  test("lists the scanned directories", () => {
    const text = renderHumanReport(multi, plain);
    expect(text).toContain("2 scanned directories");
    expect(text).toContain("packages/a");
    expect(text).toContain(".");
  });

  test("summarises the baseline", () => {
    expect(renderHumanReport(multi, plain)).toContain("baseline baseline.json: 1 known, 1 new");
  });

  test("marks new findings and names their directory", () => {
    const text = renderHumanReport(multi, plain);
    expect(text).toContain("new");
    expect(text).toContain("at:");
    expect(text).toContain("/work/app/packages/a");
  });
});

describe("renderJsonReport", () => {
  test("round-trips to the same report", () => {
    const parsed: unknown = JSON.parse(renderJsonReport(REPORT));
    expect(parsed).toEqual(REPORT);
  });

  test("is indented, so CI logs stay readable", () => {
    expect(renderJsonReport(REPORT)).toContain('\n  "tool": "bunready"');
  });
});
