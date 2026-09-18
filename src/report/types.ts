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
  /** The scanned directory this finding came from; set when more than one was scanned. */
  readonly path?: string;
  /** Present when a baseline was applied: false means it was already accepted. */
  readonly isNew?: boolean;
  /** Observed proof from the scanned repo, e.g. the offending dependency. */
  readonly evidence?: string;
  /** Link to the Bun doc or issue backing the compatibility claim. */
  readonly source?: string;
  readonly hint?: string;
}

/** Overall judgement for a scan: blocked, risky or ready. */
export type Verdict = "ready" | "risky" | "blocked";

/** One scanned directory in a multi-package repository. */
export interface ScannedTarget {
  readonly path: string;
  readonly relative: string;
  readonly kind: "root" | "workspace";
  readonly name: string | undefined;
  readonly verdict: Verdict;
  readonly counts: Readonly<Record<Severity, number>>;
}

/** What a baseline did, when one was applied. */
export interface BaselineSummary {
  readonly path: string;
  readonly known: number;
  readonly new: number;
}

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
  /** The distinct Node built-in modules the project's own code imports, sorted. */
  readonly builtinNames?: readonly string[];
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
  /** Present only when more than one directory was scanned. */
  readonly targets?: readonly ScannedTarget[];
  readonly baseline?: BaselineSummary;
}

/**
 * The single ordering authority for findings: blockers first, then risks, then
 * info; within a severity by rule id, then title, then the directory it came
 * from. The tiebreakers make the order *total*, so the same repository produces
 * byte-identical output however the findings were collected - which is what a
 * diff in a pull request or a baseline comparison depends on.
 */
export function sortFindings(findings: readonly Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const bySeverity = compareSeverity(a.severity, b.severity);
    if (bySeverity !== 0) {
      return bySeverity;
    }
    const byId = a.id.localeCompare(b.id);
    if (byId !== 0) {
      return byId;
    }
    const byTitle = a.title.localeCompare(b.title);
    return byTitle !== 0 ? byTitle : (a.path ?? "").localeCompare(b.path ?? "");
  });
}

/** The judgement a set of findings amounts to. */
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
