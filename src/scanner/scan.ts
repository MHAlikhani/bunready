import type { Result } from "../core/errors";
import { type FileSystem, nodeFileSystem } from "../core/fs";
import { TOOL_NAME, TOOL_VERSION } from "../core/version";
import { type ScanReport, verdictFor } from "../report/types";
import { installFindings } from "../rules/install";
import type { RuntimeInfo } from "../rules/install/engines";
import { countBySeverity } from "../rules/severity";
import { buildGraph } from "./graph";
import { readTarget } from "./target";

/** The runtime the scan runs under. Injected in tests so results are stable. */
export function detectRuntime(): RuntimeInfo {
  return { bun: Bun.version, node: process.versions.node };
}

export interface ScanOptions {
  readonly fs?: FileSystem;
  readonly runtime?: RuntimeInfo;
}

/**
 * Scan one repository.
 *
 * Read-only by construction: this function opens package.json, the lockfiles
 * and installed dependency manifests, and never executes the target's code.
 * Everything that could not be read ends up in the report as a finding rather
 * than being silently dropped.
 */
export async function scanTarget(
  dir: string,
  options: ScanOptions = {},
): Promise<Result<ScanReport>> {
  const fs = options.fs ?? nodeFileSystem();
  const runtime = options.runtime ?? detectRuntime();

  const target = await readTarget(dir, fs);
  if (!target.ok) {
    return { ok: false, error: target.error };
  }

  const snapshot = target.value;
  const graph = buildGraph(snapshot.manifest, snapshot.lockfiles[0]?.parsed);
  const findings = installFindings(snapshot, graph, runtime);
  const counts = countBySeverity(findings.map((finding) => finding.severity));

  return {
    ok: true,
    value: {
      tool: TOOL_NAME,
      version: TOOL_VERSION,
      target: dir,
      verdict: verdictFor(findings),
      counts,
      findings,
      stats: {
        directDependencies: graph.direct.length,
        devDependencies: graph.dev.length,
        lockedPackages: graph.lockedPackages,
        duplicateVersions: graph.duplicates.length,
        lockfiles: snapshot.lockfiles.map((entry) => entry.path),
      },
    },
  };
}
