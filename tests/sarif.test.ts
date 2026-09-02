import { describe, expect, test } from "bun:test";
import { renderSarifReport } from "../src/report/sarif";
import type { ScanReport } from "../src/report/types";

const REPORT: ScanReport = {
  schemaVersion: 1,
  failOn: "blocker",
  tool: "bunready",
  version: "0.1.0",
  target: "/work/app",
  verdict: "blocked",
  counts: { blocker: 1, risk: 1, info: 0 },
  findings: [
    {
      id: "install/lifecycle-script",
      severity: "blocker",
      title: "sharp installs nothing",
      detail: "its install script will not run",
      package: "sharp",
      evidence: "lockfile marks sharp as requiring a build step",
      source: "https://bun.com/docs/pm/lifecycle",
    },
    {
      id: "install/native-addon",
      severity: "risk",
      title: "sharp ships a native addon",
      detail: "prebuilt binaries per platform",
    },
    {
      id: "install/native-addon",
      severity: "info",
      title: "context",
      detail: "another finding under the same rule",
    },
  ],
};

describe("renderSarifReport", () => {
  test("emits SARIF 2.1.0 with the tool driver", () => {
    const sarif = JSON.parse(renderSarifReport(REPORT));

    expect(sarif.version).toBe("2.1.0");
    expect(sarif.$schema).toContain("sarif-2.1.0");
    expect(sarif.runs).toHaveLength(1);
    expect(sarif.runs[0].tool.driver.name).toBe("bunready");
    expect(sarif.runs[0].tool.driver.informationUri).toContain("github.com");
  });

  test("maps severities to SARIF levels", () => {
    const levels = JSON.parse(renderSarifReport(REPORT)).runs[0].results.map(
      (result: { level: string }) => result.level,
    );
    expect(levels).toEqual(["error", "warning", "note"]);
  });

  test("declares each rule once, at its worst level", () => {
    const rules = JSON.parse(renderSarifReport(REPORT)).runs[0].tool.driver.rules;
    expect(rules.map((rule: { id: string }) => rule.id)).toEqual([
      "install/lifecycle-script",
      "install/native-addon",
    ]);
    const native = rules.find((rule: { id: string }) => rule.id === "install/native-addon");
    expect(native.defaultConfiguration.level).toBe("warning");
    expect(native.name).toBe("install-native-addon");
  });

  test("carries a helpUri only when a source exists", () => {
    const rules = JSON.parse(renderSarifReport(REPORT)).runs[0].tool.driver.rules;
    expect(rules[0].helpUri).toBe("https://bun.com/docs/pm/lifecycle");
    expect(rules[1].helpUri).toBeUndefined();
  });

  test("every result has a location and a stable fingerprint", () => {
    const results = JSON.parse(renderSarifReport(REPORT)).runs[0].results;
    for (const result of results) {
      expect(result.locations[0].physicalLocation.artifactLocation.uri).toBe("/work/app");
      expect(result.partialFingerprints.bunreadyFinding).toContain(result.ruleId);
    }
  });
});
