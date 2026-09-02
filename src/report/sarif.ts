import { compareSeverity, type Severity } from "../rules/severity";
import type { Finding, ScanReport } from "./types";

/**
 * SARIF 2.1.0 output, so the same findings can be uploaded to GitHub code
 * scanning (or any SARIF consumer) without a second implementation of the rules.
 */
const LEVELS: Readonly<Record<Severity, string>> = {
  blocker: "error",
  risk: "warning",
  info: "note",
};

const SARIF_SCHEMA = "https://json.schemastore.org/sarif-2.1.0.json";
const INFORMATION_URI = "https://github.com/MHAlikhani/bunready";

function worstByRule(
  findings: readonly Finding[],
): Map<string, { severity: Severity; sample: Finding }> {
  const byRule = new Map<string, { severity: Severity; sample: Finding }>();
  for (const finding of findings) {
    const existing = byRule.get(finding.id);
    if (existing === undefined || compareSeverity(finding.severity, existing.severity) < 0) {
      byRule.set(finding.id, { severity: finding.severity, sample: finding });
    }
  }
  return byRule;
}

export function renderSarifReport(report: ScanReport): string {
  const byRule = worstByRule(report.findings);

  const rules = [...byRule.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([id, entry]) => ({
      id,
      name: id.replace(/[^A-Za-z0-9]+/g, "-"),
      shortDescription: { text: entry.sample.title },
      fullDescription: { text: entry.sample.detail },
      defaultConfiguration: { level: LEVELS[entry.severity] },
      ...(entry.sample.source === undefined ? {} : { helpUri: entry.sample.source }),
    }));

  const results = report.findings.map((finding) => ({
    ruleId: finding.id,
    level: LEVELS[finding.severity],
    message: { text: `${finding.title}. ${finding.detail}` },
    locations: [{ physicalLocation: { artifactLocation: { uri: report.target } } }],
    partialFingerprints: { bunreadyFinding: `${finding.id}:${finding.title}` },
  }));

  return JSON.stringify(
    {
      $schema: SARIF_SCHEMA,
      version: "2.1.0",
      runs: [
        {
          tool: {
            driver: {
              name: report.tool,
              version: report.version,
              informationUri: INFORMATION_URI,
              rules,
            },
          },
          results,
        },
      ],
    },
    null,
    2,
  );
}
