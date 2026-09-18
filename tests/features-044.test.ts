import { describe, expect, test } from "bun:test";
import { parseArgs } from "../src/cli/args";
import { renderMarkdownReport } from "../src/report/markdown";
import type { Finding, ScanReport } from "../src/report/types";
import {
  datasetIdentifiers,
  readRuntimeDataset,
  runtimeBuiltinFindings,
} from "../src/rules/runtime/builtins";
import type { SourceScan } from "../src/scanner/sources";
import { scanSources } from "../src/scanner/sources";
import { FIXTURE_DIR, memoryFileSystem, repoFiles } from "./helpers/memory-fs";

function report(overrides: Partial<ScanReport> = {}): ScanReport {
  const findings: readonly Finding[] = overrides.findings ?? [];
  return {
    schemaVersion: 1,
    failOn: "blocker",
    tool: "bunready",
    version: "0.4.4",
    target: "/repo",
    verdict: findings.some((f) => f.severity === "blocker") ? "blocked" : "ready",
    counts: {
      blocker: findings.filter((f) => f.severity === "blocker").length,
      risk: findings.filter((f) => f.severity === "risk").length,
      info: findings.filter((f) => f.severity === "info").length,
    },
    findings,
    stats: {
      directDependencies: 2,
      devDependencies: 1,
      lockedPackages: 10,
      duplicateVersions: 0,
      lockfiles: ["/repo/bun.lock"],
      sourceFiles: 5,
      nodeBuiltins: 2,
      builtinNames: ["crypto", "path"],
    },
    ...overrides,
  };
}

function finding(severity: Finding["severity"], id: string, extra: Partial<Finding> = {}): Finding {
  return { id, severity, title: `title of ${id}`, detail: `detail of ${id}`, ...extra };
}

describe("markdown report", () => {
  test("title, verdict and summary table", () => {
    const md = renderMarkdownReport(report());
    expect(md).toContain("# bunready 0.4.4");
    expect(md).toContain("**Verdict: ready**");
    expect(md).toContain("| Blockers | 0 |");
    expect(md).toContain("| Risks | 0 |");
    expect(md).toContain("| Info | 0 |");
    expect(md).toContain("failOn: blocker");
  });

  test("findings are grouped by severity with evidence and source links", () => {
    const md = renderMarkdownReport(
      report({
        findings: [
          finding("blocker", "install/native-addon", {
            evidence: "better-sqlite3 declares a binary",
            hint: "check for prebuilds",
          }),
          finding("risk", "runtime/known-gap", {
            source: "https://bun.com/docs/runtime/nodejs-compat",
          }),
          finding("info", "runtime/node-builtins"),
        ],
      }),
    );
    expect(md).toContain("### Blockers (1)");
    expect(md).toContain("### Risks (1)");
    expect(md).toContain("### Info (1)");
    expect(md).toContain("- **Evidence:** better-sqlite3 declares a binary");
    expect(md).toContain("https://bun.com/docs/runtime/nodejs-compat");
    expect(md).toContain("#### title of install/native-addon");
  });

  test("the builtins section lists the modules and cites sources", () => {
    const md = renderMarkdownReport(
      report({
        findings: [finding("risk", "runtime/known-gap", { source: "https://example.com/x" })],
      }),
    );
    expect(md).toContain("## Node built-in usage");
    expect(md).toContain("`crypto`, `path`");
    expect(md).toContain("[https://example.com/x](https://example.com/x)");
  });

  test("an empty scan renders a clean no-findings report", () => {
    const md = renderMarkdownReport(report());
    expect(md).toContain("No findings.");
    expect(md).not.toContain("### Blockers");
  });

  test("markdown-sensitive text is escaped", () => {
    const md = renderMarkdownReport(
      report({
        findings: [
          finding("risk", "x/y", { title: "a *bright* | idea", detail: "use <script> & `ticks`" }),
        ],
      }),
    );
    expect(md).toContain("a \\*bright\\* \\| idea");
    expect(md).toContain("use \\<script\\> & \\`ticks\\`");
  });

  test("scanned directories and baseline render as tables", () => {
    const md = renderMarkdownReport(
      report({
        targets: [
          {
            path: "/repo",
            relative: ".",
            kind: "root",
            name: "root",
            verdict: "ready",
            counts: { blocker: 0, risk: 0, info: 0 },
          },
        ],
        baseline: { path: "/repo/baseline.json", known: 3, new: 1 },
      }),
    );
    expect(md).toContain("| `.` | root | ready | 0 | 0 | 0 |");
    expect(md).toContain("Baseline `/repo/baseline.json`: 3 known, 1 new.");
  });

  test("new findings are marked against the baseline", () => {
    const md = renderMarkdownReport(
      report({ findings: [finding("risk", "x/y", { isNew: true })] }),
    );
    expect(md).toContain("**Baseline:** new since the baseline was recorded");
  });
});

describe("global gap dataset", () => {
  test("the shipped globalGaps parse and carry sources", () => {
    const dataset = readRuntimeDataset();
    expect(dataset.globalGaps?.length).toBeGreaterThan(0);
    for (const gap of dataset.globalGaps ?? []) {
      expect(gap.source.startsWith("https://")).toBe(true);
      expect(["partial", "unimplemented"]).toContain(gap.status);
    }
  });

  test("datasetIdentifiers lists the watched globals, sorted", () => {
    expect(datasetIdentifiers(readRuntimeDataset())).toContain("localStorage");
    expect(datasetIdentifiers(readRuntimeDataset())).toContain("navigator");
  });

  test("an unimplemented global is a blocker with file evidence", async () => {
    const scan: SourceScan = await scanSources(
      FIXTURE_DIR,
      memoryFileSystem(
        repoFiles({
          "a.ts": "const store = localStorage;",
          "b.ts": "// localStorage in a comment must not count",
        }),
      ),
      { identifiers: datasetIdentifiers(readRuntimeDataset()) },
    );
    const findings = runtimeBuiltinFindings(scan, [], readRuntimeDataset());
    const gap = findings.find((f) => f.id === "runtime/known-global-gap");
    expect(gap?.severity).toBe("blocker");
    expect(gap?.evidence).toContain("1 file(s)");
    expect(gap?.evidence).toContain("a.ts");
    expect(gap?.source).toContain("https://");
  });

  test("a partial global is a risk", async () => {
    const scan: SourceScan = await scanSources(
      FIXTURE_DIR,
      memoryFileSystem(
        repoFiles({
          "a.ts": "export const lang = navigator.language;",
        }),
      ),
      { identifiers: datasetIdentifiers(readRuntimeDataset()) },
    );
    const findings = runtimeBuiltinFindings(scan, [], readRuntimeDataset());
    const gap = findings.find((f) => f.id === "runtime/known-global-gap");
    expect(gap?.severity).toBe("risk");
    expect(gap?.title).toContain("navigator");
  });

  test("no global usage means no global finding", async () => {
    const scan: SourceScan = await scanSources(
      FIXTURE_DIR,
      memoryFileSystem(
        repoFiles({
          "a.ts": "export const x = 1;",
        }),
      ),
      { identifiers: datasetIdentifiers(readRuntimeDataset()) },
    );
    expect(runtimeBuiltinFindings(scan, [], readRuntimeDataset())).toEqual([]);
  });
});

describe("new CLI flags", () => {
  test("--format parses and defaults to human", () => {
    const fmt = (argv: string[]): string | undefined => {
      const parsed = parseArgs(argv);
      return parsed.ok ? parsed.value.format : undefined;
    };
    expect(fmt([])).toBe("human");
    expect(fmt(["--format", "md"])).toBe("md");
    expect(fmt(["--json"])).toBe("json");
    expect(fmt(["--sarif"])).toBe("sarif");
  });

  test("--format rejects unknown values", () => {
    const parsed = parseArgs(["--format", "html"]);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.hint).toContain("human, json, sarif, md");
    }
  });

  test("--format and --json are refused together", () => {
    expect(parseArgs(["--format", "md", "--json"]).ok).toBe(false);
    expect(parseArgs(["--format", "md", "--sarif"]).ok).toBe(false);
    expect(parseArgs(["--format", "md"]).ok).toBe(true);
  });

  test("--changed-only and --since parse; --since alone is refused", () => {
    const both = parseArgs(["--changed-only", "--since", "v1.0"]);
    expect(both.ok).toBe(true);
    if (both.ok) {
      expect(both.value.changedOnly).toBe(true);
      expect(both.value.since).toBe("v1.0");
    }

    const only = parseArgs(["--changed-only"]);
    expect(only.ok).toBe(true);
    if (only.ok) {
      expect(only.value.since).toBeUndefined();
    }

    const alone = parseArgs(["--since", "v1.0"]);
    expect(alone.ok).toBe(false);
    if (!alone.ok) {
      expect(alone.error.message).toContain("--changed-only");
    }
  });
});
