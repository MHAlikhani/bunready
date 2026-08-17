import { type Finding, sortFindings } from "../../report/types";
import type { SourceScan } from "../../scanner/sources";
import { type BuiltinUsage, type RuntimeDataset, runtimeBuiltinFindings } from "./builtins";

/**
 * Every runtime-phase rule.
 *
 * Currently one rule family: the Node surface the repository imports. Rules that
 * would need compatibility claims bunready cannot source belong in the vendored
 * dataset, not in code.
 */
export function runtimeFindings(
  scan: SourceScan,
  usages: readonly BuiltinUsage[],
  dataset?: RuntimeDataset,
): Finding[] {
  return sortFindings(runtimeBuiltinFindings(scan, usages, dataset));
}
