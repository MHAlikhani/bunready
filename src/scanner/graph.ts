import type { ParsedLockfile } from "./lockfile";
import type { Manifest } from "./manifest";

/** What bunready knows about the dependency set, and nothing more. */
export interface DependencyGraph {
  readonly direct: readonly string[];
  readonly dev: readonly string[];
  readonly optional: readonly string[];
  readonly peer: readonly string[];
  /** Distinct locked package names. */
  readonly lockedNames: number;
  /** Distinct name@version pairs in the lockfile. */
  readonly lockedPackages: number;
  readonly duplicates: readonly DuplicateVersion[];
}

export interface DuplicateVersion {
  readonly name: string;
  readonly versions: readonly string[];
}

function names(map: Readonly<Record<string, string>>): string[] {
  return Object.keys(map).sort();
}

/**
 * Build the graph from the manifest (direct dependencies, always trustworthy)
 * plus the lockfile (transitive packages, only as good as the lockfile).
 *
 * Dev-ness of transitive packages is NOT inferred: only lockfiles that record
 * it (npm) contribute that flag, and the graph does not use it to guess.
 */
export function buildGraph(
  manifest: Manifest,
  lockfile: ParsedLockfile | undefined,
): DependencyGraph {
  const versionsByName = new Map<string, Set<string>>();
  for (const pkg of lockfile?.packages ?? []) {
    const bucket = versionsByName.get(pkg.name) ?? new Set<string>();
    bucket.add(pkg.version);
    versionsByName.set(pkg.name, bucket);
  }

  const duplicates: DuplicateVersion[] = [];
  for (const [name, versions] of [...versionsByName.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    if (versions.size > 1) {
      duplicates.push({ name, versions: [...versions].sort() });
    }
  }

  return {
    direct: names(manifest.dependencies),
    dev: names(manifest.devDependencies),
    optional: names(manifest.optionalDependencies),
    peer: names(manifest.peerDependencies),
    lockedNames: versionsByName.size,
    lockedPackages: lockfile?.packages.length ?? 0,
    duplicates,
  };
}

/** Every package name bunready saw, direct or transitive, deduplicated. */
export function knownPackageNames(
  graph: DependencyGraph,
  lockfile: ParsedLockfile | undefined,
): Set<string> {
  const result = new Set<string>([
    ...graph.direct,
    ...graph.dev,
    ...graph.optional,
    ...graph.peer,
    ...(lockfile?.packages ?? []).map((pkg) => pkg.name),
  ]);
  return result;
}
