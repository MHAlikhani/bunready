import { type Finding, sortFindings } from "../../report/types";
import type { DependencyGraph } from "../../scanner/graph";
import type { TargetSnapshot } from "../../scanner/target";
import { enginesFindings, type RuntimeInfo } from "./engines";
import { lifecycleScriptFindings } from "./lifecycle-scripts";
import { lockfileFindings } from "./lockfile-presence";
import { nativeAddonFindings } from "./native-addon";

/**
 * Every install-phase rule. Runtime-phase rules (Node built-ins Bun does not
 * implement, the curated list of packages known to misbehave at runtime) are a
 * separate phase and are deliberately absent.
 */
export function installFindings(
  snapshot: TargetSnapshot,
  graph: DependencyGraph,
  runtime: RuntimeInfo,
): Finding[] {
  const primaryLockfile = snapshot.lockfiles[0]?.parsed;

  return sortFindings([
    ...lockfileFindings(snapshot),
    ...nativeAddonFindings(snapshot, graph, primaryLockfile),
    ...lifecycleScriptFindings(snapshot, primaryLockfile),
    ...enginesFindings(snapshot.manifest, runtime),
  ]);
}
