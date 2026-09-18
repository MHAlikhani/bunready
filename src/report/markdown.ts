import type { Severity } from "../rules/severity";
import type { Finding, ScanReport } from "./types";

/**
 * The Markdown report.
 *
 * Self-contained output for pull-request comments and GitHub step summaries:
 * no HTML, no colour, every link written out. It renders the same findings as
 * the human and JSON reports - nothing is summarised away, because a PR reader
 * who cannot see an evidence line cannot trust the verdict.
 */
const SEVERITY_SECTIONS: readonly { readonly severity: Severity; readonly heading: string }[] = [
  { severity: "blocker", heading: "Blockers" },
  { severity: "risk", heading: "Risks" },
  { severity: "info", heading: "Info" },
];

/**
 * Escaped: the characters that can form GFM syntax anywhere in a line
 * (emphasis, code spans, links, autolinks, tables, strikethrough, headings).
 * `(`/`)`, `-` and `.` only matter in positions these values never occupy.
 */
function text(value: string): string {
  return value.replace(/([\\`*_[\]<>|~#])/g, "\\$1");
}

/** A one-line value for a definition row; blank stays blank. */
function line(value: string | undefined): string | undefined {
  return value === undefined || value === "" ? undefined : text(value);
}

function link(label: string, url: string): string {
  return `[${text(label)}](${url})`;
}

function findingBlock(finding: Finding, showPath: boolean): string[] {
  const rows: string[] = [];
  const put = (label: string, value: string | undefined): void => {
    if (value !== undefined) {
      rows.push(`- **${label}:** ${value}`);
    }
  };

  put("Detail", line(finding.detail));
  put("Evidence", line(finding.evidence));
  put("Package", line(finding.package));
  if (showPath) {
    put("At", line(finding.path));
  }
  put("Next", line(finding.hint));
  put("Source", finding.source === undefined ? undefined : link(finding.source, finding.source));
  if (finding.isNew === true) {
    rows.push("- **Baseline:** new since the baseline was recorded");
  }
  return rows;
}

/** Renders a report as Markdown for PR comments and GitHub summaries. */
export function renderMarkdownReport(report: ScanReport): string {
  const out: string[] = [];

  out.push(`# ${report.tool} ${report.version}`);
  out.push("");
  out.push(
    `**Verdict: ${report.verdict}** \u00b7 ${report.counts.blocker} blocker(s), ${report.counts.risk} risk(s), ${report.counts.info} info \u00b7 failOn: ${report.failOn}`,
  );
  out.push(`Target: \`${report.target}\``);
  out.push("");

  out.push("## Summary");
  out.push("");
  out.push("| Severity | Count |");
  out.push("| --- | --- |");
  for (const { severity, heading } of SEVERITY_SECTIONS) {
    out.push(`| ${heading} | ${report.counts[severity]} |`);
  }
  out.push("");

  if (report.stats !== undefined) {
    out.push(
      `Scanned ${report.stats.sourceFiles} source file(s), ${report.stats.lockedPackages} locked package(s) across ${report.stats.directDependencies + report.stats.devDependencies} direct dependency declaration(s).`,
    );
    out.push("");
  }

  if (report.targets !== undefined && report.targets.length > 0) {
    out.push("### Scanned directories");
    out.push("");
    out.push("| Directory | Kind | Verdict | Blocker | Risk | Info |");
    out.push("| --- | --- | --- | --- | --- | --- |");
    for (const target of report.targets) {
      out.push(
        `| \`${target.relative}\` | ${target.kind} | ${target.verdict} | ${target.counts.blocker} | ${target.counts.risk} | ${target.counts.info} |`,
      );
    }
    out.push("");
  }

  if (report.baseline !== undefined) {
    out.push(
      `Baseline \`${report.baseline.path}\`: ${report.baseline.known} known, ${report.baseline.new} new.`,
    );
    out.push("");
  }

  out.push("## Findings");
  out.push("");
  if (report.findings.length === 0) {
    out.push("No findings.");
    out.push("");
  }
  const showPath = report.targets !== undefined;
  for (const { severity, heading } of SEVERITY_SECTIONS) {
    const own = report.findings.filter((finding) => finding.severity === severity);
    if (own.length === 0) {
      continue;
    }
    out.push(`### ${heading} (${own.length})`);
    out.push("");
    for (const finding of own) {
      out.push(`#### ${text(finding.title)}`);
      out.push("");
      out.push(`Rule: \`${finding.id}\``);
      out.push("");
      const rows = findingBlock(finding, showPath);
      if (rows.length > 0) {
        out.push(...rows);
        out.push("");
      }
    }
  }

  const builtins = report.stats?.builtinNames ?? [];
  const runtimeFindings = report.findings.filter((finding) => finding.id.startsWith("runtime/"));
  if (builtins.length > 0 || runtimeFindings.length > 0) {
    out.push("## Node built-in usage");
    out.push("");
    out.push(
      builtins.length > 0
        ? `The project's own code imports ${builtins.length} Node built-in module(s): ${builtins.map((name) => `\`${name}\``).join(", ")}.`
        : "The project's own code imports no Node built-in modules.",
    );
    out.push("");
    for (const finding of runtimeFindings) {
      out.push(`- **${text(finding.title)}** (\`${finding.id}\`)`);
      const detail = line(finding.detail);
      if (detail !== undefined) {
        out.push(`  - ${detail}`);
      }
      if (finding.source !== undefined) {
        out.push(`  - Source: ${link(finding.source, finding.source)}`);
      }
    }
    if (runtimeFindings.length > 0) {
      out.push("");
    }
  }

  if (report.run !== undefined) {
    out.push("## Run phase");
    out.push("");
    out.push(
      `Script \`${report.run.script ?? "none"}\`: install exited ${report.run.installExitCode ?? "n/a"}, script exited ${report.run.exitCode ?? "n/a"}${report.run.timedOut ? " (timed out)" : ""}.`,
    );
    out.push("");
  }

  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}
