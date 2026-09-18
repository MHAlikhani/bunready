import { join, resolve } from "node:path";
import { applyBaseline, parseBaseline } from "../config/baseline";
import { defineError, type Result } from "../core/errors";
import { type FileSystem, nodeFileSystem } from "../core/fs";
import { TOOL_NAME, TOOL_VERSION } from "../core/version";
import {
  type Finding,
  type RunSummary,
  SCHEMA_VERSION,
  type ScannedTarget,
  type ScanReport,
  sortFindings,
  verdictFor,
} from "../report/types";
import { installFindings } from "../rules/install";
import type { RuntimeInfo } from "../rules/install/engines";
import { runFindings } from "../rules/run";
import { runtimeFindings } from "../rules/runtime";
import {
  collectNodeBuiltins,
  datasetIdentifiers,
  readRuntimeDataset,
} from "../rules/runtime/builtins";
import { countBySeverity } from "../rules/severity";
import {
  DEFAULT_RUN_OPTIONS,
  executeProject,
  type RunEnvironment,
  type RunOptions,
  systemRunEnvironment,
} from "./execute";
import {
  changedFiles,
  DEFAULT_SINCE,
  type GitEnvironment,
  gitRoot,
  mapChangedFiles,
  systemGitEnvironment,
} from "./git";
import { buildGraph } from "./graph";
import { scanSources } from "./sources";
import { readTarget, type TargetSnapshot } from "./target";
import {
  findWorkspacePackages,
  readPnpmWorkspace,
  scopeMatches,
  type WorkspacePackage,
  workspacePatterns,
} from "./workspaces";

/** The runtime the scan runs under. Injected in tests so results are stable. */
export function detectRuntime(): RuntimeInfo {
  return { bun: Bun.version, node: process.versions.node };
}

/** Options for scanning a target: configuration, runtime versions and paths. */
export interface ScanOptions {
  readonly fs?: FileSystem;
  readonly runtime?: RuntimeInfo;
  /** Opt in to executing the target's code in a temporary copy (root only). */
  readonly run?: boolean;
  readonly runScript?: string;
  readonly configPath?: string;
  /** Restrict a workspace scan to the packages matching this string. */
  readonly scope?: string;
  /** Compare against a recorded baseline and mark new findings. */
  readonly baselinePath?: string;
  /** Scan only the workspace packages changed since `since`. */
  readonly changedOnly?: boolean;
  /** The ref `--changed-only` compares against; `HEAD~1` when omitted. */
  readonly since?: string;
  /** How git is invoked; injected so tests need no git binary. */
  readonly gitEnvironment?: GitEnvironment;
  readonly runEnvironment?: RunEnvironment;
  readonly runOptions?: RunOptions;
}

interface TargetResult {
  readonly dir: string;
  readonly relative: string;
  readonly kind: "root" | "workspace";
  readonly name: string | undefined;
  readonly findings: readonly Finding[];
  readonly builtinNames: readonly string[];
  readonly sourceFiles: number;
  readonly snapshot: TargetSnapshot;
}

async function scanOne(
  dir: string,
  relative: string,
  kind: "root" | "workspace",
  fs: FileSystem,
  runtime: RuntimeInfo,
  configPath: string | undefined,
  skipConfigDiscovery: boolean,
  rootConfig: TargetSnapshot["config"],
  extraExcludePaths: readonly string[] = [],
): Promise<Result<TargetResult>> {
  const target = await readTarget(dir, fs, configPath, skipConfigDiscovery);
  if (!target.ok) {
    return { ok: false, error: target.error };
  }

  // One configuration governs the whole scan; a package's own file is ignored.
  const snapshot: TargetSnapshot = { ...target.value, config: rootConfig };
  const graph = buildGraph(snapshot.manifest, snapshot.lockfiles[0]?.parsed);
  const sources = await scanSources(dir, fs, {
    excludePaths: [...rootConfig.excludePaths, ...extraExcludePaths],
    // The runtime dataset decides which identifiers are worth locating: a
    // global only becomes a finding when the vendored table records it.
    identifiers: datasetIdentifiers(readRuntimeDataset()),
  });
  const usages = collectNodeBuiltins(sources);

  const findings = [
    ...installFindings(snapshot, graph, runtime),
    ...runtimeFindings(sources, usages),
  ].map((finding) => ({ ...finding, path: dir.replace(/\\/g, "/") }));

  return {
    ok: true,
    value: {
      dir,
      relative,
      kind,
      name: snapshot.manifest.name,
      findings,
      builtinNames: usages.map((usage) => usage.name),
      sourceFiles: sources.filesScanned,
      snapshot,
    },
  };
}

/**
 * Scan one repository, or every package in a workspace.
 *
 * Read-only unless `run` is set. Configuration is read once from the root and
 * applied to every package, so a monorepo cannot end up with two different
 * thresholds in one report.
 */
export async function scanTarget(
  dir: string,
  options: ScanOptions = {},
): Promise<Result<ScanReport>> {
  const fs = options.fs ?? nodeFileSystem();
  const runtime = options.runtime ?? detectRuntime();

  const rootTarget = await readTarget(dir, fs, options.configPath);
  if (!rootTarget.ok) {
    return { ok: false, error: rootTarget.error };
  }

  const rootSnapshot = rootTarget.value;
  const config = rootSnapshot.config;

  const patterns = workspacePatterns(rootSnapshot.manifest, await readPnpmWorkspace(dir, fs));
  const packages = patterns.length > 0 ? await findWorkspacePackages(dir, patterns, fs) : [];

  let selected: WorkspacePackage[] = packages;
  let includeRoot = true;

  if (options.changedOnly === true && options.scope !== undefined) {
    return {
      ok: false,
      error: defineError(
        "E_USAGE",
        "--changed-only and --scope both narrow the scan, in different ways",
        {
          hint: "--changed-only follows the git history; --scope matches package names. Pick one.",
        },
      ),
    };
  }

  if (options.changedOnly === true) {
    const since = options.since ?? DEFAULT_SINCE;
    const env = options.gitEnvironment ?? systemGitEnvironment();
    const root = await gitRoot(dir, env);
    if (root === undefined) {
      return {
        ok: false,
        error: defineError(
          "E_USAGE",
          `--changed-only needs a git repository, and ${dir} is not inside one`,
          {
            hint: "run bunready from a git clone, or drop --changed-only to scan everything.",
          },
        ),
      };
    }

    // The diff is relative to the git root; when the target is a subdirectory,
    // only its slice of the diff is this scan's business. A target that cannot
    // be placed under the root (memory fixtures, unusual mounts) keeps the
    // root-relative diff, which is what its fixtures are keyed by.
    const absDir = resolve(dir).replace(/\\/g, "/");
    const subDir =
      absDir === root ? "" : absDir.startsWith(`${root}/`) ? absDir.slice(root.length + 1) : "";
    const outcome = await changedFiles(root, since, env);
    if (!outcome.ok) {
      return { ok: false, error: outcome.error };
    }
    const owned =
      subDir === ""
        ? outcome.value.files
        : outcome.value.files
            .filter((file) => file.startsWith(`${subDir}/`))
            .map((file) => file.slice(subDir.length + 1));

    // Package discovery and file mapping go through the same fs the scan
    // uses, so the target is addressed exactly as it was given; the absolute
    // form is only needed to slice a subdirectory out of the root diff.
    const mapRoot = subDir === "" ? dir.replace(/\\/g, "/") : absDir;
    const mapping = await mapChangedFiles(mapRoot, owned, patterns, fs);
    if (mapping.packages.length === 0 && !mapping.rootChanged) {
      // Nothing changed: report that plainly instead of scanning everything,
      // which is what a silent fallback would do.
      const findings = sortFindings([
        {
          id: "scan/no-changes",
          severity: "info",
          title: `no changes since ${since}, so there was nothing to scan`,
          detail:
            "--changed-only compares the working tree against the given ref and scans only the workspace packages that changed. No file in this target changed.",
          evidence: `${outcome.value.files.length} changed file(s) in the repository, 0 under this target`,
          hint: "pass an older ref with --since to scan more of the history.",
        },
      ]);
      return {
        ok: true,
        value: {
          schemaVersion: SCHEMA_VERSION,
          failOn: config.failOn,
          tool: TOOL_NAME,
          version: TOOL_VERSION,
          target: dir.replace(/\\/g, "/"),
          verdict: verdictFor(findings),
          counts: countBySeverity(findings.map((finding) => finding.severity)),
          findings,
          stats: {
            directDependencies: 0,
            devDependencies: 0,
            lockedPackages: 0,
            duplicateVersions: 0,
            lockfiles: rootSnapshot.lockfiles.map((entry) => entry.path),
            sourceFiles: 0,
            nodeBuiltins: 0,
          },
        },
      };
    }

    const changedDirs = new Set(mapping.packages.map((pkg) => pkg.relative));
    selected = packages.filter((pkg) => changedDirs.has(pkg.relative));
    includeRoot = mapping.rootChanged;
  }

  if (options.scope !== undefined) {
    if (packages.length === 0) {
      return {
        ok: false,
        error: defineError(
          "E_USAGE",
          "--scope was given but this repository declares no workspaces",
          {
            hint: "remove --scope, or add a workspaces field to package.json.",
          },
        ),
      };
    }
    selected = packages.filter((pkg) => scopeMatches(pkg.relative, options.scope ?? ""));
    if (selected.length === 0) {
      return {
        ok: false,
        error: defineError("E_USAGE", `no workspace matches "${options.scope}"`, {
          hint: `available packages: ${packages.map((pkg) => pkg.relative).join(", ")}.`,
        }),
      };
    }
  }

  const requestedScript = options.runScript ?? config.run.script;
  if (
    requestedScript !== undefined &&
    rootSnapshot.manifest.scripts[requestedScript] === undefined
  ) {
    const available = Object.keys(rootSnapshot.manifest.scripts).sort();
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

  const targets: TargetResult[] = [];

  // The root's walk skips the packages: each one is scanned as its own target,
  // and descending into them from the root spent the file budget on files that
  // were about to be read a second time.
  const rootScan = await scanOne(
    dir,
    ".",
    "root",
    fs,
    runtime,
    options.configPath,
    false,
    config,
    packages.map((pkg) => `${pkg.relative}/`),
  );
  if (!rootScan.ok) {
    return { ok: false, error: rootScan.error };
  }
  if (options.scope === undefined && includeRoot) {
    targets.push(rootScan.value);
  }

  for (const pkg of selected) {
    const scanned = await scanOne(
      join(dir, pkg.relative),
      pkg.relative,
      "workspace",
      fs,
      runtime,
      undefined,
      true,
      config,
    );
    if (!scanned.ok) {
      return { ok: false, error: scanned.error };
    }
    targets.push(scanned.value);
  }

  let collected: readonly Finding[] = targets.flatMap((target) => target.findings);
  let baselineSummary: ScanReport["baseline"];

  if (options.baselinePath !== undefined) {
    const outcome = await fs.readTextFile(options.baselinePath);
    if (outcome.kind === "missing") {
      return {
        ok: false,
        error: defineError("E_IO", `no baseline file at ${options.baselinePath}`, {
          hint: "create one with `bunready <path> --write-baseline <file>`.",
        }),
      };
    }
    if (outcome.kind === "error") {
      return { ok: false, error: outcome.error };
    }
    const parsed = parseBaseline(outcome.text, options.baselinePath);
    if (!parsed.ok) {
      return { ok: false, error: parsed.error };
    }
    const applied = applyBaseline(collected, parsed.value, options.baselinePath);
    collected = applied.findings;
    baselineSummary = applied.summary;
  }

  let executedFindings: readonly Finding[] = [];
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
      rootSnapshot.manifest,
      options.runEnvironment ?? systemRunEnvironment(),
      runOptions,
    );
    if (!executed.ok) {
      return { ok: false, error: executed.error };
    }
    const outcome = executed.value;
    executedFindings = runFindings(outcome, runOptions).map((finding) => ({
      ...finding,
      path: dir.replace(/\\/g, "/"),
    }));
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
    [...collected, ...executedFindings].filter(
      (finding) =>
        !ignored.has(finding.id) &&
        (finding.package === undefined || !ignoredPackages.has(finding.package)),
    ),
  );
  const counts = countBySeverity(findings.map((finding) => finding.severity));

  // Per-target verdicts are computed from the findings that survived config
  // filtering, so a package can never say "blocked" while the overall report
  // says "ready" because the blocker was ignored.
  const scannedTargets: readonly ScannedTarget[] =
    targets.length > 1
      ? targets.map((target) => {
          const normalized = target.dir.replace(/\\/g, "/");
          const own = findings.filter((finding) => finding.path === normalized);
          return {
            path: target.dir.replace(/\\/g, "/"),
            relative: target.relative,
            kind: target.kind,
            name: target.name,
            verdict: verdictFor(own),
            counts: countBySeverity(own.map((finding) => finding.severity)),
          };
        })
      : [];

  const builtinNames = new Set(targets.flatMap((target) => target.builtinNames));

  return {
    ok: true,
    value: {
      schemaVersion: SCHEMA_VERSION,
      failOn: config.failOn,
      tool: TOOL_NAME,
      version: TOOL_VERSION,
      target: dir.replace(/\\/g, "/"),
      verdict: verdictFor(findings),
      counts,
      findings,
      stats: {
        directDependencies: targets.reduce(
          (total, target) => total + Object.keys(target.snapshot.manifest.dependencies).length,
          0,
        ),
        devDependencies: targets.reduce(
          (total, target) => total + Object.keys(target.snapshot.manifest.devDependencies).length,
          0,
        ),
        lockedPackages: targets.reduce(
          (total, target) => total + (target.snapshot.lockfiles[0]?.parsed.packages.length ?? 0),
          0,
        ),
        duplicateVersions: 0,
        lockfiles: rootSnapshot.lockfiles.map((entry) => entry.path),
        sourceFiles: targets.reduce((total, target) => total + target.sourceFiles, 0),
        nodeBuiltins: builtinNames.size,
        builtinNames: [...builtinNames].sort((a, b) => a.localeCompare(b)),
      },
      ...(scannedTargets.length > 0 ? { targets: scannedTargets } : {}),
      ...(runSummary === undefined ? {} : { run: runSummary }),
      ...(baselineSummary === undefined ? {} : { baseline: baselineSummary }),
    },
  };
}
