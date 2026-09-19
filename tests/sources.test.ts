import { describe, expect, test } from "bun:test";
import {
  classifySpecifier,
  extractImports,
  MAX_SOURCE_FILES,
  nodeBuiltinNames,
  scanSources,
} from "../src/scanner/sources";
import { FIXTURE_DIR, memoryFileSystem, repoFiles } from "./helpers/memory-fs";

describe("extractImports", () => {
  test("finds static imports, including multi-line ones", () => {
    const text = [
      'import { readFile } from "node:fs/promises";',
      "import {",
      "  join,",
      '} from "node:path";',
    ].join("\n");
    const imports = extractImports(text);
    expect(imports.map((ref) => ref.specifier)).toEqual(["node:fs/promises", "node:path"]);
    expect(imports[0]?.kind).toBe("esm");
    expect(imports[1]?.line).toBe(2);
  });

  test("finds side-effect, require, dynamic and re-export forms", () => {
    const text = [
      'import "./setup.js";',
      'const fs = require("fs");',
      'const lazy = import("node:worker_threads");',
      'export * from "./other.js";',
      'export { thing } from "./third.js";',
    ].join("\n");

    const imports = extractImports(text);
    expect(imports.map((ref) => `${ref.kind}:${ref.specifier}`)).toEqual([
      "esm:./setup.js",
      "cjs:fs",
      "dynamic:node:worker_threads",
      "esm:./other.js",
      "esm:./third.js",
    ]);
  });

  test("ignores comments, plain strings and import-shaped text inside a string", () => {
    const text = [
      '// import x from "not-real"',
      'const message = "import y from z";',
      "const fixture = 'import cluster from \"node:cluster\";';",
      "/* import w from 'node:vm'; */",
      "const a = 1;",
    ].join("\n");
    expect(extractImports(text)).toEqual([]);
  });

  test("still finds a real import that sits next to an import-shaped string", () => {
    const text = [
      "const fixture = 'import cluster from \"node:cluster\";';",
      'import { join } from "node:path";',
    ].join("\n");
    expect(extractImports(text).map((ref) => ref.specifier)).toEqual(["node:path"]);
  });

  test("reports the same specifier once per line", () => {
    const text = 'const a = require("fs"); const b = require("fs");';
    expect(extractImports(text)).toHaveLength(1);
  });
});

describe("built-in classification", () => {
  test("the built-in list comes from the runtime", () => {
    const names = nodeBuiltinNames();
    expect(names.has("fs")).toBe(true);
    expect(names.has("node:fs")).toBe(true);
    expect(names.has("definitely-not-a-module")).toBe(false);
  });

  test("classifies every specifier shape", () => {
    expect(classifySpecifier("node:fs")).toBe("node-builtin");
    expect(classifySpecifier("fs")).toBe("node-builtin");
    expect(classifySpecifier("bun:sqlite")).toBe("bun-builtin");
    expect(classifySpecifier("./local")).toBe("relative");
    expect(classifySpecifier("../up")).toBe("relative");
    expect(classifySpecifier("/etc/passwd")).toBe("absolute");
    expect(classifySpecifier("C:\\work\\file.ts")).toBe("absolute");
    expect(classifySpecifier("zod")).toBe("package");
    expect(classifySpecifier("@scope/pkg")).toBe("package");
  });
});

describe("scanSources", () => {
  const files = repoFiles({
    "package.json": JSON.stringify({ name: "app" }),
    "src/index.ts": 'import { join } from "node:path";',
    "src/deep/nested/util.js": 'const fs = require("fs");',
    "src/notes.md": "import from text file",
    "node_modules/ignored/index.js": 'require("node:cluster");',
    "dist/bundle.js": 'require("node:vm");',
  });

  test("walks the repository's own source and stops at the ignored directories", async () => {
    const scan = await scanSources(FIXTURE_DIR, memoryFileSystem(files));
    expect(scan.files.map((file) => file.path)).toEqual([
      "/repo/src/index.ts",
      "/repo/src/deep/nested/util.js",
    ]);
    expect(scan.truncated).toBe(false);
    expect(scan.filesScanned).toBe(2);
  });

  test("reports truncation instead of pretending the inventory is complete", async () => {
    const scan = await scanSources(FIXTURE_DIR, memoryFileSystem(files), { maxFiles: 1 });
    expect(scan.truncated).toBe(true);
    expect(scan.filesScanned).toBe(1);
  });

  test("an empty repository is scanned without error", async () => {
    const scan = await scanSources(FIXTURE_DIR, memoryFileSystem({}));
    expect(scan.filesScanned).toBe(0);
    expect(scan.truncated).toBe(false);
  });

  test("treats watched identifier names as literals", async () => {
    const scan = await scanSources(
      FIXTURE_DIR,
      memoryFileSystem(
        repoFiles({
          "package.json": JSON.stringify({ name: "app" }),
          "src/index.ts": "global$value global.value globalXvalue",
        }),
      ),
      { identifiers: ["global$value", "global.value"] },
    );

    expect(scan.files[0]?.identifiers).toEqual(["global.value", "global$value"]);
  });

  test("the file cap is a real number", () => {
    expect(MAX_SOURCE_FILES).toBeGreaterThan(0);
  });
});
