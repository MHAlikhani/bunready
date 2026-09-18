import type { Finding } from "../../report/types";
import { classifySpecifier, type SourceScan } from "../../scanner/sources";
import runtimeDataset from "../data/node-runtime.json" with { type: "json" };

/**
 * Runtime-phase rule: what Node surface the repository actually depends on.
 *
 * The finding is deliberately an inventory with a pointer, not a verdict. Bun's
 * Node compatibility is broad, actively changing, and version-dependent, so
 * bunready only asserts what it can observe (these modules are imported in these
 * files) and cites the compatibility table. A module is called out as a risk
 * only when the vendored dataset carries a primary source for that specific
 * claim - see docs/adr/0001-data-source-policy.md.
 */
const INVENTORY_ID = "runtime/node-builtins";
const GAP_ID = "runtime/known-gap";
const GLOBAL_GAP_ID = "runtime/known-global-gap";
const COVERAGE_ID = "runtime/scan-coverage";
const MAX_LISTED_MODULES = 8;

/** One row of the Node runtime gap dataset. */
export interface RuntimeGapEntry {
  readonly name: string;
  readonly status: "partial" | "unimplemented";
  readonly note: string;
  readonly source: string;
}

/** The shipped dataset of Node runtime gaps, each with its source. */
export interface RuntimeDataset {
  readonly compatibilityDocs: string | undefined;
  readonly gaps: readonly RuntimeGapEntry[];
  /** Node globals (not modules) whose compatibility the table records. */
  readonly globalGaps?: readonly RuntimeGapEntry[];
}

/** Every identifier the dataset watches for, so the scan can locate them. */
export function datasetIdentifiers(dataset: RuntimeDataset): string[] {
  return [...new Set((dataset.globalGaps ?? []).map((gap) => gap.name))].sort((a, b) =>
    a.localeCompare(b),
  );
}

/** A Node built-in the project imports, with where it is used. */
export interface BuiltinUsage {
  readonly name: string;
  readonly files: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validate the vendored dataset instead of trusting the import blindly. */
export function readRuntimeDataset(raw: unknown = runtimeDataset): RuntimeDataset {
  if (!isRecord(raw)) {
    return { compatibilityDocs: undefined, gaps: [], globalGaps: [] };
  }

  const readEntries = (rows: unknown): RuntimeGapEntry[] => {
    const entries: RuntimeGapEntry[] = [];
    for (const candidate of Array.isArray(rows) ? rows : []) {
      if (!isRecord(candidate)) {
        continue;
      }
      const { name, status, note, source } = candidate;
      if (
        typeof name === "string" &&
        (status === "partial" || status === "unimplemented") &&
        typeof note === "string" &&
        typeof source === "string"
      ) {
        entries.push({ name, status, note, source });
      }
    }
    return entries;
  };

  return {
    compatibilityDocs:
      typeof raw.compatibilityDocs === "string" ? raw.compatibilityDocs : undefined,
    gaps: readEntries(raw.gaps),
    globalGaps: readEntries(raw.globalGaps),
  };
}

/** Node built-ins imported by the repository's own code, with where they appear. */
export function collectNodeBuiltins(scan: SourceScan): BuiltinUsage[] {
  const filesByName = new Map<string, Set<string>>();

  for (const file of scan.files) {
    for (const ref of file.imports) {
      if (classifySpecifier(ref.specifier) !== "node-builtin") {
        continue;
      }
      const name = ref.specifier.startsWith("node:") ? ref.specifier.slice(5) : ref.specifier;
      const bucket = filesByName.get(name) ?? new Set<string>();
      bucket.add(file.path);
      filesByName.set(name, bucket);
    }
  }

  return [...filesByName.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, files]) => ({ name, files: [...files].sort() }));
}

function normalise(name: string): string {
  return name.startsWith("node:") ? name.slice(5) : name;
}

/** Reports the Node built-ins the project's own code imports. */
export function runtimeBuiltinFindings(
  scan: SourceScan,
  usages: readonly BuiltinUsage[],
  dataset: RuntimeDataset = readRuntimeDataset(),
): Finding[] {
  const findings: Finding[] = [];
  const byName = new Map(usages.map((usage) => [normalise(usage.name), usage]));

  if (usages.length > 0) {
    const listed = usages.slice(0, MAX_LISTED_MODULES).map((usage) => usage.name);
    const remainder = usages.length - listed.length;
    const fileCount = new Set(usages.flatMap((usage) => usage.files)).size;
    findings.push({
      id: INVENTORY_ID,
      severity: "info",
      title: `the project's own code imports ${usages.length} Node built-in module(s)`,
      detail:
        "Bun implements a large and still-moving part of the Node API. These are the modules this repository depends on; each was found by scanning the repository's own source, not its dependencies.",
      evidence: `${listed.join(", ")}${remainder > 0 ? ` and ${remainder} more` : ""} (in ${fileCount} file(s))`,
      ...(dataset.compatibilityDocs === undefined ? {} : { source: dataset.compatibilityDocs }),
      hint: "run the project's own test suite under Bun: it decides more about your code than a compatibility table can.",
    });
  }

  for (const gap of dataset.gaps) {
    const usage = byName.get(normalise(gap.name));
    if (usage === undefined) {
      continue;
    }
    // A `partial` module usually still runs; an `unimplemented` module breaks
    // on import with no user action, which is the blocker bar (D2).
    findings.push({
      id: GAP_ID,
      severity: gap.status === "unimplemented" ? "blocker" : "risk",
      title: `${gap.name} is ${gap.status} in Bun and this project imports it`,
      detail: gap.note,
      evidence: `${usage.files.length} file(s), first at ${usage.files[0] ?? "unknown"}`,
      source: gap.source,
      hint: `check ${gap.name} against the compatibility table and cover it with a test before switching.`,
    });
  }

  // Globals are not imports: the scan's identifier watch list (fed from this
  // dataset) is what locates them, so the same evidence bar holds - the file
  // list comes from the repository, the compatibility claim from the source.
  const globalFiles = new Map<string, Set<string>>();
  for (const file of scan.files) {
    for (const name of file.identifiers ?? []) {
      const bucket = globalFiles.get(name) ?? new Set<string>();
      bucket.add(file.path);
      globalFiles.set(name, bucket);
    }
  }

  for (const gap of dataset.globalGaps ?? []) {
    const files = globalFiles.get(gap.name);
    if (files === undefined) {
      continue;
    }
    const sorted = [...files].sort();
    findings.push({
      id: GLOBAL_GAP_ID,
      severity: gap.status === "unimplemented" ? "blocker" : "risk",
      title: `the ${gap.name} global is ${gap.status} in Bun and this project reads it`,
      detail: gap.note,
      evidence: `${sorted.length} file(s), first at ${sorted[0] ?? "unknown"}`,
      source: gap.source,
      hint: `guard the ${gap.name} access (feature-detect or polyfill) and cover it with a test before switching.`,
    });
  }

  if (scan.truncated) {
    findings.push({
      id: COVERAGE_ID,
      severity: "info",
      title: "the source scan stopped at its file limit",
      detail:
        "The import inventory covers only part of the repository, so an imported module may be missing from it.",
      evidence: `scanned ${scan.filesScanned} source file(s)`,
      hint: "scan a subdirectory, or raise the limit if you need the complete inventory.",
    });
  }

  return findings;
}
