import type { ScanReport } from "./types";

/**
 * The machine-readable report.
 *
 * Field names are the contract CI parses, so this stays a straight projection
 * of `ScanReport`: nothing is added, renamed or reordered here.
 */
export function renderJsonReport(report: ScanReport): string {
  return JSON.stringify(report, null, 2);
}
