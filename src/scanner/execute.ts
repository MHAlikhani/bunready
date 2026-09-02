import { cp, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { ok, type Result } from "../core/errors";
import type { Manifest } from "./manifest";

/**
 * `--run`: the only part of bunready that executes the target's code.
 *
 * Safety rules, all enforced here: always a temporary copy and never in place;
 * VCS data, dependencies and build output are not copied; a size cap is checked
 * before copying; every command is timed; the copy is removed even on failure.
 * There is no network sandbox, and the report says so.
 */

export const COPY_EXCLUDES = [
  ".git",
  "node_modules",
  "dist",
  "coverage",
  ".next",
  ".turbo",
  ".cache",
] as const;

export const RUNNABLE_SCRIPTS = ["start", "test"] as const;

export interface ProcessResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  readonly durationMs: number;
}

export interface RunCommandOptions {
  readonly cwd: string;
  readonly timeoutMs: number;
}

export interface CommandRunner {
  readonly run: (command: readonly string[], options: RunCommandOptions) => Promise<ProcessResult>;
}

export interface RunEnvironment {
  readonly runner: CommandRunner;
  readonly makeTempDir: () => Promise<string>;
  readonly copyProject: (from: string, to: string) => Promise<void>;
  readonly removeDir: (path: string) => Promise<void>;
  readonly measureTreeBytes: (path: string) => Promise<number>;
}

export interface RunFailure {
  readonly message: string;
  readonly frames: readonly string[];
}

export interface RunOutcome {
  readonly workDir: string;
  readonly script: string | undefined;
  readonly install: ProcessResult | undefined;
  readonly installFailed: boolean;
  readonly result: ProcessResult | undefined;
  readonly failure: RunFailure | undefined;
  readonly cleanupFailed: boolean;
  readonly measuredBytes: number;
  readonly copyTooLarge: boolean;
}

export interface RunOptions {
  readonly installTimeoutMs: number;
  readonly scriptTimeoutMs: number;
  readonly maxCopyMegabytes: number;
  /** Explicit script name; defaults to the first of start/test that exists. */
  readonly script?: string;
}

export const DEFAULT_RUN_OPTIONS: RunOptions = {
  installTimeoutMs: 180_000,
  scriptTimeoutMs: 120_000,
  maxCopyMegabytes: 250,
};

const STACK_FRAME = /^\s+at\s+\S/;
const ERROR_HINT = /(\berror\b|\bError\b|\bfailed\b|\bFAIL\b|✖|✗|×)/;
const MAX_FRAMES = 5;

/** The message above the first stack frame, plus a few frames. */
export function firstFailure(output: string): RunFailure | undefined {
  const lines = output.split(/\r?\n/).map((line) => line.trimEnd());

  const stackStart = lines.findIndex((line) => STACK_FRAME.test(line));
  if (stackStart !== -1) {
    const frames: string[] = [];
    for (let index = stackStart; index < lines.length && frames.length < MAX_FRAMES; index += 1) {
      const line = lines[index] ?? "";
      if (!STACK_FRAME.test(line)) {
        break;
      }
      frames.push(line.trim());
    }

    for (let index = stackStart - 1; index >= 0; index -= 1) {
      const candidate = (lines[index] ?? "").trim();
      if (candidate !== "") {
        return { message: candidate, frames };
      }
    }
    return { message: frames[0] ?? "process failed", frames };
  }

  const hinted = lines.findIndex((line) => line.trim() !== "" && ERROR_HINT.test(line));
  if (hinted === -1) {
    return undefined;
  }
  return { message: (lines[hinted] ?? "").trim(), frames: [] };
}

export function pickScript(manifest: Manifest, requested?: string): string | undefined {
  if (requested !== undefined) {
    return typeof manifest.scripts[requested] === "string" ? requested : undefined;
  }
  return RUNNABLE_SCRIPTS.find((name) => typeof manifest.scripts[name] === "string");
}

export function isExcludedFromCopy(path: string): boolean {
  return (COPY_EXCLUDES as readonly string[]).includes(basename(path));
}

export function bunCommandRunner(): CommandRunner {
  return {
    run: async (command, options) => {
      const started = Date.now();
      const child = Bun.spawn([...command], {
        cwd: options.cwd,
        stdout: "pipe",
        stderr: "pipe",
        env: { ...Bun.env, CI: "1" },
      });

      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, options.timeoutMs);

      try {
        const [stdout, stderr] = await Promise.all([
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
        ]);
        const code = await child.exited;
        return { code, stdout, stderr, timedOut, durationMs: Date.now() - started };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

async function treeBytes(path: string): Promise<number> {
  let total = 0;
  let entries: { name: string; isDirectory: () => boolean }[];
  try {
    entries = (await readdir(path, { withFileTypes: true })) as unknown as {
      name: string;
      isDirectory: () => boolean;
    }[];
  } catch {
    return 0;
  }

  for (const entry of entries) {
    const name = String(entry.name);
    if (isExcludedFromCopy(name)) {
      continue;
    }
    const child = join(path, name);
    if (entry.isDirectory()) {
      total += await treeBytes(child);
      continue;
    }
    try {
      total += (await stat(child)).size;
    } catch {
      // An unreadable file simply does not contribute.
    }
  }
  return total;
}

export function systemRunEnvironment(): RunEnvironment {
  return {
    runner: bunCommandRunner(),
    makeTempDir: () => mkdtemp(join(tmpdir(), "bunready-run-")),
    copyProject: async (from, to) => {
      await cp(from, to, { recursive: true, filter: (source) => !isExcludedFromCopy(source) });
    },
    removeDir: (path) => rm(path, { recursive: true, force: true }),
    measureTreeBytes: treeBytes,
  };
}

async function perform(
  workDir: string,
  dir: string,
  manifest: Manifest,
  env: RunEnvironment,
  options: RunOptions,
): Promise<Omit<RunOutcome, "workDir" | "cleanupFailed" | "measuredBytes" | "copyTooLarge">> {
  await env.copyProject(dir, workDir);

  const install = await env.runner.run(["bun", "install"], {
    cwd: workDir,
    timeoutMs: options.installTimeoutMs,
  });

  if (install.timedOut || install.code !== 0) {
    return {
      script: undefined,
      install,
      installFailed: true,
      result: undefined,
      failure: firstFailure(`${install.stdout}\n${install.stderr}`),
    };
  }

  const script = pickScript(manifest, options.script);
  if (script === undefined) {
    return {
      script: undefined,
      install,
      installFailed: false,
      result: undefined,
      failure: undefined,
    };
  }

  const result = await env.runner.run(["bun", "run", script], {
    cwd: workDir,
    timeoutMs: options.scriptTimeoutMs,
  });

  return {
    script,
    install,
    installFailed: false,
    result,
    failure: firstFailure(`${result.stdout}\n${result.stderr}`),
  };
}

export async function executeProject(
  dir: string,
  manifest: Manifest,
  env: RunEnvironment = systemRunEnvironment(),
  options: RunOptions = DEFAULT_RUN_OPTIONS,
): Promise<Result<RunOutcome>> {
  const measuredBytes = await env.measureTreeBytes(dir);
  const limitBytes = options.maxCopyMegabytes * 1024 * 1024;

  if (measuredBytes > limitBytes) {
    return ok({
      workDir: "",
      script: undefined,
      install: undefined,
      installFailed: false,
      result: undefined,
      failure: undefined,
      cleanupFailed: false,
      measuredBytes,
      copyTooLarge: true,
    });
  }

  const workDir = await env.makeTempDir();

  let partial: Awaited<ReturnType<typeof perform>>;
  try {
    partial = await perform(workDir, dir, manifest, env, options);
  } catch (error) {
    await env.removeDir(workDir).catch(() => undefined);
    return {
      ok: false,
      error: {
        code: "E_IO",
        message: `could not prepare the temporary copy: ${error instanceof Error ? error.message : String(error)}`,
        hint: "check that the target directory is readable and that the temporary directory is writable.",
      },
    };
  }

  let cleanupFailed = false;
  try {
    await env.removeDir(workDir);
  } catch {
    cleanupFailed = true;
  }

  return ok({ ...partial, workDir, cleanupFailed, measuredBytes, copyTooLarge: false });
}
