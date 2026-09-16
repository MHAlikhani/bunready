/**
 * Severity model shared by every rule.
 *
 * See docs/adr/0002-rule-severity-model.md: severity is a decision, not a
 * feeling. `blocker` means the target repo cannot run correctly on Bun until it
 * is fixed and it therefore changes the process exit code; `risk` is a real
 * hazard that needs a human judgement call; `info` is context.
 */

export const SEVERITIES = ["blocker", "risk", "info"] as const;

/** Severity levels, ordered from most to least serious. */
export type Severity = (typeof SEVERITIES)[number];

/** Lower rank sorts first: blockers surface above everything else. */
export const SEVERITY_RANK: Readonly<Record<Severity, number>> = {
  blocker: 0,
  risk: 1,
  info: 2,
};

/** Orders severities for sorting, blockers first. */
export function compareSeverity(a: Severity, b: Severity): number {
  return SEVERITY_RANK[a] - SEVERITY_RANK[b];
}

/** Counts findings per severity. */
export function countBySeverity(
  severities: readonly Severity[],
): Readonly<Record<Severity, number>> {
  const counts: Record<Severity, number> = { blocker: 0, risk: 0, info: 0 };
  for (const severity of severities) {
    counts[severity] += 1;
  }
  return counts;
}

/** CI contract: blockers fail the run, risks and notes do not. */
export function exitCodeForSeverities(severities: readonly Severity[]): number {
  return severities.includes("blocker") ? 1 : 0;
}

/** Exit code for a set of findings, honouring a configured `failOn` threshold. */
export function exitCodeForFindings(
  findings: readonly { readonly severity: Severity }[],
  failOn: Severity,
): number {
  return findings.some((finding) => compareSeverity(finding.severity, failOn) <= 0) ? 1 : 0;
}
