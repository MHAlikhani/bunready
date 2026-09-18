import { describe, expect, test } from "bun:test";
import { runtimeFindings } from "../src/rules/runtime";
import {
  collectNodeBuiltins,
  type RuntimeDataset,
  readRuntimeDataset,
  runtimeBuiltinFindings,
} from "../src/rules/runtime/builtins";
import type { SourceScan } from "../src/scanner/sources";
import { scanSources } from "../src/scanner/sources";
import { FIXTURE_DIR, memoryFileSystem, repoFiles } from "./helpers/memory-fs";

const DOCS = "https://bun.com/docs/runtime/nodejs-compat";

const GAP_DATASET: RuntimeDataset = {
  compatibilityDocs: DOCS,
  gaps: [
    {
      name: "node:cluster",
      status: "partial",
      note: "fixture entry used to exercise the rule",
      source: "https://github.com/oven-sh/bun/issues/1",
    },
  ],
};

async function scanOf(files: Record<string, string>): Promise<SourceScan> {
  return scanSources(FIXTURE_DIR, memoryFileSystem(repoFiles(files)));
}

describe("readRuntimeDataset", () => {
  test("the vendored dataset parses and every gap carries a source", () => {
    const dataset = readRuntimeDataset();
    expect(dataset.compatibilityDocs).toBe(DOCS);
    expect(dataset.gaps.length).toBeGreaterThan(0);
    for (const gap of dataset.gaps) {
      expect(gap.source.startsWith("https://")).toBe(true);
      expect(gap.note.length).toBeGreaterThan(0);
    }
  });

  test("malformed entries are dropped instead of trusted", () => {
    const dataset = readRuntimeDataset({
      compatibilityDocs: DOCS,
      gaps: [{ name: "node:fs" }, null, { name: "x", status: "broken", note: "n", source: "s" }],
    });
    expect(dataset.gaps).toEqual([]);
  });

  test("a non-object dataset yields an empty one", () => {
    expect(readRuntimeDataset("nope")).toEqual({
      compatibilityDocs: undefined,
      gaps: [],
      globalGaps: [],
    });
  });
});

describe("collectNodeBuiltins", () => {
  test("collects imported built-ins with the files that use them", async () => {
    const scan = await scanOf({
      "a.ts": 'import { join } from "node:path";',
      "b.ts": 'const fs = require("fs");',
      "c.ts": 'import { join as j } from "path";',
      "d.ts": 'import zod from "zod";',
    });

    const usages = collectNodeBuiltins(scan);
    expect(usages.map((usage) => usage.name)).toEqual(["fs", "path"]);
    expect(usages.find((usage) => usage.name === "path")?.files).toEqual([
      "/repo/a.ts",
      "/repo/c.ts",
    ]);
  });

  test("an empty repository yields nothing", async () => {
    expect(collectNodeBuiltins(await scanOf({ "a.ts": "const x = 1;" }))).toEqual([]);
  });
});

describe("runtimeBuiltinFindings", () => {
  test("reports the inventory as info and cites the compatibility table", async () => {
    const scan = await scanOf({ "a.ts": 'import { join } from "node:path";' });
    const findings = runtimeBuiltinFindings(scan, collectNodeBuiltins(scan), GAP_DATASET);

    const inventory = findings.find((finding) => finding.id === "runtime/node-builtins");
    expect(inventory?.severity).toBe("info");
    expect(inventory?.title).toContain("1 Node built-in");
    expect(inventory?.evidence).toContain("path");
    expect(inventory?.source).toBe(DOCS);
  });

  test("caps the module list and says how many were left out", async () => {
    const builtins = [
      "fs",
      "path",
      "os",
      "util",
      "events",
      "stream",
      "crypto",
      "http",
      "https",
      "net",
      "tls",
      "zlib",
    ];
    const files: Record<string, string> = {};
    builtins.forEach((name, index) => {
      files[`f${index}.ts`] = `import "node:${name}";`;
    });

    const scan = await scanOf(files);
    const usages = collectNodeBuiltins(scan);
    expect(usages).toHaveLength(builtins.length);

    const inventory = runtimeBuiltinFindings(scan, usages, GAP_DATASET).find(
      (finding) => finding.id === "runtime/node-builtins",
    );
    expect(inventory?.evidence).toContain("and 4 more");
  });

  test("a sourced gap entry becomes a risk, and nothing else does", async () => {
    const scan = await scanOf({ "worker.ts": 'import cluster from "node:cluster";' });
    const findings = runtimeBuiltinFindings(scan, collectNodeBuiltins(scan), GAP_DATASET);

    const gap = findings.find((finding) => finding.id === "runtime/known-gap");
    expect(gap?.severity).toBe("risk");
    expect(gap?.title).toContain("node:cluster");
    expect(gap?.source).toBe("https://github.com/oven-sh/bun/issues/1");
    expect(findings.filter((finding) => finding.severity === "risk")).toHaveLength(1);
  });

  test("vendored gaps: a partial module is a risk, an unimplemented one is a blocker", async () => {
    const dataset = readRuntimeDataset();
    const partial = dataset.gaps.find((gap) => gap.status === "partial");
    const unimplemented = dataset.gaps.find((gap) => gap.status === "unimplemented");
    expect(partial).toBeDefined();
    expect(unimplemented).toBeDefined();

    const scan = await scanOf({
      "a.ts": `import "node:${partial?.name}";\nimport "node:${unimplemented?.name}";`,
    });
    const gaps = runtimeBuiltinFindings(scan, collectNodeBuiltins(scan), dataset).filter(
      (finding) => finding.id === "runtime/known-gap",
    );
    const severityFor = (name: string) =>
      gaps.find((finding) => finding.title.startsWith(`${name} is`))?.severity;
    expect(severityFor(partial?.name ?? "")).toBe("risk");
    expect(severityFor(unimplemented?.name ?? "")).toBe("blocker");
  });

  test("a repository with no built-ins gets no inventory finding", async () => {
    const scan = await scanOf({ "a.ts": 'import zod from "zod";' });
    expect(runtimeBuiltinFindings(scan, collectNodeBuiltins(scan), GAP_DATASET)).toEqual([]);
  });

  test("truncation is surfaced as info", async () => {
    const files = { "a.ts": 'import "node:path";', "b.ts": 'import "node:fs";' };
    const scan = await scanSources(FIXTURE_DIR, memoryFileSystem(repoFiles(files)), {
      maxFiles: 1,
    });
    const findings = runtimeBuiltinFindings(scan, collectNodeBuiltins(scan), GAP_DATASET);
    expect(findings.some((finding) => finding.id === "runtime/scan-coverage")).toBe(true);
  });

  test("the runtime rule set sorts blockers and risks first", async () => {
    const scan = await scanOf({ "a.ts": 'import cluster from "node:cluster";' });
    const findings = runtimeFindings(scan, collectNodeBuiltins(scan), GAP_DATASET);
    expect(findings[0]?.severity).toBe("risk");
  });
});
