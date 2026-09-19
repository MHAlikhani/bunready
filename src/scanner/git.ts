import { join } from "node:path";
import { defineError, err, type Result } from "../core/errors";
import type { FileSystem } from "../core/fs";
import { findWorkspacePackages, type WorkspacePackage } from "./workspaces";

/**
 * `--changed-only`: which files changed, and which workspace packages own them.
 *
 * Everything goes through one injected command runner, so tests drive the git
 * layer with a script of canned responses and no repository on disk. The only
 * git operations used are `rev-parse` and a local `diff --name-only`: no
 * network, no worktree mutation, nothing executed from the target.
 */

/** Compared against `HEAD` when `--since` is omitted. */
export const DEFAULT_SINCE = "HEAD~1";

/** Exit status and captured output of one git command. */
export interface GitCommandResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** How git is invoked; injected so tests need no git binary. */
export interface GitEnvironment {
  readonly runGit: (args: readonly string[]) => Promise<GitCommandResult>;
}

/** The GitEnvironment that shells out to the local git. */
export function systemGitEnvironment(): GitEnvironment {
  return {
    runGit: async (args) => {
      const child = Bun.spawn(["git", ...args], {
        stdout: "pipe",
        stderr: "pipe",
        env: { ...Bun.env, CI: "1" },
      });
      const [stdout, stderr, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      return { code: code === null ? null : Number(code), stdout, stderr };
    },
  };
}

/** The git repository that owns `dir`, as an absolute forward-slash path. */
export async function gitRoot(dir: string, env: GitEnvironment): Promise<string | undefined> {
  const result = await env.runGit(["-C", dir, "rev-parse", "--show-toplevel"]);
  const root = result.code === 0 ? result.stdout.trim().replace(/\\/g, "/") : "";
  return root === "" ? undefined : root;
}

/** One line of `git diff --name-only`, normalised to forward slashes. */
function parseChangedFiles(stdout: string): string[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\\/g, "/"))
    .filter((line) => line !== "");
}

/** What changed and where it lives, relative to the repository root. */
export interface ChangedFiles {
  /** The ref the tree was compared against, as given. */
  readonly since: string;
  /** Changed paths relative to the repository root; untracked files included. */
  readonly files: readonly string[];
}

/**
 * The files changed between `since` and the working tree.
 *
 * `HEAD` is compared against `since` first; the working tree is then diffed
 * against `HEAD` so uncommitted work is picked up too. Both diffs are local.
 */
export async function changedFiles(
  root: string,
  since: string,
  env: GitEnvironment,
): Promise<Result<ChangedFiles>> {
  const committed = await env.runGit(["-C", root, "diff", "--name-only", since]);
  if (committed.code !== 0) {
    const detail = committed.stderr.trim().split(/\r?\n/)[0] ?? "";
    return err(
      defineError(
        "E_USAGE",
        `git cannot compare against "${since}"${detail === "" ? "" : `: ${detail}`}`,
        {
          hint: `check that "${since}" names a commit or ref in this repository (git rev-parse ${since}).`,
        },
      ),
    );
  }

  const working = await env.runGit(["-C", root, "diff", "--name-only", "HEAD"]);
  if (working.code !== 0) {
    return err(
      defineError("E_IO", `git cannot read the working tree of ${root}`, {
        hint: "this should not happen on a healthy clone; run git status to see what git says.",
      }),
    );
  }

  const files = [
    ...new Set([...parseChangedFiles(committed.stdout), ...parseChangedFiles(working.stdout)]),
  ].sort((a, b) => a.localeCompare(b));
  return { ok: true, value: { since, files } };
}

/** Which workspace packages a set of changed files belongs to. */
export interface ChangedMapping {
  /** Packages with at least one changed file, sorted by relative path. */
  readonly packages: readonly WorkspacePackage[];
  /** True when a changed file lives outside every workspace package. */
  readonly rootChanged: boolean;
}

/**
 * Maps changed files onto workspace packages.
 *
 * A file belongs to the package whose directory is the longest matching prefix;
 * anything outside every package marks the root as changed, because root files
 * (the manifest, the lockfile, CI) can affect the whole repository.
 */
export async function mapChangedFiles(
  root: string,
  files: readonly string[],
  patterns: readonly string[],
  fs: FileSystem,
): Promise<ChangedMapping> {
  const packages = patterns.length > 0 ? await findWorkspacePackages(root, patterns, fs) : [];
  const owners = new Map<string, WorkspacePackage>();

  for (const file of files) {
    for (const pkg of packages) {
      if (file.startsWith(`${pkg.relative}/`)) {
        owners.set(pkg.relative, pkg);
        break;
      }
    }
  }

  return {
    packages: [...owners.values()].sort((a, b) => a.relative.localeCompare(b.relative)),
    rootChanged: files.some((file) => !packages.some((pkg) => file.startsWith(`${pkg.relative}/`))),
  };
}

/** Joins a root and a relative path without leaking OS separators. */
export function rootRelative(root: string, relative: string): string {
  return join(root, relative).replace(/\\/g, "/");
}
