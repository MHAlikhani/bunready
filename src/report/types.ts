import { compareSeverity, type Severity } from "../rules/severity";

/** The `--json` contract version. Bumped only for a breaking field change. */
export const SCHEMA_VERSION = 1;

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
  /** The dependency this finding is about, when there is one. */
  readonly package?: string;
  /** Observed proof from the scanned repo, e.g. the offending dependency. */
  readonly evidence?: string;
  /** Link to the Bun doc or issue backing the compatibility claim. */
  readonly source?: string;
  readonly hint?: string;
}

export type Verdict = "ready" | "risky" | "blocked";

/** What `--run` actually did, so a run result can be read without the log. */
export interface RunSummary {
  readonly script: string | undefined;
  readonly installExitCode: number | null;
  readonly exitCode: number | null;
  readonly timedOut: boolean;
  readonly durationMs: number | undefined;
  readonly firstFailure: string | undefined;
}

/** What the scan looked at, so a verdict can be read in proportion. */
export interface ScanStats {
  readonly directDependencies: number;
  readonly devDependencies: number;
  readonly lockedPackages: number;
  readonly duplicateVersions: number;
  readonly lockfiles: readonly string[];
  readonly sourceFiles: number;
  readonly nodeBuiltins: number;
}

/** The machine-readable shape emitted by `--json`. */
export interface ScanReport {
  /** Bumped when a field is renamed or removed. CI can pin on it. */
  readonly schemaVersion: number;
  /** Lowest severity that makes this report fail; the exit code follows it. */
  readonly failOn: Severity;
  readonly tool: string;
  readonly version: string;
  readonly target: string;
  readonly verdict: Verdict;
  readonly counts: Readonly<Record<Severity, number>>;
  readonly findings: readonly Finding[];
  readonly stats?: ScanStats;
  readonly run?: RunSummary;
}

/** Blockers first, then risks, then info; stable within a severity. */
export function sortFindings(findings: readonly Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const bySeverity = compareSeverity(a.severity, b.severity);
    if (bySeverity !== 0) {
      return bySeverity;
    }
    const byId = a.id.localeCompare(b.id);
    return byId !== 0 ? byId : a.title.localeCompare(b.title);
  });
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
