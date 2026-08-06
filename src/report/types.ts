import type { Severity } from "../rules/severity";

/**
 * A single thing bunready can say about a target repo.
 *
 * Every finding must be traceable to evidence: either something observed in the
 * scanned repository (`evidence`) or a public Bun documentation / issue entry
 * (`source`). A finding with neither should not ship.
 */
export interface Finding {
  /** Stable rule id, namespaced by phase, e.g. `install/native-addon`. */
  readonly id: string;
  readonly severity: Severity;
  readonly title: string;
  readonly detail: string;
  /** Observed proof from the scanned repo, e.g. the offending dependency. */
  readonly evidence?: string;
  /** Link to the Bun doc or issue backing the compatibility claim. */
  readonly source?: string;
  readonly hint?: string;
}

export type Verdict = "ready" | "risky" | "blocked";

/** The machine-readable shape emitted by `--json`. */
export interface ScanReport {
  readonly tool: string;
  readonly version: string;
  readonly target: string;
  readonly verdict: Verdict;
  readonly counts: Readonly<Record<Severity, number>>;
  readonly findings: readonly Finding[];
}

export function verdictFor(findings: readonly Finding[]): Verdict {
  let verdict: Verdict = "ready";
  for (const finding of findings) {
    if (finding.severity === "blocker") {
      return "blocked";
    }
    if (finding.severity === "risk") {
      verdict = "risky";
    }
  }
  return verdict;
}
