import { defineError, type Result } from "../core/errors";
import { type FileSystem, nodeFileSystem } from "../core/fs";
import { TOOL_NAME, TOOL_VERSION } from "../core/version";
import {
  type RunSummary,
  SCHEMA_VERSION,
  type ScanReport,
  sortFindings,
  verdictFor,
} from "../report/types";
import { installFindings } from "../rules/install";
import type { RuntimeInfo } from "../rules/install/engines";
import { runFindings } from "../rules/run";
import { runtimeFindings } from "../rules/runtime";
import { collectNodeBuiltins } from "../rules/runtime/builtins";
import { countBySeverity } from "../rules/severity";
import {
  DEFAULT_RUN_OPTIONS,
  executeProject,
  type RunEnvironment,
  type RunOptions,
  systemRunEnvironment,
} from "./execute";
import { buildGraph } from "./graph";
import { scanSources } from "./sources";
import { readTarget } from "./target";

/** The runtime the scan runs under. Injected in tests so results are stable. */
export function detectRuntime(): RuntimeInfo {
  return { bun: Bun.version, node: process.versions.node };
}

export interface ScanOptions {
  readonly fs?: FileSystem;
  readonly runtime?: RuntimeInfo;
  /** Opt in to executing the target's code in a temporary copy. */
  readonly run?: boolean;
  /** Script to boot; defaults to config, then the first of start/test. */
  readonly runScript?: string;
  readonly configPath?: string;
  readonly runEnvironment?: RunEnvironment;
  readonly runOptions?: RunOptions;
}

/**
 * Scan one repository.
 *
 * Read-only unless `run` is set: the default path opens package.json, the
 * lockfile, installed dependency manifests and the repository's own source, and
 * never executes the target's code. Everything that could not be read ends up in
 * the report as a finding rather than being silently dropped.
 */
export async function scanTarget(
  dir: string,
  options: ScanOptions = {},
): Promise<Result<ScanReport>> {
  const fs = options.fs ?? nodeFileSystem();
  const runtime = options.runtime ?? detectRuntime();

  const target = await readTarget(dir, fs, options.configPath);
  if (!target.ok) {
    return { ok: false, error: target.error };
  }

  const snapshot = target.value;
  const config = snapshot.config;
  const graph = buildGraph(snapshot.manifest, snapshot.lockfiles[0]?.parsed);
  const sources = await scanSources(dir, fs, { excludePaths: config.excludePaths });
  const usages = collectNodeBuiltins(sources);

  const requestedScript = options.runScript ?? config.run.script;
  if (requestedScript !== undefined && snapshot.manifest.scripts[requestedScript] === undefined) {
    const available = Object.keys(snapshot.manifest.scripts).sort();
    return {
      ok: false,
      error: defineError("E_USAGE", `this project has no "${requestedScript}" script`, {
        hint:
          available.length === 0
            ? "package.json declares no scripts at all."
            : `available scripts: ${available.join(", ")}.`,
      }),
    };
  }

  const staticFindings = [
    ...installFindings(snapshot, graph, runtime),
    ...runtimeFindings(sources, usages),
  ];

  let executedFindings: ReturnType<typeof runFindings> = [];
  let runSummary: RunSummary | undefined;

  if (options.run === true) {
    const runOptions: RunOptions = {
      installTimeoutMs: DEFAULT_RUN_OPTIONS.installTimeoutMs,
      scriptTimeoutMs: DEFAULT_RUN_OPTIONS.scriptTimeoutMs,
      maxCopyMegabytes: config.run.maxCopyMegabytes,
      ...(requestedScript === undefined ? {} : { script: requestedScript }),
    };
    const executed = await executeProject(
      dir,
      snapshot.manifest,
      options.runEnvironment ?? systemRunEnvironment(),
      runOptions,
    );
    if (!executed.ok) {
      return { ok: false, error: executed.error };
    }

    const outcome = executed.value;
    executedFindings = runFindings(outcome, runOptions);
    runSummary = {
      script: outcome.script,
      installExitCode: outcome.install?.code ?? null,
      exitCode: outcome.result?.code ?? null,
      timedOut: outcome.result?.timedOut ?? false,
      durationMs: outcome.result?.durationMs,
      firstFailure: outcome.failure?.message,
    };
  }

  const ignored = new Set(config.ignore);
  const ignoredPackages = new Set(config.ignorePackages);
  const findings = sortFindings(
    [...staticFindings, ...executedFindings].filter(
      (finding) =>
        !ignored.has(finding.id) &&
        (finding.package === undefined || !ignoredPackages.has(finding.package)),
    ),
  );
  const counts = countBySeverity(findings.map((finding) => finding.severity));

  return {
    ok: true,
    value: {
      schemaVersion: SCHEMA_VERSION,
      failOn: config.failOn,
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
        sourceFiles: sources.filesScanned,
        nodeBuiltins: usages.length,
      },
      ...(runSummary === undefined ? {} : { run: runSummary }),
    },
  };
}
