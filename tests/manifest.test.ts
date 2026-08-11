import { describe, expect, test } from "bun:test";
import { parseManifest } from "../src/scanner/manifest";

const FULL = JSON.stringify({
  name: "app",
  version: "1.0.0",
  scripts: { build: "bun build" },
  dependencies: { "left-pad": "^1.3.0" },
  devDependencies: { typescript: "^5" },
  optionalDependencies: { fsevents: "^2" },
  peerDependencies: { react: "^18" },
  engines: { node: ">=18", bun: ">=1.2.0" },
  trustedDependencies: ["sharp"],
});

describe("parseManifest", () => {
  test("reads every field bunready reasons about", () => {
    const result = parseManifest(FULL, "package.json");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe("app");
      expect(result.value.dependencies["left-pad"]).toBe("^1.3.0");
      expect(result.value.devDependencies.typescript).toBe("^5");
      expect(result.value.optionalDependencies.fsevents).toBe("^2");
      expect(result.value.peerDependencies.react).toBe("^18");
      expect(result.value.engines.bun).toBe(">=1.2.0");
      expect(result.value.trustedDependencies).toEqual(["sharp"]);
    }
  });

  test("tolerates a minimal manifest", () => {
    const result = parseManifest("{}", "package.json");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.dependencies).toEqual({});
      expect(result.value.trustedDependencies).toEqual([]);
    }
  });

  test("accepts the object form of trustedDependencies", () => {
    const result = parseManifest(
      JSON.stringify({ trustedDependencies: { sharp: true } }),
      "package.json",
    );
    expect(result.ok && result.value.trustedDependencies).toEqual(["sharp"]);
  });

  test("ignores non-string dependency values instead of guessing", () => {
    const result = parseManifest(JSON.stringify({ dependencies: { weird: 5 } }), "package.json");
    expect(result.ok && result.value.dependencies).toEqual({});
  });

  test("reports invalid JSON as a parse error with a hint", () => {
    const result = parseManifest("{ nope", "package.json");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("E_PARSE");
      expect(result.error.hint).toBeDefined();
    }
  });

  test("reports a non-object document", () => {
    const result = parseManifest("[]", "package.json");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("E_PARSE");
    }
  });
});
