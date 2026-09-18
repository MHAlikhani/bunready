/**
 * Programmatic entry point.
 *
 * bunready is a CLI first. This module exists so the same checks can be driven
 * from a script or a test without shelling out to a process, and so the package
 * has a real entry point instead of only a `bin` - npm cannot resolve a package
 * that declares neither `main` nor `exports`.
 *
 * Nothing here is re-exported by accident; if a name is in this file, it is part
 * of the package's public surface.
 */

export { type CliOptions, parseArgs } from "./cli/args";
export { run } from "./cli/run";
export { createTheme, type Theme } from "./cli/theme";
export {
  applyBaseline,
  type Baseline,
  type BaselineSummary,
  fingerprint,
  parseBaseline,
  serializeBaseline,
} from "./config/baseline";
export {
  type BunreadyConfig,
  CONFIG_FILENAME,
  DEFAULT_CONFIG,
  parseConfig,
  type RunConfig,
} from "./config/config";
export {
  type BunreadyError,
  defineError,
  type ErrorCode,
  err,
  formatError,
  isErr,
  isOk,
  ok,
  type Result,
} from "./core/errors";
export { type DirectoryEntry, type FileSystem, nodeFileSystem, type ReadOutcome } from "./core/fs";
export { TOOL_NAME, TOOL_VERSION } from "./core/version";
export { renderHumanReport } from "./report/human";
export { renderJsonReport } from "./report/json";
export { renderMarkdownReport } from "./report/markdown";
export { renderSarifReport } from "./report/sarif";
export {
  type Finding,
  type RunSummary,
  SCHEMA_VERSION,
  type ScannedTarget,
  type ScanReport,
  type ScanStats,
  sortFindings,
  type Verdict,
  verdictFor,
} from "./report/types";
export { installFindings } from "./rules/install";
export { runFindings } from "./rules/run";
export { runtimeFindings } from "./rules/runtime";
export {
  type BuiltinUsage,
  collectNodeBuiltins,
  readRuntimeDataset,
} from "./rules/runtime/builtins";
export {
  countBySeverity,
  exitCodeForFindings,
  exitCodeForSeverities,
  SEVERITIES,
  type Severity,
} from "./rules/severity";
export {
  executeProject,
  firstFailure,
  type RunEnvironment,
  type RunOptions,
  type RunOutcome,
  systemRunEnvironment,
} from "./scanner/execute";
export {
  type ChangedFiles,
  type ChangedMapping,
  changedFiles,
  DEFAULT_SINCE,
  type GitCommandResult,
  type GitEnvironment,
  gitRoot,
  mapChangedFiles,
  systemGitEnvironment,
} from "./scanner/git";
export { buildGraph, type DependencyGraph, knownPackageNames } from "./scanner/graph";
export {
  LOCKFILE_FILENAMES,
  type LockedPackage,
  type ParsedLockfile,
  parseLockfile,
} from "./scanner/lockfile";
export { type Manifest, parseManifest } from "./scanner/manifest";
export { detectRuntime, type ScanOptions, scanTarget } from "./scanner/scan";
export { classifySpecifier, extractImports, type SourceScan, scanSources } from "./scanner/sources";
export {
  findWorkspacePackages,
  type WorkspacePackage,
  workspacePatterns,
} from "./scanner/workspaces";
