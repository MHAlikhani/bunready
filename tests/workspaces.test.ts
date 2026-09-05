import { describe, expect, test } from "bun:test";
import { parseManifest } from "../src/scanner/manifest";
import {
  findWorkspacePackages,
  patternsFromPnpmWorkspace,
  scopeMatches,
  workspacePatterns,
} from "../src/scanner/workspaces";
import { FIXTURE_DIR, memoryFileSystem, repoFiles } from "./helpers/memory-fs";

function manifestOf(json: unknown) {
  const result = parseManifest(JSON.stringify(json), "package.json");
  if (!result.ok) {
    throw new Error("fixture manifest is invalid");
  }
  return result.value;
}

describe("workspacePatterns", () => {
  test("reads the array form", () => {
    expect(
      workspacePatterns(manifestOf({ workspaces: ["packages/*", "apps/*"] }), undefined),
    ).toEqual(["packages/*", "apps/*"]);
  });

  test("reads the packages object form", () => {
    expect(
      workspacePatterns(manifestOf({ workspaces: { packages: ["libs/*"] } }), undefined),
    ).toEqual(["libs/*"]);
  });

  test("falls back to pnpm-workspace.yaml when package.json says nothing", () => {
    expect(workspacePatterns(manifestOf({}), "packages:\n  - 'packages/*'\n  - apps/*\n")).toEqual([
      "packages/*",
      "apps/*",
    ]);
  });

  test("a plain project has no patterns", () => {
    expect(workspacePatterns(manifestOf({}), undefined)).toEqual([]);
  });
});

describe("patternsFromPnpmWorkspace", () => {
  test("ignores other sections and comments", () => {
    const text = [
      "# workspace",
      "packages:",
      "  - 'packages/*'",
      "  - libs/*",
      "",
      "onlyBuiltDependencies:",
      "  - esbuild",
    ].join("\n");
    expect(patternsFromPnpmWorkspace(text)).toEqual(["packages/*", "libs/*"]);
  });
});

describe("findWorkspacePackages", () => {
  const files = repoFiles({
    "package.json": JSON.stringify({ name: "root", workspaces: ["packages/*"] }),
    "packages/a/package.json": JSON.stringify({ name: "a" }),
    "packages/b/package.json": JSON.stringify({ name: "b" }),
    "packages/no-manifest/readme.md": "not a package",
    "packages/a/node_modules/dep/package.json": "{}",
    "tools/one/package.json": JSON.stringify({ name: "one" }),
  });

  test("expands one glob level and requires a manifest", async () => {
    const found = await findWorkspacePackages(FIXTURE_DIR, ["packages/*"], memoryFileSystem(files));
    expect(found.map((pkg) => pkg.relative)).toEqual(["packages/a", "packages/b"]);
  });

  test("accepts a literal directory", async () => {
    const found = await findWorkspacePackages(FIXTURE_DIR, ["tools/one"], memoryFileSystem(files));
    expect(found.map((pkg) => pkg.relative)).toEqual(["tools/one"]);
  });

  test("deduplicates and sorts", async () => {
    const found = await findWorkspacePackages(
      FIXTURE_DIR,
      ["packages/*", "packages/a", "./packages/*"],
      memoryFileSystem(files),
    );
    expect(found.map((pkg) => pkg.relative)).toEqual(["packages/a", "packages/b"]);
  });

  test("a pattern that matches nothing yields no packages", async () => {
    expect(await findWorkspacePackages(FIXTURE_DIR, ["apps/*"], memoryFileSystem(files))).toEqual(
      [],
    );
  });

  test("expands a globstar to a bounded depth", async () => {
    const nested = repoFiles({
      "package.json": "{}",
      "packages/a/package.json": "{}",
      "packages/a/b/package.json": "{}",
    });
    const found = await findWorkspacePackages(
      FIXTURE_DIR,
      ["packages/**"],
      memoryFileSystem(nested),
    );
    expect(found.map((pkg) => pkg.relative)).toContain("packages/a/b");
  });
});

describe("scopeMatches", () => {
  test("matches by relative path, with or without a leading ./", () => {
    expect(scopeMatches("packages/a", "packages/a")).toBe(true);
    expect(scopeMatches("packages/a", "./packages/a")).toBe(true);
    expect(scopeMatches("packages/a", "a")).toBe(true);
    expect(scopeMatches("packages/a", "b")).toBe(false);
  });
});

describe("memory file system", () => {
  test("round-trips a written file", async () => {
    const fs = memoryFileSystem(repoFiles({}));
    await fs.writeTextFile(`${FIXTURE_DIR}/written.json`, '{"a":1}');
    const read = await fs.readTextFile(`${FIXTURE_DIR}/written.json`);
    expect(read.kind === "text" && read.text).toBe('{"a":1}');
  });
});
