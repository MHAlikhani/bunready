import type { Finding } from "../../report/types";
import type { ParsedLockfile } from "../../scanner/lockfile";
import type { TargetSnapshot } from "../../scanner/target";

/**
 * The highest-value rule in the install phase.
 *
 * `bun install` does not run lifecycle scripts for packages that are not listed
 * in `trustedDependencies`. That is a real, observable behaviour change when
 * moving off npm, and when a dependency's install step is what builds a native
 * addon or downloads a binary, skipping it leaves the package broken. The user
 * cannot fix it by "doing nothing", so it is a blocker.
 *
 * Evidence comes from the lockfile (npm's `hasInstallScript`, pnpm's
 * `requiresBuild`) or from an installed copy's own manifest. Both are observed
 * facts; nothing is inferred from package names.
 */
export const LIFECYCLE_DOC = "https://bun.com/docs/pm/lifecycle";
export const TRUSTED_DEPENDENCIES_GUIDE = "https://bun.com/guides/install/trusted";

const ID = "install/lifecycle-script";

export function lifecycleScriptFindings(
  snapshot: TargetSnapshot,
  lockfile: ParsedLockfile | undefined,
): Finding[] {
  const trusted = new Set(snapshot.manifest.trustedDependencies);
  const evidence = new Map<string, string>();

  for (const pkg of lockfile?.packages ?? []) {
    if (pkg.installScript) {
      evidence.set(pkg.name, `the lockfile marks ${pkg.name} as requiring a build step`);
    }
  }

  for (const probe of snapshot.packageEvidence) {
    if (probe.installScripts.length === 0) {
      continue;
    }
    const scripts = probe.installScripts.map((name) => `"${name}"`).join(", ");
    evidence.set(probe.name, `${probe.path} declares ${scripts}`);
  }

  return [...evidence.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, where]) => {
      if (trusted.has(name)) {
        return {
          id: ID,
          severity: "info" as const,
          title: `${name} runs an install script and is trusted`,
          package: name,
          detail:
            "Bun will run this package's install script because it is listed in trustedDependencies.",
          evidence: where,
        };
      }
      return {
        id: ID,
        severity: "blocker" as const,
        title: `${name} installs nothing: its install script will not run`,
        package: name,
        detail:
          "Bun installs dependencies without running their lifecycle scripts unless the package is listed in trustedDependencies. If this package builds a native addon or downloads a binary during install, that step is skipped.",
        evidence: where,
        hint: `add "${name}" to trustedDependencies in package.json, then reinstall.`,
        source: LIFECYCLE_DOC,
      };
    });
}
