import { describe, expect, test } from "bun:test";
import { ok, type Result } from "../src/core/errors";
import { runFindings } from "../src/rules/run";
import {
  type CommandRunner,
  executeProject,
  firstFailure,
  isExcludedFromCopy,
  type ProcessResult,
  pickScript,
  type RunEnvironment,
  type RunOptions,
} from "../src/scanner/execute";

function processResult(partial: Partial<ProcessResult> = {}): ProcessResult {
  return { code: 0, stdout: "", stderr: "", timedOut: false, durationMs: 5, ...partial };
}

interface Harness {
  readonly env: RunEnvironment;
  readonly calls: { command: readonly string[]; cwd: string }[];
  readonly removed: string[];
  readonly copied: string[];
}

function harness(
  scriptResult: ProcessResult,
  installResult: ProcessResult = processResult(),
  options: { copyThrows?: boolean; removeThrows?: boolean; measuredBytes?: number } = {},
): Harness {
  const calls: { command: readonly string[]; cwd: string }[] = [];
  const removed: string[] = [];
  const copied: string[] = [];

  const runner: CommandRunner = {
    run: async (command, runOptions) => {
      calls.push({ command, cwd: runOptions.cwd });
      return command[1] === "install" ? installResult : scriptResult;
    },
  };

  return {
    calls,
    removed,
    copied,
    env: {
      runner,
      makeTempDir: async () => "/tmp/bunready-run-abc",
      copyProject: async (from, to) => {
        if (options.copyThrows === true) {
          throw new Error("disk full");
        }
        copied.push(`${from}->${to}`);
      },
      removeDir: async (path) => {
        if (options.removeThrows === true) {
          throw new Error("locked");
        }
        removed.push(path);
      },
      measureTreeBytes: async () => options.measuredBytes ?? 0,
    },
  };
}

const MANIFEST_WITH_TEST = {
  name: "app",
  version: "1.0.0",
  scripts: { test: "bun test" },
  dependencies: {},
  devDependencies: {},
  optionalDependencies: {},
  peerDependencies: {},
  engines: {},
  trustedDependencies: [],
};

describe("firstFailure", () => {
  test("reads the message above the first stack frame", () => {
    const output = [
      "bun test v1.4.2",
      "error: Cannot find module 'left-pad' from '/app/src/index.ts'",
      "    at /app/src/index.ts:1:20",
      "    at Bun.Module._load (/app/bun.js)",
      "",
      "1 test failed",
    ].join("\n");

    const failure = firstFailure(output);
    expect(failure?.message).toBe("error: Cannot find module 'left-pad' from '/app/src/index.ts'");
    expect(failure?.frames).toHaveLength(2);
    expect(failure?.frames[0]).toContain("at /app/src/index.ts:1:20");
  });

  test("falls back to the first error-ish line when there is no stack", () => {
    const failure = firstFailure("resolving: ok\nerror: lockfile had changes\nsomething else");
    expect(failure?.message).toBe("error: lockfile had changes");
    expect(failure?.frames).toEqual([]);
  });

  test("returns undefined when nothing looks like a failure", () => {
    expect(firstFailure("all good\nnothing to see")).toBeUndefined();
    expect(firstFailure("")).toBeUndefined();
  });
});

describe("pickScript", () => {
  test("prefers start, then test", () => {
    expect(
      pickScript({
        ...MANIFEST_WITH_TEST,
        scripts: { start: "bun run server.ts", test: "bun test" },
      }),
    ).toBe("start");
    expect(pickScript(MANIFEST_WITH_TEST)).toBe("test");
    expect(pickScript({ ...MANIFEST_WITH_TEST, scripts: {} })).toBeUndefined();
  });
});

describe("isExcludedFromCopy", () => {
  test("excludes vcs data, dependencies and build output", () => {
    expect(isExcludedFromCopy("/work/app/.git")).toBe(true);
    expect(isExcludedFromCopy("/work/app/node_modules")).toBe(true);
    expect(isExcludedFromCopy("/work/app/dist")).toBe(true);
    expect(isExcludedFromCopy("/work/app/src")).toBe(false);
  });
});

describe("executeProject", () => {
  const options: RunOptions = {
    installTimeoutMs: 1000,
    scriptTimeoutMs: 1000,
    maxCopyMegabytes: 1,
  };

  test("installs and runs the script in the temporary copy", async () => {
    const h = harness(processResult({ code: 0, stdout: "done" }));
    const result = await executeProject("/work/app", MANIFEST_WITH_TEST, h.env, options);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.script).toBe("test");
    expect(result.value.installFailed).toBe(false);
    expect(h.calls.map((call) => call.command.join(" "))).toEqual(["bun install", "bun run test"]);
    expect(h.calls.every((call) => call.cwd === "/tmp/bunready-run-abc")).toBe(true);
    expect(h.removed).toEqual(["/tmp/bunready-run-abc"]);
  });

  test("does not run the script when the install failed", async () => {
    const h = harness(
      processResult(),
      processResult({ code: 1, stderr: "error: no such package" }),
    );
    const result = await executeProject("/work/app", MANIFEST_WITH_TEST, h.env, options);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.installFailed).toBe(true);
    expect(result.value.result).toBeUndefined();
    expect(h.calls).toHaveLength(1);
    expect(h.removed).toHaveLength(1);
  });

  test("does not copy when the copy itself fails, and still cleans up", async () => {
    const h = harness(processResult(), processResult(), { copyThrows: true });
    const result = await executeProject("/work/app", MANIFEST_WITH_TEST, h.env, options);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("E_IO");
      expect(result.error.message).toContain("disk full");
    }
    expect(h.removed).toEqual(["/tmp/bunready-run-abc"]);
  });

  test("refuses to copy a repository larger than the configured limit", async () => {
    const h = harness(processResult(), processResult(), { measuredBytes: 2 * 1024 * 1024 });
    const result = await executeProject("/work/app", MANIFEST_WITH_TEST, h.env, options);

    expect(result.ok && result.value.copyTooLarge).toBe(true);
    expect(h.calls).toHaveLength(0);
    expect(h.copied).toHaveLength(0);

    const findings = result.ok ? runFindings(result.value, options) : [];
    expect(findings[0]?.id).toBe("run/copy-too-large");
    expect(findings[0]?.severity).toBe("risk");
    expect(findings[0]?.evidence).toContain("2 MB");
  });

  test("reports a cleanup failure instead of swallowing it", async () => {
    const h = harness(processResult(), processResult(), { removeThrows: true });
    const result = await executeProject("/work/app", MANIFEST_WITH_TEST, h.env, options);

    expect(result.ok && result.value.cleanupFailed).toBe(true);
  });
});

describe("runFindings", () => {
  const base = {
    workDir: "/tmp/bunready-run-abc",
    install: processResult(),
    installFailed: false,
    cleanupFailed: false,
    failure: undefined,
    measuredBytes: 1024,
    copyTooLarge: false,
  };

  test("a green script is info, not a blocker", () => {
    const findings = runFindings({
      ...base,
      script: "test",
      result: processResult({ code: 0, durationMs: 42 }),
      failure: undefined,
    });
    const finding = findings.find((entry) => entry.id === "run/script-passed");
    expect(finding?.severity).toBe("info");
    expect(finding?.evidence).toContain("42ms");
  });

  test("a failing script is a blocker carrying the first failure and frames", () => {
    const findings = runFindings({
      ...base,
      script: "test",
      result: processResult({ code: 1 }),
      failure: { message: "error: boom", frames: ["at /app/x.ts:1:1"] },
    });
    const finding = findings.find((entry) => entry.id === "run/script-failed");
    expect(finding?.severity).toBe("blocker");
    expect(finding?.evidence).toContain("exit code 1");
    expect(finding?.evidence).toContain("error: boom");
    expect(finding?.evidence).toContain("at /app/x.ts:1:1");
  });

  test("a timeout is a risk, never a blocker", () => {
    const findings = runFindings({
      ...base,
      script: "start",
      result: processResult({ code: null, timedOut: true }),
      failure: undefined,
    });
    const finding = findings.find((entry) => entry.id === "run/timeout");
    expect(finding?.severity).toBe("risk");
  });

  test("a failed install is a blocker and hides the missing script", () => {
    const findings = runFindings({
      ...base,
      script: undefined,
      result: undefined,
      install: processResult({ code: 1 }),
      installFailed: true,
      failure: { message: "error: lockfile had changes", frames: [] },
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.id).toBe("run/install");
    expect(findings[0]?.severity).toBe("blocker");
    expect(findings[0]?.hint).toContain("lockfile had changes");
  });

  test("nothing to run is info", () => {
    const findings = runFindings({
      ...base,
      script: undefined,
      result: undefined,
      failure: undefined,
    });
    expect(findings[0]?.id).toBe("run/nothing-to-run");
    expect(findings[0]?.severity).toBe("info");
  });

  test("a cleanup failure is reported alongside the result", () => {
    const findings = runFindings({
      ...base,
      cleanupFailed: true,
      script: "test",
      result: processResult({ code: 0 }),
      failure: undefined,
    });
    expect(findings.some((entry) => entry.id === "run/cleanup")).toBe(true);
  });
});

describe("result helper usage", () => {
  test("ok() is used for successful executions", () => {
    const result: Result<number> = ok(1);
    expect(result.ok).toBe(true);
  });
});
