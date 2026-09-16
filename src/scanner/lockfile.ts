import { defineError, type Result } from "../core/errors";

/**
 * Lockfile parsing.
 *
 * Four formats, hand-written, no dependencies. Each parser extracts only what
 * bunready actually reasons about: locked package names, versions, and any
 * install-script evidence the lockfile itself records. Nothing is inferred, so a
 * format that does not record install scripts contributes no install-script
 * evidence - which is exactly why the node_modules probe exists.
 *
 * `installScript` is true only when the lockfile says so:
 *   - npm v2/v3 records `hasInstallScript`
 *   - pnpm records `requiresBuild`
 *   - bun.lock and yarn.lock record nothing (verified against a real bun.lock)
 */

export const LOCKFILE_KINDS = ["bun", "npm", "yarn", "pnpm"] as const;

/** The lockfile formats the scanner understands. */
export type LockfileKind = (typeof LOCKFILE_KINDS)[number];

/** Lockfile filenames, in the order they are preferred. */
export const LOCKFILE_FILENAMES: Readonly<Record<LockfileKind, string>> = {
  bun: "bun.lock",
  npm: "package-lock.json",
  yarn: "yarn.lock",
  pnpm: "pnpm-lock.yaml",
};

/** One package as recorded by a lockfile. */
export interface LockedPackage {
  readonly name: string;
  readonly version: string;
  /** true only when the lockfile marks the package as a development dependency. */
  readonly dev: boolean;
  readonly optional: boolean;
  /** true only when the lockfile records that this package runs an install script. */
  readonly installScript: boolean;
}

/** A parsed lockfile: its format, packages and direct dependencies. */
export interface ParsedLockfile {
  readonly kind: LockfileKind;
  readonly lockfileVersion: string | undefined;
  readonly packages: readonly LockedPackage[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Remove `//` and slash-star comments without touching string contents. */
export function stripJsonComments(text: string): string {
  let out = "";
  let index = 0;
  let inString = false;

  while (index < text.length) {
    const char = text[index] ?? "";

    if (inString) {
      out += char;
      if (char === "\\") {
        out += text[index + 1] ?? "";
        index += 2;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      index += 1;
      continue;
    }

    if (char === '"') {
      inString = true;
      out += char;
      index += 1;
      continue;
    }

    if (char === "/" && text[index + 1] === "/") {
      while (index < text.length && text[index] !== "\n") {
        index += 1;
      }
      continue;
    }

    if (char === "/" && text[index + 1] === "*") {
      index += 2;
      while (index < text.length && !(text[index] === "*" && text[index + 1] === "/")) {
        index += 1;
      }
      index += 2;
      continue;
    }

    out += char;
    index += 1;
  }

  return out;
}

/** Drop trailing commas, which Bun's text lockfile contains. */
export function stripTrailingCommas(text: string): string {
  let out = "";
  let inString = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] ?? "";

    if (inString) {
      out += char;
      if (char === "\\") {
        out += text[index + 1] ?? "";
        index += 1;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }

    if (char === ",") {
      let lookahead = index + 1;
      while (lookahead < text.length && /\s/.test(text[lookahead] ?? "")) {
        lookahead += 1;
      }
      const next = text[lookahead];
      if (next === "}" || next === "]") {
        continue;
      }
    }

    out += char;
  }

  return out;
}

function parseJsonc(text: string): unknown {
  return JSON.parse(stripTrailingCommas(stripJsonComments(text)));
}

function parseFailure(
  kind: LockfileKind,
  path: string,
  detail: string,
  hint: string,
): Result<ParsedLockfile> {
  return {
    ok: false,
    error: defineError("E_PARSE", `${path} (${kind}) could not be parsed: ${detail}`, { hint }),
  };
}

function mergeDevFlags(target: Map<string, LockedPackage>, pkg: LockedPackage): void {
  const key = `${pkg.name}@${pkg.version}`;
  const existing = target.get(key);
  if (existing === undefined) {
    target.set(key, pkg);
    return;
  }
  target.set(key, {
    ...existing,
    dev: existing.dev && pkg.dev,
    optional: existing.optional && pkg.optional,
    installScript: existing.installScript || pkg.installScript,
  });
}

function sortPackages(packages: Map<string, LockedPackage>): LockedPackage[] {
  return [...packages.values()].sort((a, b) =>
    a.name === b.name ? a.version.localeCompare(b.version) : a.name.localeCompare(b.name),
  );
}

/** `@scope/pkg@1.2.3` or `pkg@1.2.3`, optionally aliased as `pkg@npm:real@1.2.3`. */
function versionFromResolution(name: string, resolution: string): string | undefined {
  const prefix = `${name}@`;
  let rest = resolution.startsWith(prefix) ? resolution.slice(prefix.length) : resolution;
  if (rest.startsWith("npm:")) {
    rest = rest.slice(4);
  }
  const match = /(?:^|@)(\d[^@]*)$/.exec(rest);
  if (match?.[1] !== undefined) {
    return match[1];
  }
  return /^\d/.test(rest) ? rest : undefined;
}

function parseBunLock(text: string, path: string): Result<ParsedLockfile> {
  let raw: unknown;
  try {
    raw = parseJsonc(text);
  } catch (error) {
    return parseFailure(
      "bun",
      path,
      error instanceof Error ? error.message : "invalid JSON",
      "regenerate the lockfile with `bun install`.",
    );
  }
  if (!isRecord(raw)) {
    return parseFailure(
      "bun",
      path,
      "top level is not an object",
      "regenerate the lockfile with `bun install`.",
    );
  }

  const packagesRecord = raw.packages;
  if (packagesRecord !== undefined && !isRecord(packagesRecord)) {
    return parseFailure(
      "bun",
      path,
      "`packages` is not an object",
      "regenerate the lockfile with `bun install`.",
    );
  }

  const collected = new Map<string, LockedPackage>();
  for (const [name, entry] of Object.entries(isRecord(packagesRecord) ? packagesRecord : {})) {
    if (!Array.isArray(entry)) {
      continue;
    }
    const resolution = asString(entry[0]) ?? "";
    const metadata = isRecord(entry[2]) ? entry[2] : {};
    const version = versionFromResolution(name, resolution);
    if (version === undefined) {
      continue;
    }
    mergeDevFlags(collected, {
      name,
      version,
      dev: false,
      optional: metadata.optional === true,
      installScript: metadata.hasInstallScript === true,
    });
  }

  const lockfileVersion =
    raw.lockfileVersion === undefined ? undefined : String(raw.lockfileVersion);
  return { ok: true, value: { kind: "bun", lockfileVersion, packages: sortPackages(collected) } };
}

function packageNameFromPath(path: string): string | undefined {
  const marker = "node_modules/";
  const index = path.lastIndexOf(marker);
  if (index === -1) {
    return undefined;
  }
  const tail = path.slice(index + marker.length);
  if (tail === "" || tail.includes("/node_modules/")) {
    return undefined;
  }
  if (tail.startsWith("@")) {
    const segments = tail.split("/");
    const scope = segments[0];
    const name = segments[1];
    if (scope === undefined || name === undefined || name === "") {
      return undefined;
    }
    return `${scope}/${name}`;
  }
  const first = tail.split("/")[0];
  return first === undefined || first === "" ? undefined : first;
}

function walkLegacyDependencies(
  dependencies: Record<string, unknown>,
  inherited: { dev: boolean; optional: boolean },
  collected: Map<string, LockedPackage>,
): void {
  for (const [name, raw] of Object.entries(dependencies)) {
    if (!isRecord(raw)) {
      continue;
    }
    const version = asString(raw.version);
    if (version !== undefined) {
      mergeDevFlags(collected, {
        name,
        version,
        dev: inherited.dev,
        optional: inherited.optional || raw.optional === true,
        installScript: raw.hasInstallScript === true,
      });
    }
    if (isRecord(raw.dependencies)) {
      walkLegacyDependencies(raw.dependencies, inherited, collected);
    }
  }
}

function parseNpmLock(text: string, path: string): Result<ParsedLockfile> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return parseFailure(
      "npm",
      path,
      error instanceof Error ? error.message : "invalid JSON",
      "regenerate the lockfile with `npm install`.",
    );
  }
  if (!isRecord(raw)) {
    return parseFailure(
      "npm",
      path,
      "top level is not an object",
      "regenerate the lockfile with `npm install`.",
    );
  }

  const collected = new Map<string, LockedPackage>();

  if (isRecord(raw.packages)) {
    for (const [entryPath, entry] of Object.entries(raw.packages)) {
      if (entryPath === "" || !isRecord(entry)) {
        continue;
      }
      const name = packageNameFromPath(entryPath);
      const version = asString(entry.version);
      if (name === undefined || version === undefined) {
        continue;
      }
      mergeDevFlags(collected, {
        name,
        version,
        dev: entry.dev === true,
        optional: entry.optional === true,
        installScript: entry.hasInstallScript === true,
      });
    }
  } else if (isRecord(raw.dependencies)) {
    walkLegacyDependencies(raw.dependencies, { dev: false, optional: false }, collected);
  } else {
    return parseFailure(
      "npm",
      path,
      "neither `packages` nor `dependencies` is present",
      "regenerate the lockfile with `npm install`.",
    );
  }

  const lockfileVersion =
    raw.lockfileVersion === undefined ? undefined : String(raw.lockfileVersion);
  return { ok: true, value: { kind: "npm", lockfileVersion, packages: sortPackages(collected) } };
}

function nameFromYarnPattern(header: string): string | undefined {
  const first = (header.split(",")[0] ?? "").trim().replace(/^"|"$/g, "");
  const aliasIndex = first.indexOf("@npm:");
  const candidate = aliasIndex > 0 ? first.slice(0, aliasIndex) : first;
  const at = candidate.lastIndexOf("@");
  if (at > 0) {
    return candidate.slice(0, at);
  }
  return candidate === "" ? undefined : candidate;
}

/** Yarn berry keeps its metadata version on the line after `__metadata:`. */
function yarnMetadataVersion(lines: readonly string[]): string | undefined {
  const start = lines.findIndex((line) => /^__metadata:/.test(line));
  if (start === -1) {
    return undefined;
  }
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.trim() === "") {
      continue;
    }
    if (!/^\s/.test(line)) {
      return undefined;
    }
    const match = /^\s+version:\s*(\S+)/.exec(line);
    if (match?.[1] !== undefined) {
      return match[1];
    }
  }
  return undefined;
}

function parseYarnLock(text: string, path: string): Result<ParsedLockfile> {
  const lines = text.split(/\r?\n/);
  const berry = lines.some((line) => /^__metadata:/.test(line));
  const collected = new Map<string, LockedPackage>();

  let header: string | undefined;
  let recognisedHeaders = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }

    if (!/^\s/.test(line)) {
      header = trimmed.endsWith(":") && trimmed !== "__metadata:" ? trimmed : undefined;
      if (header !== undefined) {
        recognisedHeaders += 1;
      }
      continue;
    }

    if (header === undefined) {
      continue;
    }

    const versionLine = berry
      ? /^\s{2}version:\s*"?([^"\s]+)"?\s*$/.exec(line)
      : /^\s{2}version\s+"([^"]+)"/.exec(line);
    const version = versionLine?.[1];
    const name = nameFromYarnPattern(header);
    if (version === undefined || name === undefined) {
      continue;
    }
    mergeDevFlags(collected, { name, version, dev: false, optional: false, installScript: false });
  }

  // An empty graph from a non-empty lockfile is a parse failure, not "no
  // dependencies": silently reporting zero packages would turn a broken parse
  // into a clean-looking verdict.
  if (recognisedHeaders === 0) {
    return parseFailure(
      "yarn",
      path,
      "no package blocks were recognised",
      "regenerate the lockfile with the package manager that produced it.",
    );
  }

  return {
    ok: true,
    value: {
      kind: "yarn",
      lockfileVersion: yarnMetadataVersion(lines) ?? (berry ? undefined : "1"),
      packages: sortPackages(collected),
    },
  };
}

/** `foo@1.2.3`, `/@scope/foo@1.2.3`, `foo@1.2.3(react@18.2.0)`, `foo@1.2.3_peer@1`. */
function splitPnpmKey(key: string): { name: string; version: string } | undefined {
  let cleaned = key.startsWith("/") ? key.slice(1) : key;
  const peerSuffix = cleaned.search(/[(_]/);
  if (peerSuffix > 0) {
    cleaned = cleaned.slice(0, peerSuffix);
  }
  const match = /^(.+?)@(\d[^@]*)$/.exec(cleaned);
  if (match?.[1] === undefined || match[2] === undefined) {
    return undefined;
  }
  return { name: match[1], version: match[2] };
}

function parsePnpmLock(text: string, path: string): Result<ParsedLockfile> {
  const lines = text.split(/\r?\n/);
  const collected = new Map<string, LockedPackage>();
  let inPackages = false;
  let current: LockedPackage | undefined;
  let sawPackagesSection = false;

  for (const line of lines) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) {
      continue;
    }

    if (!/^\s/.test(line)) {
      inPackages = /^packages:/.test(line);
      sawPackagesSection = sawPackagesSection || inPackages;
      current = undefined;
      continue;
    }

    if (!inPackages) {
      continue;
    }

    const keyLine = /^ {2}(?:'([^']+)'|"([^"]+)"|([^:]+)):\s*$/.exec(line);
    if (keyLine !== null) {
      const key = keyLine[1] ?? keyLine[2] ?? keyLine[3] ?? "";
      const parsed = splitPnpmKey(key.trim());
      current =
        parsed === undefined
          ? undefined
          : {
              name: parsed.name,
              version: parsed.version,
              dev: false,
              optional: false,
              installScript: false,
            };
      if (current !== undefined) {
        collected.set(`${current.name}@${current.version}`, current);
      }
      continue;
    }

    if (current !== undefined && /requiresBuild:\s*true/.test(line)) {
      collected.set(`${current.name}@${current.version}`, { ...current, installScript: true });
    }
  }

  if (!sawPackagesSection) {
    return parseFailure(
      "pnpm",
      path,
      "no `packages` section found",
      "regenerate the lockfile with `pnpm install`.",
    );
  }

  const versionLine = lines.find((line) => /^lockfileVersion:/.test(line));
  const lockfileVersion = /^lockfileVersion:\s*'?"?([^'"\s]+)/.exec(versionLine ?? "")?.[1];

  return { ok: true, value: { kind: "pnpm", lockfileVersion, packages: sortPackages(collected) } };
}

/** Parses lockfile text into packages, or reports why it could not. */
export function parseLockfile(
  kind: LockfileKind,
  text: string,
  path = LOCKFILE_FILENAMES[kind],
): Result<ParsedLockfile> {
  switch (kind) {
    case "bun":
      return parseBunLock(text, path);
    case "npm":
      return parseNpmLock(text, path);
    case "yarn":
      return parseYarnLock(text, path);
    case "pnpm":
      return parsePnpmLock(text, path);
  }
}
