import { describe, expect, test } from "bun:test";
import { compareVersions, parseRange, parseVersion, satisfies } from "../src/scanner/semver";

describe("parseVersion", () => {
  test("reads major, minor and patch", () => {
    expect(parseVersion("1.2.3")).toEqual({ major: 1, minor: 2, patch: 3, prerelease: undefined });
  });

  test("fills missing components with zero", () => {
    expect(parseVersion("22")).toEqual({ major: 22, minor: 0, patch: 0, prerelease: undefined });
  });

  test("keeps a prerelease tag", () => {
    expect(parseVersion("1.0.0-beta.1")?.prerelease).toBe("beta.1");
  });

  test("rejects non-versions", () => {
    expect(parseVersion("latest")).toBeUndefined();
    expect(parseVersion("")).toBeUndefined();
  });
});

describe("compareVersions", () => {
  test("orders by component", () => {
    const a = parseVersion("1.2.3");
    const b = parseVersion("1.3.0");
    expect(a !== undefined && b !== undefined && compareVersions(a, b)).toBe(-1);
  });

  test("a release outranks its own prerelease", () => {
    const release = parseVersion("1.0.0");
    const beta = parseVersion("1.0.0-beta");
    expect(release !== undefined && beta !== undefined && compareVersions(release, beta)).toBe(1);
  });
});

describe("satisfies", () => {
  test("caret stays inside the major version", () => {
    expect(satisfies("1.5.0", "^1.2.3")).toBe(true);
    expect(satisfies("2.0.0", "^1.2.3")).toBe(false);
  });

  test("caret below 1.0.0 stays inside the minor version", () => {
    expect(satisfies("0.2.5", "^0.2.3")).toBe(true);
    expect(satisfies("0.3.0", "^0.2.3")).toBe(false);
  });

  test("tilde stays inside the minor version", () => {
    expect(satisfies("1.2.9", "~1.2.3")).toBe(true);
    expect(satisfies("1.3.0", "~1.2.3")).toBe(false);
  });

  test("comparators combine as AND", () => {
    expect(satisfies("18.20.0", ">=18 <21")).toBe(true);
    expect(satisfies("21.0.0", ">=18 <21")).toBe(false);
  });

  test("a bare major version has no upper bound when a comparator is used", () => {
    expect(satisfies("22.22.0", ">=18")).toBe(true);
  });

  test("partial versions behave as x-ranges", () => {
    expect(satisfies("1.9.0", "1")).toBe(true);
    expect(satisfies("2.0.0", "1")).toBe(false);
    expect(satisfies("1.2.9", "1.2")).toBe(true);
    expect(satisfies("1.3.0", "1.2")).toBe(false);
    expect(satisfies("1.2.3", "1.2.x")).toBe(true);
  });

  test("alternation and hyphen ranges", () => {
    expect(satisfies("3.0.0", "^1.0.0 || ^3.0.0")).toBe(true);
    expect(satisfies("2.0.0", "^1.0.0 || ^3.0.0")).toBe(false);
    expect(satisfies("2.0.0", "1.2.3 - 2.5.0")).toBe(true);
    expect(satisfies("3.0.0", "1.2.3 - 2.5.0")).toBe(false);
  });

  test("any range", () => {
    expect(satisfies("1.2.3", "*")).toBe(true);
    expect(satisfies("1.2.3", "")).toBe(true);
  });

  test("an exact version matches only itself", () => {
    expect(satisfies("1.2.3", "1.2.3")).toBe(true);
    expect(satisfies("1.2.4", "1.2.3")).toBe(false);
  });

  test("unparseable input returns undefined, never a false", () => {
    expect(satisfies("1.2.3", "banana")).toBeUndefined();
    expect(satisfies("not-a-version", "^1.0.0")).toBeUndefined();
  });
});

describe("parseRange", () => {
  test("an empty range means any version", () => {
    expect(parseRange("")).toEqual([[]]);
  });
});
