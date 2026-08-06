import { describe, expect, test } from "bun:test";
import {
  compareSeverity,
  countBySeverity,
  exitCodeForSeverities,
  SEVERITIES,
} from "../src/rules/severity";

describe("severity model", () => {
  test("exposes exactly the documented severities", () => {
    expect([...SEVERITIES]).toEqual(["blocker", "risk", "info"]);
  });

  test("counts each severity", () => {
    expect(countBySeverity(["blocker", "risk", "risk", "info"])).toEqual({
      blocker: 1,
      risk: 2,
      info: 1,
    });
    expect(countBySeverity([])).toEqual({ blocker: 0, risk: 0, info: 0 });
  });

  test("only a blocker fails the run", () => {
    expect(exitCodeForSeverities(["blocker"])).toBe(1);
    expect(exitCodeForSeverities(["risk", "info"])).toBe(0);
    expect(exitCodeForSeverities([])).toBe(0);
  });

  test("sorts blockers first", () => {
    expect(compareSeverity("blocker", "risk")).toBeLessThan(0);
    expect(compareSeverity("info", "risk")).toBeGreaterThan(0);
    expect(compareSeverity("risk", "risk")).toBe(0);
  });
});
