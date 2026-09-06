import { describe, expect, test } from "bun:test";
import {
  applyBaseline,
  fingerprint,
  newFindings,
  parseBaseline,
  serializeBaseline,
} from "../src/config/baseline";
import type { Finding } from "../src/report/types";

const FINDING: Finding = {
  id: "install/native-addon",
  severity: "risk",
  title: "sharp ships a native addon",
  detail: "prebuilt binaries per platform",
  package: "sharp",
  path: "/work/app",
};

const OTHER: Finding = {
  id: "install/no-lockfile",
  severity: "risk",
  title: "no lockfile",
  detail: "nothing to compare against",
};

describe("fingerprint", () => {
  test("is stable across message edits but separates rule, package and path", () => {
    expect(fingerprint(FINDING)).toBe("install/native-addon|sharp|/work/app");
    expect(fingerprint({ ...FINDING, title: "rewritten", detail: "rewritten" })).toBe(
      fingerprint(FINDING),
    );
    expect(fingerprint({ ...FINDING, path: "/work/app/packages/a" })).not.toBe(
      fingerprint(FINDING),
    );
  });
});

describe("serializeBaseline / parseBaseline", () => {
  test("round-trips, deduplicated and sorted", () => {
    const text = serializeBaseline([FINDING, FINDING, OTHER]);
    const parsed = parseBaseline(text, "baseline.json");
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.schemaVersion).toBe(1);
      expect(parsed.value.findings).toEqual([fingerprint(OTHER), fingerprint(FINDING)].sort());
    }
  });

  test("rejects invalid JSON with a hint", () => {
    const parsed = parseBaseline("{ nope", "baseline.json");
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.hint).toContain("--write-baseline");
    }
  });

  test("rejects a document without a findings array", () => {
    expect(parseBaseline('{"schemaVersion":1}', "b.json").ok).toBe(false);
    expect(parseBaseline("[]", "b.json").ok).toBe(false);
  });

  test("rejects a non-numeric schema version", () => {
    expect(parseBaseline('{"schemaVersion":"one","findings":[]}', "b.json").ok).toBe(false);
  });

  test("non-string entries are dropped rather than trusted", () => {
    const parsed = parseBaseline('{"findings":["a",5]}', "b.json");
    expect(parsed.ok && parsed.value.findings).toEqual(["a"]);
  });
});

describe("applyBaseline", () => {
  test("marks what is new and counts both sides", () => {
    const known = serializeBaseline([FINDING]);
    const parsed = parseBaseline(known, "baseline.json");
    if (!parsed.ok) {
      throw new Error("fixture baseline is invalid");
    }

    const applied = applyBaseline([FINDING, OTHER], parsed.value, "baseline.json");
    expect(applied.summary).toEqual({ path: "baseline.json", known: 1, new: 1 });
    expect(applied.findings.find((finding) => finding.id === OTHER.id)?.isNew).toBe(true);
    expect(applied.findings.find((finding) => finding.id === FINDING.id)?.isNew).toBe(false);
  });

  test("everything is new against an empty baseline", () => {
    const parsed = parseBaseline(serializeBaseline([]), "b.json");
    if (!parsed.ok) {
      throw new Error("fixture baseline is invalid");
    }
    const applied = applyBaseline([FINDING, OTHER], parsed.value, "b.json");
    expect(applied.summary.new).toBe(2);
  });
});

describe("newFindings", () => {
  test("gates on new findings only when a baseline was applied", () => {
    const marked = [
      { ...FINDING, isNew: false },
      { ...OTHER, isNew: true },
    ];
    expect(newFindings(marked, true)).toHaveLength(1);
    expect(newFindings(marked, false)).toHaveLength(2);
  });
});
