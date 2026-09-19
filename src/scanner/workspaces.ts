import { join } from "node:path";
import type { FileSystem } from "../core/fs";
import type { Manifest } from "./manifest";

/**
 * Workspace discovery.
 *
 * A monorepo is detected from `package.json` `workspaces` (array or `packages`)
 * or from `pnpm-workspace.yaml`. Globs are expanded with a deliberately small
 * matcher: a literal path, one `*` level, or `**` to a bounded depth. Anything
 * more exotic is reported as "nothing matched" rather than guessed at, and
 * `node_modules` and build output are never walked.
 */
export const WORKSPACE_EXCLUDES = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  "out",
  ".next",
] as const;

const MAX_DEPTH = 3;

export interface WorkspacePackage {
  /** Directory relative to the workspace root, using forward slashes. */
  readonly relative: string;
}

export function workspacePatterns(manifest: Manifest, pnpmWorkspace: string | undefined): string[] {
  if (manifest.workspaces.length > 0) {
    return [...manifest.workspaces]
      .map((pattern) => pattern.trim())
      .filter((pattern) => pattern !== "");
  }
  return pnpmWorkspace === undefined ? [] : patternsFromPnpmWorkspace(pnpmWorkspace);
}

/** The `packages:` list of a pnpm-workspace.yaml. */
export function patternsFromPnpmWorkspace(text: string): string[] {
  const patterns: string[] = [];
  let inPackages = false;

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }
    if (!/^\s/.test(line)) {
      inPackages = /^packages:/.test(line);
      continue;
    }
    if (!inPackages) {
      continue;
    }
    const entry = /^-+ *(.*)$/.exec(trimmed);
    const value = entry?.[1]?.trim();
    if (value !== undefined && value !== "") {
      patterns.push(value.replace(/^['"]|['"]$/g, ""));
    }
  }

  return patterns;
}

function isExcluded(name: string): boolean {
  return (WORKSPACE_EXCLUDES as readonly string[]).includes(name);
}

async function hasManifest(dir: string, fs: FileSystem): Promise<boolean> {
  return (await fs.readTextFile(join(dir, "package.json"))).kind === "text";
}

async function expandGlob(root: string, segments: string[], fs: FileSystem): Promise<string[]> {
  let prefixes: string[] = [""];

  const join = (prefix: string, name: string): string =>
    prefix === "" ? name : `${prefix}/${name}`;

  for (const segment of segments) {
    const next: string[] = [];

    if (segment === "**") {
      for (const prefix of prefixes) {
        next.push(prefix === "" ? "." : prefix);
        let level = [prefix];
        for (let depth = 0; depth < MAX_DEPTH && level.length > 0; depth += 1) {
          const deeper: string[] = [];
          for (const current of level) {
            for (const entry of await fs.listDirectory(join(root, current))) {
              if (!entry.isDirectory || isExcluded(entry.name)) {
                continue;
              }
              const child = join(current, entry.name);
              deeper.push(child);
              next.push(child);
            }
          }
          level = deeper;
        }
      }
    } else if (segment === "*") {
      for (const prefix of prefixes) {
        for (const entry of await fs.listDirectory(join(root, prefix))) {
          if (!entry.isDirectory || isExcluded(entry.name)) {
            continue;
          }
          next.push(join(prefix, entry.name));
        }
      }
    } else {
      for (const prefix of prefixes) {
        next.push(join(prefix, segment));
      }
    }

    prefixes = next;
    if (prefixes.length === 0) {
      break;
    }
  }

  return prefixes.filter((prefix) => prefix !== "" && prefix !== ".");
}

/** Linear replacement for `/+$`, which backtracks on a run of slashes. */
function stripTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === "/") {
    end -= 1;
  }
  return value.slice(0, end);
}

export async function findWorkspacePackages(
  root: string,
  patterns: readonly string[],
  fs: FileSystem,
): Promise<WorkspacePackage[]> {
  const found = new Map<string, WorkspacePackage>();

  for (const pattern of patterns) {
    const cleaned = stripTrailingSlashes(pattern.replace(/\\/g, "/")).replace(/^\.\//, "");
    if (cleaned === "" || cleaned === ".") {
      continue;
    }
    const segments = cleaned.split("/").filter((segment) => segment !== "");
    const candidates = segments.some((segment) => segment.includes("*"))
      ? await expandGlob(root, segments, fs)
      : [cleaned];

    for (const candidate of candidates) {
      const relative = candidate.replace(/\\/g, "/");
      if (relative === "" || found.has(relative)) {
        continue;
      }
      if (!(await hasManifest(join(root, relative), fs))) {
        continue;
      }
      found.set(relative, { relative });
    }
  }

  return [...found.values()].sort((a, b) => a.relative.localeCompare(b.relative));
}

export const PNPM_WORKSPACE_FILENAME = "pnpm-workspace.yaml";

/** Read and parse `pnpm-workspace.yaml`, if it is there. */
export async function readPnpmWorkspace(root: string, fs: FileSystem): Promise<string | undefined> {
  const outcome = await fs.readTextFile(join(root, PNPM_WORKSPACE_FILENAME));
  return outcome.kind === "text" ? outcome.text : undefined;
}

/** Keep only the packages matching a scope string, by relative path or name. */
export function scopeMatches(relative: string, scope: string): boolean {
  const needle = stripTrailingSlashes(scope.replace(/\\/g, "/")).replace(/^\.\//, "");
  return relative === needle || relative.includes(needle);
}
