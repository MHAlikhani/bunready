import type { Finding } from "../../report/types";
import type { DependencyGraph } from "../../scanner/graph";
import { knownPackageNames } from "../../scanner/graph";
import type { ParsedLockfile } from "../../scanner/lockfile";
import type { TargetSnapshot } from "../../scanner/target";
import nativeDataset from "../data/native-packages.json";

/**
 * Native-addon detection, in evidence order:
 *   1. the package is in our curated list (a property of the package, with a
 *      source link), 2. the target's own manifest pulls in a build tool, 3. an
 *      installed copy declares `gypfile`.
 *
 * All three produce `risk`, never `blocker`: plenty of these packages ship a
 * prebuilt binary for the common platforms, so "will not work on Bun" would be
 * a claim bunready cannot back. The hard failure lives in the lifecycle rule,
 * where a skipped install script is observable.
 */

export interface NativePackageEntry {
  readonly name: string;
  readonly reason: string;
  readonly source: string;
}

export const BUILD_TOOL_PACKAGES = [
  "node-gyp",
  "node-pre-gyp",
  "prebuild-install",
  "node-gyp-build",
  "cmake-js",
] as const;

const NATIVE_ADDON_ID = "install/native-addon";
const BUILD_TOOL_ID = "install/native-build-tools";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validate the vendored dataset instead of trusting the import blindly. */
export function readDataset(raw: unknown = nativeDataset): NativePackageEntry[] {
  if (!isRecord(raw) || !Array.isArray(raw.packages)) {
    return [];
  }
  const entries: NativePackageEntry[] = [];
  for (const candidate of raw.packages) {
    if (!isRecord(candidate)) {
      continue;
    }
    const { name, reason, source } = candidate;
    if (typeof name === "string" && typeof reason === "string" && typeof source === "string") {
      entries.push({ name, reason, source });
    }
  }
  return entries;
}

export function nativeAddonFindings(
  snapshot: TargetSnapshot,
  graph: DependencyGraph,
  lockfile: ParsedLockfile | undefined,
): Finding[] {
  const findings = new Map<string, Finding>();
  const known = knownPackageNames(graph, lockfile);
  const direct = new Set([...graph.direct, ...graph.dev, ...graph.optional]);

  for (const entry of readDataset()) {
    if (!known.has(entry.name)) {
      continue;
    }
    findings.set(entry.name, {
      id: NATIVE_ADDON_ID,
      severity: "risk",
      title: `${entry.name} ships a native addon`,
      detail: entry.reason,
      evidence: direct.has(entry.name) ? "declared in package.json" : "present in the lockfile",
      source: entry.source,
      hint: "check that a prebuilt binary exists for your platform, otherwise this one needs a working C/C++ toolchain.",
    });
  }

  for (const evidence of snapshot.packageEvidence) {
    if (!evidence.gypfile || findings.has(evidence.name)) {
      continue;
    }
    findings.set(evidence.name, {
      id: NATIVE_ADDON_ID,
      severity: "risk",
      title: `${evidence.name} builds a native addon on install`,
      detail:
        "The installed copy of this package sets `gypfile`, so it compiles a native addon rather than shipping one.",
      evidence: `${evidence.path} sets "gypfile": true`,
      hint: "this needs a C/C++ toolchain and a Python interpreter available at install time.",
    });
  }

  const declaredTools = BUILD_TOOL_PACKAGES.filter((tool) => {
    if (direct.has(tool)) {
      return true;
    }
    return Object.values(snapshot.manifest.scripts).some((script) => script.includes(tool));
  });

  const result = [...findings.values()];
  if (declaredTools.length > 0) {
    result.push({
      id: BUILD_TOOL_ID,
      severity: "risk",
      title: "the project builds native code with node-gyp tooling",
      detail: `Resolving these build tools is a prerequisite for every native dependency to install: ${declaredTools.join(", ")}.`,
      evidence: direct.has(declaredTools[0] ?? "")
        ? `declared as a dependency: ${declaredTools.join(", ")}`
        : `referenced by a package.json script: ${declaredTools.join(", ")}`,
      hint: "install the toolchain you already rely on, or switch the dependency to a package that ships prebuilds.",
    });
  }

  return result;
}
