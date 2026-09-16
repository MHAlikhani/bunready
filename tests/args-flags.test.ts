import { describe, expect, test } from "bun:test";
import { parseArgs } from "../src/cli/args";

describe("output flags", () => {
  test("--sarif is parsed and defaults to off", () => {
    const defaults = parseArgs([]);
    expect(defaults.ok).toBe(true);
    if (defaults.ok) {
      expect(defaults.value.sarif).toBe(false);
    }

    const result = parseArgs(["--sarif"]);
    expect(result.ok && result.value.sarif).toBe(true);
  });

  test("--json and --sarif together are a usage error", () => {
    const result = parseArgs(["--json", "--sarif"]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("E_USAGE");
      expect(result.error.hint).toContain("one of them");
    }
  });
});

describe("value flags", () => {
  test("--run-script implies --run and captures the name", () => {
    const result = parseArgs(["--run-script", "test"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.runScript).toBe("test");
      expect(result.value.run).toBe(true);
    }
  });

  test("--run-script without a value is a usage error", () => {
    const result = parseArgs(["--run-script"]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("--run-script");
    }
  });

  test("--config captures the path without enabling --run", () => {
    const result = parseArgs(["--config", "other.json"]);
    expect(result.ok && result.value.config).toBe("other.json");
    expect(result.ok && result.value.run).toBe(false);
  });

  test("a positional argument after a value flag is still the target", () => {
    const result = parseArgs(["--config", "c.json", "repo"]);
    expect(result.ok && result.value.target).toBe("repo");
    expect(result.ok && result.value.config).toBe("c.json");
  });

  test("--scope, --baseline and --write-baseline capture their values", () => {
    const result = parseArgs([
      "--scope",
      "packages/a",
      "--baseline",
      "b.json",
      "--write-baseline",
      "c.json",
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.scope).toBe("packages/a");
      expect(result.value.baseline).toBe("b.json");
      expect(result.value.writeBaseline).toBe("c.json");
    }
  });

  test("every value flag complains when its value is missing", () => {
    for (const flag of ["--config", "--scope", "--baseline", "--write-baseline", "--run-script"]) {
      const result = parseArgs([flag]);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("E_USAGE");
        expect(result.error.message).toContain(flag);
      }
    }
  });
});
