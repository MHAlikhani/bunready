import { describe, expect, test } from "bun:test";
import { DEFAULT_TARGET, parseArgs } from "../src/cli/args";

describe("parseArgs", () => {
  test("defaults to the current directory", () => {
    const result = parseArgs([]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.target).toBe(DEFAULT_TARGET);
      expect(result.value.help).toBe(false);
      expect(result.value.json).toBe(false);
      expect(result.value.run).toBe(false);
    }
  });

  test("accepts a positional target", () => {
    const result = parseArgs(["./some-repo"]);
    expect(result.ok && result.value.target).toBe("./some-repo");
  });

  test("parses long and short flags", () => {
    const result = parseArgs(["--json", "--run", "repo"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.json).toBe(true);
      expect(result.value.run).toBe(true);
      expect(result.value.target).toBe("repo");
    }
    expect(parseArgs(["-h"]).ok && parseArgs(["-h"]).ok).toBe(true);
    expect(parseArgs(["-v"]).ok).toBe(true);
  });

  test("rejects unknown options with a usage error and a hint", () => {
    const result = parseArgs(["--nope"]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("E_USAGE");
      expect(result.error.message).toContain("--nope");
      expect(result.error.hint).toBeDefined();
    }
  });

  test("rejects a second positional argument", () => {
    const result = parseArgs(["one", "two"]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("E_USAGE");
      expect(result.error.message).toContain("two");
    }
  });

  test("treats everything after -- as positional", () => {
    const result = parseArgs(["--", "--json"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.target).toBe("--json");
      expect(result.value.json).toBe(false);
    }
  });

  test("a lone dash is a path, not an option", () => {
    const result = parseArgs(["-"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.target).toBe("-");
    }
  });
});
