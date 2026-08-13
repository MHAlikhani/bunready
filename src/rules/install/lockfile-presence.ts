import type { Finding } from "../../report/types";
import type { TargetSnapshot } from "../../scanner/target";

/**
 * What the scan could and could not see.
 *
 * These findings describe the evidence base itself. A scan that could not read
 * the lockfile must say so, because "no dependency problems found" would
 * otherwise be indistinguishable from "we only looked at one package.json".
 */
const NO_LOCKFILE_ID = "install/no-lockfile";
const BINARY_LOCKFILE_ID = "install/binary-lockfile";
const UNPARSED_LOCKFILE_ID = "install/unparsed-lockfile";
const MULTIPLE_LOCKFILES_ID = "install/multiple-lockfiles";

export function lockfileFindings(snapshot: TargetSnapshot): Finding[] {
  const findings: Finding[] = [];

  if (snapshot.lockfiles.length === 0 && snapshot.binaryBunLock === undefined) {
    findings.push({
      id: NO_LOCKFILE_ID,
      severity: "info",
      title: "no lockfile found",
      detail:
        "Without a lockfile the dependency graph covers only the packages named in package.json, so transitive install-phase problems cannot be seen.",
      evidence: `looked for bun.lock, package-lock.json, yarn.lock and pnpm-lock.yaml in ${snapshot.dir}`,
      hint: "commit a lockfile so the move to Bun installs the same versions you tested.",
    });
  }

  if (snapshot.binaryBunLock !== undefined) {
    findings.push({
      id: BINARY_LOCKFILE_ID,
      severity: "risk",
      title: "bun.lockb is a binary lockfile",
      detail:
        "bunready reads the text lockfile format only. The contents of bun.lockb are not guessed at, so this scan cannot see your transitive dependencies.",
      evidence: `${snapshot.binaryBunLock} exists`,
      hint: "regenerate the lockfile with `bun install` on Bun 1.2 or newer to produce the text format bun.lock.",
    });
  }

  if (snapshot.lockfiles.length > 1) {
    const names = snapshot.lockfiles.map((entry) => entry.path).join(", ");
    findings.push({
      id: MULTIPLE_LOCKFILES_ID,
      severity: "info",
      title: "more than one lockfile is present",
      detail:
        "The graph was built from the highest-priority lockfile in the repository; the others were ignored.",
      evidence: names,
      hint: "remove the lockfiles belonging to the package manager you are actually leaving behind.",
    });
  }

  for (const unparsed of snapshot.unparsedLockfiles) {
    findings.push({
      id: UNPARSED_LOCKFILE_ID,
      severity: "risk",
      title: `${unparsed.path} could not be read`,
      detail: unparsed.message,
      evidence: `${unparsed.kind} lockfile at ${unparsed.path}`,
      hint: "regenerate the lockfile with the package manager that produced it, then scan again.",
    });
  }

  return findings;
}
