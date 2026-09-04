import { describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG, parseConfig } from "../src/config/config";

describe("parseConfig", () => {
  test("defaults are what an absent file means", () => {
    expect(DEFAULT_CONFIG.failOn).toBe("blocker");
    expect(DEFAULT_CONFIG.run.maxCopyMegabytes).toBe(250);
    expect(DEFAULT_CONFIG.run.script).toBeUndefined();
  });

  test("reads every key", () => {
    const result = parseConfig(
      JSON.stringify({
        ignore: ["install/no-lockfile"],
        ignorePackages: ["fsevents"],
        nativeAllowlist: ["sharp"],
        excludePaths: ["fixtures/"],
        failOn: "risk",
        run: { script: "test", maxCopyMegabytes: 100 },
      }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.ignore).toEqual(["install/no-lockfile"]);
      expect(result.value.nativeAllowlist).toEqual(["sharp"]);
      expect(result.value.failOn).toBe("risk");
      expect(result.value.run).toEqual({ script: "test", maxCopyMegabytes: 100 });
    }
  });

  test("an empty object is the default configuration", () => {
    const result = parseConfig("{}");
    expect(result.ok && result.value).toEqual(DEFAULT_CONFIG);
  });

  test("rejects an unknown failOn with a hint", () => {
    const result = parseConfig('{"failOn":"catastrophe"}');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("E_PARSE");
      expect(result.error.hint).toContain("blocker");
    }
  });

  test("rejects a non-positive copy limit", () => {
    const result = parseConfig('{"run":{"maxCopyMegabytes":0}}');
    expect(result.ok).toBe(false);
  });

  test("rejects invalid JSON", () => {
    const result = parseConfig("{ nope");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("E_PARSE");
    }
  });

  test("rejects a document that is valid JSON but not an object", () => {
    const result = parseConfig("[]");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("E_PARSE");
      expect(result.error.hint).toContain("CONFIGURATION.md");
    }
  });

  test("ignores non-string entries instead of trusting them", () => {
    const result = parseConfig('{"ignore":["a",5],"nativeAllowlist":"sharp"}');
    expect(result.ok && result.value.ignore).toEqual(["a"]);
    expect(result.ok && result.value.nativeAllowlist).toEqual([]);
  });
});
