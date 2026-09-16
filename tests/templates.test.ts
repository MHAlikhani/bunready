import { describe, expect, test } from "bun:test";
import { extractImports, maskNonCode, scanSources } from "../src/scanner/sources";
import { FIXTURE_DIR, memoryFileSystem, repoFiles } from "./helpers/memory-fs";

/**
 * Template literals are the case where "mask strings" is not enough: the literal
 * text is text, but a `${ ... }` interpolation is code.
 */
describe("maskNonCode across template interpolations", () => {
  test("keeps masking the literal text", () => {
    const masked = maskNonCode("const a = `import x from 'not-real'`;");
    expect(masked).not.toContain("not-real");
    expect(masked).toContain("`");
  });

  test("opens an interpolation for scanning and closes it again", () => {
    const masked = maskNonCode("const a = `v=${value}`;");
    expect(masked).toContain("${");
    expect(masked).toContain("value");
  });

  test("handles an interpolation containing braces and a nested template", () => {
    const masked = maskNonCode("const a = `x${ { k: `y${z}` } }x`;");
    expect(masked).toContain("z");
    expect(masked).not.toContain("x`;");
  });

  test("preserves length and newlines", () => {
    const source = "const a = `line\n${b}\nrest`;\nconst c = 1;";
    expect(maskNonCode(source)).toHaveLength(source.length);
    expect(maskNonCode(source).split("\n")).toHaveLength(source.split("\n").length);
  });
});

describe("extractImports inside interpolations", () => {
  test("finds a require in a template interpolation", () => {
    const imports = extractImports('const a = `path ${require("node:path")} end`;');
    expect(imports.map((ref) => ref.specifier)).toEqual(["node:path"]);
  });

  test("finds a dynamic import inside a nested interpolation", () => {
    const imports = extractImports('const a = `outer ${`inner ${import("os")}`} end`;');
    expect(imports.map((ref) => ref.specifier)).toEqual(["os"]);
  });

  test("an interpolated dynamic import with a computed path is not invented", () => {
    const imports = extractImports("const a = `./locale/${lang}.js`;");
    expect(imports).toEqual([]);
  });

  test("template text that looks like an import is still ignored", () => {
    const imports = extractImports("const a = `import x from 'node:fs'`; const b = `y`;");
    expect(imports).toEqual([]);
  });

  test("an unterminated template does not throw or invent imports", () => {
    expect(() => extractImports('const a = `unterminated ${require("fs")')).not.toThrow();
  });
});

describe("line numbers", () => {
  test("report the line of the statement, not of the preceding newline", () => {
    const imports = extractImports(
      ["const a = 1;", 'import { join } from "node:path";'].join("\n"),
    );
    expect(imports[0]?.line).toBe(2);
  });

  test("count only newlines, so a long file stays correct", () => {
    const lines = Array.from({ length: 200 }, (_, index) => `const v${index} = ${index};`);
    lines.push('import { readFile } from "node:fs/promises";');
    const imports = extractImports(lines.join("\n"));
    expect(imports[0]?.line).toBe(201);
  });
});

describe("excluded paths and the file budget", () => {
  const files = repoFiles({
    "package.json": JSON.stringify({ name: "app" }),
    "keep/a.ts": 'import "node:path";',
    "skip/one.ts": 'import "node:cluster";',
    "skip/two.ts": 'import "node:vm";',
  });

  test("an excluded file does not consume the budget", async () => {
    const scan = await scanSources(FIXTURE_DIR, memoryFileSystem(files), {
      maxFiles: 1,
      excludePaths: ["skip/"],
    });
    expect(scan.filesScanned).toBe(1);
    expect(scan.truncated).toBe(false);
  });

  test("the budget still reports truncation for files that would be read", async () => {
    const scan = await scanSources(FIXTURE_DIR, memoryFileSystem(files), { maxFiles: 1 });
    expect(scan.truncated).toBe(true);
  });
});
