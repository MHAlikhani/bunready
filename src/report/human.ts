import { verdictLine } from "../cli/copy";
import type { Theme } from "../cli/theme";
import type { Finding, ScanReport } from "./types";

/**
 * The human report.
 *
 * One finding per block, always the same shape: what, why, the evidence, the
 * next step, the source. Colour is decoration - the severity word is always
 * printed, so a monochrome log carries the same information.
 */
const LABEL_WIDTH = 7;

function label(finding: Finding, theme: Theme): string {
  switch (finding.severity) {
    case "blocker":
      return theme.red("blocker".padEnd(LABEL_WIDTH));
    case "risk":
      return theme.yellow("risk".padEnd(LABEL_WIDTH));
    case "info":
      return theme.cyan("info".padEnd(LABEL_WIDTH));
  }
}

export function renderHumanReport(report: ScanReport, theme: Theme): string {
  const lines: string[] = [];
  const facts: string[] = [];

  if (report.stats !== undefined) {
    facts.push(`${report.stats.lockedPackages} locked packages`);
    facts.push(`${report.stats.directDependencies + report.stats.devDependencies} direct`);
    if (report.stats.duplicateVersions > 0) {
      facts.push(`${report.stats.duplicateVersions} duplicated`);
    }
    if (report.stats.lockfiles.length > 0) {
      facts.push(
        report.stats.lockfiles.map((path) => path.split(/[\\/]/).pop() ?? path).join(", "),
      );
    }
  }

  lines.push([theme.bold(`${report.tool} ${report.version}`), ...facts].join(theme.dim("  ·  ")));
  lines.push(theme.dim(report.target));
  lines.push("");

  if (report.findings.length === 0) {
    lines.push("no findings");
    lines.push("");
  } else {
    for (const finding of report.findings) {
      lines.push(
        `${label(finding, theme)} ${theme.bold(finding.title)}  ${theme.dim(`(${finding.id})`)}`,
      );
      lines.push(`  ${finding.detail}`);
      if (finding.evidence !== undefined) {
        lines.push(`  ${theme.dim("evidence:")} ${finding.evidence}`);
      }
      if (finding.hint !== undefined) {
        lines.push(`  ${theme.dim("next:")} ${finding.hint}`);
      }
      if (finding.source !== undefined) {
        lines.push(`  ${theme.dim("source:")} ${finding.source}`);
      }
      lines.push("");
    }
  }

  lines.push(
    `${report.counts.blocker} blocker  ·  ${report.counts.risk} risk  ·  ${report.counts.info} info`,
  );
  lines.push(verdictLine(report.verdict, report.counts));

  return lines.join("\n");
}
