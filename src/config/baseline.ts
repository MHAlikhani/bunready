import { defineError, type Result } from "../core/errors";
import type { Finding } from "../report/types";

/**
 * Baseline / regression detection.
 *
 * A baseline records the findings you have already accepted, so CI can fail on
 * what is *new* instead of on a repository's whole history. The fingerprint is
 * deliberately coarse - rule, package and path, not the message - so rewriting
 * a detail string does not resurrect a finding you have already triaged.
 */
export const BASELINE_SCHEMA_VERSION = 1;

/** A recorded set of known findings, keyed by fingerprint. */
export interface Baseline {
  readonly schemaVersion: number;
  readonly findings: readonly string[];
}

/** What a baseline comparison found: new, known and fixed entries. */
export interface BaselineSummary {
  readonly path: string;
  readonly known: number;
  readonly new: number;
}

/** Stable identity of a finding: its rule, package and path. */
export function fingerprint(finding: Finding): string {
  return [finding.id, finding.package ?? "", finding.path ?? ""].join("|");
}

/** Renders a baseline in its on-disk JSON form. */
export function serializeBaseline(findings: readonly Finding[]): string {
  const fingerprints = [...new Set(findings.map(fingerprint))].sort();
  const baseline: Baseline = { schemaVersion: BASELINE_SCHEMA_VERSION, findings: fingerprints };
  return `${JSON.stringify(baseline, null, 2)}\n`;
}

/** Reads a baseline file, reporting malformed input as an error. */
export function parseBaseline(text: string, source: string): Result<Baseline> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      error: defineError("E_PARSE", `${source} is not a valid baseline file`, {
        hint: "regenerate it with `bunready <path> --write-baseline <file>`.",
        cause: error,
      }),
    };
  }

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {
      ok: false,
      error: defineError("E_PARSE", `${source} must contain a JSON object`, {
        hint: "regenerate it with `--write-baseline`.",
      }),
    };
  }

  const findings = (raw as { findings?: unknown }).findings;
  if (!Array.isArray(findings)) {
    return {
      ok: false,
      error: defineError("E_PARSE", `${source} has no findings array`, {
        hint: "regenerate it with `--write-baseline`.",
      }),
    };
  }

  const schemaVersion = (raw as { schemaVersion?: unknown }).schemaVersion;
  if (schemaVersion !== undefined && typeof schemaVersion !== "number") {
    return {
      ok: false,
      error: defineError("E_PARSE", `${source} has a non-numeric schemaVersion`, {
        hint: "regenerate it with `--write-baseline`.",
      }),
    };
  }

  return {
    ok: true,
    value: {
      schemaVersion: typeof schemaVersion === "number" ? schemaVersion : BASELINE_SCHEMA_VERSION,
      findings: findings.filter((entry): entry is string => typeof entry === "string"),
    },
  };
}

/** Mark each finding as new or already known, and count both. */
export function applyBaseline(
  findings: readonly Finding[],
  baseline: Baseline,
  baselinePath: string,
): { readonly findings: readonly Finding[]; readonly summary: BaselineSummary } {
  const known = new Set(baseline.findings);
  let knownCount = 0;

  const marked = findings.map((finding) => {
    const isNew = !known.has(fingerprint(finding));
    if (!isNew) {
      knownCount += 1;
    }
    return { ...finding, isNew };
  });

  return {
    findings: marked,
    summary: { path: baselinePath, known: knownCount, new: marked.length - knownCount },
  };
}

/** Only the findings a baseline should fail a build on. */
export function newFindings(
  findings: readonly Finding[],
  hasBaseline: boolean,
): readonly Finding[] {
  return hasBaseline ? findings.filter((finding) => finding.isNew === true) : findings;
}
