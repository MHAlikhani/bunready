import type { Finding } from "../../report/types";
import type { Manifest } from "../../scanner/manifest";
import { satisfies } from "../../scanner/semver";

/** The runtime the scan is running under, injected so tests are deterministic. */
export interface RuntimeInfo {
  readonly bun: string;
  readonly node: string;
}

/**
 * `engines` conflicts.
 *
 * A declared Bun range that the running Bun does not satisfy is a blocker: the
 * project states it needs a different runtime, and no amount of user patience
 * changes that. A declared Node range that Bun's Node compatibility layer does
 * not satisfy is a risk, because Bun's compatibility work often covers an
 * older range than the project asks for, and only the project's own tests can
 * settle it. A range we cannot parse is reported as info, never as a failure.
 */
export function enginesFindings(manifest: Manifest, runtime: RuntimeInfo): Finding[] {
  const findings: Finding[] = [];

  const bunRange = manifest.engines.bun;
  if (bunRange !== undefined) {
    const satisfied = satisfies(runtime.bun, bunRange);
    if (satisfied === false) {
      findings.push({
        id: "install/engines-bun",
        severity: "blocker",
        title: `this project requires Bun ${bunRange}`,
        detail: "The running Bun does not satisfy the range this project declares in package.json.",
        evidence: `engines.bun = "${bunRange}", running Bun ${runtime.bun}`,
        hint: `switch to a Bun version matching ${bunRange} before running this project.`,
      });
    } else if (satisfied === undefined) {
      findings.push({
        id: "install/engines-bun",
        severity: "info",
        title: "could not evaluate the declared Bun range",
        detail:
          "bunready evaluates a subset of semver (comparators, caret, tilde, x-ranges, hyphen ranges, `||`). This range uses syntax outside that subset, so it was reported instead of judged.",
        evidence: `engines.bun = "${bunRange}", running Bun ${runtime.bun}`,
      });
    }
  }

  const nodeRange = manifest.engines.node;
  if (nodeRange !== undefined) {
    const satisfied = satisfies(runtime.node, nodeRange);
    if (satisfied === false) {
      findings.push({
        id: "install/engines-node",
        severity: "risk",
        title: `this project declares Node ${nodeRange}`,
        detail:
          "Bun reports a different Node compatibility version, so any code path that depends on Node-version-specific behaviour should be exercised before the move.",
        evidence: `engines.node = "${nodeRange}", Bun reports Node ${runtime.node}`,
        hint: "check the project's own test suite under Bun; a Node range alone does not decide Bun compatibility.",
      });
    } else if (satisfied === undefined) {
      findings.push({
        id: "install/engines-node",
        severity: "info",
        title: "could not evaluate the declared Node range",
        detail:
          "bunready evaluates a subset of semver and this range falls outside it, so it was reported instead of judged.",
        evidence: `engines.node = "${nodeRange}", Bun reports Node ${runtime.node}`,
      });
    }
  }

  return findings;
}
