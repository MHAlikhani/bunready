import { describe, expect, test } from "bun:test";
import type { Finding } from "../src/report/types";
import { sortFindings } from "../src/report/types";

function finding(partial: Partial<Finding> & Pick<Finding, "id" | "severity" | "title">): Finding {
  return { detail: "d", ...partial };
}

describe("sortFindings is a total order", () => {
  const items: readonly Finding[] = [
    finding({ id: "b", severity: "risk", title: "beta", path: "/z" }),
    finding({ id: "b", severity: "risk", title: "beta", path: "/a" }),
    finding({ id: "a", severity: "blocker", title: "alpha" }),
    finding({ id: "b", severity: "risk", title: "alpha", path: "/a" }),
    finding({ id: "a", severity: "info", title: "alpha" }),
  ];

  test("orders by severity, then id, then title, then path", () => {
    expect(
      sortFindings(items).map(
        (entry) => `${entry.severity}|${entry.id}|${entry.title}|${entry.path ?? ""}`,
      ),
    ).toEqual([
      "blocker|a|alpha|",
      "risk|b|alpha|/a",
      "risk|b|beta|/a",
      "risk|b|beta|/z",
      "info|a|alpha|",
    ]);
  });

  test("the result does not depend on the input order", () => {
    const forward = sortFindings(items).map((entry) => entry.id + entry.title + (entry.path ?? ""));
    const backward = sortFindings([...items].reverse()).map(
      (entry) => entry.id + entry.title + (entry.path ?? ""),
    );
    expect(backward).toEqual(forward);
  });

  test("sorting is idempotent", () => {
    const once = sortFindings(items);
    expect(sortFindings(once)).toEqual(once);
  });

  test("does not mutate the input", () => {
    const input: Finding[] = [...items];
    sortFindings(input);
    expect(input).toEqual([...items]);
  });
});
