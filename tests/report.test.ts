import { describe, expect, test } from "bun:test";
import type { Finding } from "../src/report/types";
import { verdictFor } from "../src/report/types";

function finding(severity: Finding["severity"]): Finding {
  return {
    id: `test/${severity}`,
    severity,
    title: "t",
    detail: "d",
  };
}

describe("verdictFor", () => {
  test("an empty report is ready", () => {
    expect(verdictFor([])).toBe("ready");
  });

  test("info alone does not change the verdict", () => {
    expect(verdictFor([finding("info")])).toBe("ready");
  });

  test("any risk makes it risky", () => {
    expect(verdictFor([finding("info"), finding("risk")])).toBe("risky");
  });

  test("any blocker makes it blocked, even with risks present", () => {
    expect(verdictFor([finding("risk"), finding("blocker"), finding("info")])).toBe("blocked");
  });
});
