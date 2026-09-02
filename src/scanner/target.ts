import { isAbsolute, join } from "node:path";
import {
  type BunreadyConfig,
  CONFIG_FILENAME,
  DEFAULT_CONFIG,
  parseConfig,
} from "../config/config";
import { defineError, type Result } from "../core/errors";
import { type FileSystem, nodeFileSystem } from "../core/fs";
import {
  LOCKFILE_FILENAMES,
  LOCKFILE_KINDS,
  type LockfileKind,
  type ParsedLockfile,
  parseLockfile,
} from "./lockfile";
import { type Manifest, parseManifest } from "./manifest";

/** What a dependency's own installed `package.json` says, when it is present. */
export interface PackageEvidence {
  readonly name: string;
  readonly path: string;
  readonly gypfile: boolean;
  readonly binaryField: boolean;
  readonly installScripts: readonly string[];
}

export interface LoadedLockfile {
  readonly kind: LockfileKind;
  readonly path: string;
  readonly parsed: ParsedLockfile;
}

export interface UnparsedLockfile {
  readonly kind: LockfileKind;
  readonly path: string;
  readonly message: string;
}

export interface TargetSnapshot {
  readonly dir: string;
  readonly manifestPath: string;
  readonly manifest: Manifest;
  /** Lockfiles present and parseable, in detection priority order. */
  readonly lockfiles: readonly LoadedLockfile[];
  /** Lockfiles present but not parseable. Reported, never silently ignored. */
  readonly unparsedLockfiles: readonly UnparsedLockfile[];
  /** Path to a legacy binary `bun.lockb`, whose contents bunready will not guess at. */
  readonly binaryBunLock: string | undefined;
  readonly packageEvidence: readonly PackageEvidence[];
  readonly config: BunreadyConfig;
  readonly configPath: string | undefined;
}

const INSTALL_SCRIPT_NAMES = ["preinstall", "install", "postinstall"] as const;

/** Findings print paths with forward slashes so output is identical on every OS. */
function displayPath(path: string): string {
  return path.replace(/\\/g, "/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function directDependencyNames(manifest: Manifest): string[] {
  return [
    ...new Set([
      ...Object.keys(manifest.dependencies),
      ...Object.keys(manifest.devDependencies),
      ...Object.keys(manifest.optionalDependencies),
    ]),
  ].sort();
}

/**
 * Probe a dependency's installed package.json.
 *
 * This is the only place bunready learns about install scripts of transitive
 * packages without a network call: if the package is installed, its own
 * manifest is hard evidence, and if it is not installed there is simply no
 * evidence and no finding.
 */
async function probeInstalledPackage(
  dir: string,
  name: string,
  fs: FileSystem,
): Promise<PackageEvidence | undefined> {
  const path = displayPath(join(dir, "node_modules", name, "package.json"));
  const outcome = await fs.readTextFile(path);
  if (outcome.kind !== "text") {
    return undefined;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(outcome.text);
  } catch {
    return undefined;
  }
  if (!isRecord(raw)) {
    return undefined;
  }

  const scripts = isRecord(raw.scripts) ? raw.scripts : {};
  const installScripts = INSTALL_SCRIPT_NAMES.filter(
    (scriptName) => typeof scripts[scriptName] === "string",
  );

  return {
    name,
    path,
    gypfile: raw.gypfile === true,
    binaryField: isRecord(raw.binary),
    installScripts,
  };
}

export async function readTarget(
  dir: string,
  fs: FileSystem = nodeFileSystem(),
  configPath?: string,
): Promise<Result<TargetSnapshot>> {
  const manifestPath = displayPath(join(dir, "package.json"));
  const manifestOutcome = await fs.readTextFile(manifestPath);

  if (manifestOutcome.kind === "missing") {
    return {
      ok: false,
      error: defineError("E_IO", `no package.json found in ${dir}`, {
        hint: "point bunready at the root of a Node or TypeScript repository.",
      }),
    };
  }
  if (manifestOutcome.kind === "error") {
    return { ok: false, error: manifestOutcome.error };
  }

  const parsedManifest = parseManifest(manifestOutcome.text, manifestPath);
  if (!parsedManifest.ok) {
    return { ok: false, error: parsedManifest.error };
  }
  const manifest = parsedManifest.value;

  const lockfiles: LoadedLockfile[] = [];
  const unparsedLockfiles: UnparsedLockfile[] = [];

  for (const kind of LOCKFILE_KINDS) {
    const path = displayPath(join(dir, LOCKFILE_FILENAMES[kind]));
    const outcome = await fs.readTextFile(path);
    if (outcome.kind === "missing") {
      continue;
    }
    if (outcome.kind === "error") {
      unparsedLockfiles.push({ kind, path, message: outcome.error.message });
      continue;
    }
    const parsed = parseLockfile(kind, outcome.text, path);
    if (parsed.ok) {
      lockfiles.push({ kind, path, parsed: parsed.value });
    } else {
      unparsedLockfiles.push({ kind, path, message: parsed.error.message });
    }
  }

  const binaryBunLockPath = displayPath(join(dir, "bun.lockb"));
  const binaryBunLock = (await fs.pathExists(binaryBunLockPath)) ? binaryBunLockPath : undefined;

  const wantedConfigPath =
    configPath === undefined
      ? undefined
      : isAbsolute(configPath)
        ? configPath
        : join(dir, configPath);
  const resolvedConfigPath = displayPath(wantedConfigPath ?? join(dir, CONFIG_FILENAME));
  const configOutcome = await fs.readTextFile(resolvedConfigPath);

  let config = DEFAULT_CONFIG;
  let loadedConfigPath: string | undefined;

  if (configOutcome.kind === "text") {
    const parsed = parseConfig(configOutcome.text, resolvedConfigPath);
    if (!parsed.ok) {
      return { ok: false, error: parsed.error };
    }
    config = parsed.value;
    loadedConfigPath = resolvedConfigPath;
  } else if (configOutcome.kind === "error") {
    return { ok: false, error: configOutcome.error };
  } else if (wantedConfigPath !== undefined) {
    return {
      ok: false,
      error: defineError("E_IO", `no configuration file at ${resolvedConfigPath}`, {
        hint: `--config must point at a ${CONFIG_FILENAME} file.`,
      }),
    };
  }

  const packageEvidence: PackageEvidence[] = [];
  for (const name of directDependencyNames(manifest)) {
    const evidence = await probeInstalledPackage(dir, name, fs);
    if (evidence !== undefined) {
      packageEvidence.push(evidence);
    }
  }

  return {
    ok: true,
    value: {
      dir,
      manifestPath,
      manifest,
      lockfiles,
      unparsedLockfiles,
      binaryBunLock,
      packageEvidence,
      config,
      configPath: loadedConfigPath,
    },
  };
}
