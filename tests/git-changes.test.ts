import { describe, expect, test } from "bun:test";
import { serializeBaseline } from "../src/config/baseline";
import {
  changedFiles,
  DEFAULT_SINCE,
  type GitCommandResult,
  type GitEnvironment,
  gitRoot,
  mapChangedFiles,
} from "../src/scanner/git";
import { scanTarget } from "../src/scanner/scan";
import { FIXTURE_DIR, memoryFileSystem, repoFiles } from "./helpers/memory-fs";

const RUNTIME = { bun: "1.4.2", node: "22.22.0" };

/** A git environment driven by canned responses, keyed by a script signature. */
function fakeGit(
  script: Record<string, { stdout?: string; code?: number; stderr?: string }>,
): GitEnvironment {
  return {
    runGit: async (args) => {
      const key = args.join(" ");
      for (const [pattern, response] of Object.entries(script)) {
        if (key.includes(pattern)) {
          return {
            code: response.code ?? 0,
            stdout: response.stdout ?? "",
            stderr: response.stderr ?? "",
          } satisfies GitCommandResult;
        }
      }
      return { code: 1, stdout: "", stderr: `unexpected git call: ${key}` };
    },
  };
}

const ROOT = { "rev-parse --show-toplevel": { stdout: "/repo\n" } };

describe("gitRoot", () => {
  test("returns the normalised toplevel", async () => {
    const env = fakeGit({ "rev-parse --show-toplevel": { stdout: "C:\\repo\\sub\n" } });
    expect(await gitRoot("/anywhere", env)).toBe("C:/repo/sub");
  });

  test("a non-repository yields undefined, not an error", async () => {
    const env = fakeGit({ "rev-parse --show-toplevel": { code: 128, stderr: "not a git repo" } });
    expect(await gitRoot("/anywhere", env)).toBeUndefined();
  });
});

describe("changedFiles", () => {
  test("merges the committed and working-tree diffs, sorted and deduplicated", async () => {
    const env = fakeGit({
      ...ROOT,
      "diff --name-only HEAD~1": { stdout: "packages/a/src/x.ts\nREADME.md\n" },
      "diff --name-only HEAD": { stdout: "packages/b/y.ts\nREADME.md\n" },
    });
    const result = await changedFiles("/repo", "HEAD~1", env);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.files).toEqual(["packages/a/src/x.ts", "packages/b/y.ts", "README.md"]);
      expect(result.value.since).toBe("HEAD~1");
    }
  });

  test("an invalid ref is a usage error with a hint, not a crash", async () => {
    const env = fakeGit({
      ...ROOT,
      "diff --name-only nope": { code: 128, stderr: "fatal: ambiguous argument 'nope'" },
    });
    const result = await changedFiles("/repo", "nope", env);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("E_USAGE");
      expect(result.error.message).toContain('cannot compare against "nope"');
      expect(result.error.hint).toContain("git rev-parse nope");
    }
  });
});

describe("mapChangedFiles", () => {
  const PATTERNS = ["packages/*"];
  const PACKAGES = {
    "/repo/packages/a/package.json": "{}",
    "/repo/packages/b/package.json": "{}",
  };

  test("partial changes map onto the packages that own them", async () => {
    const mapping = await mapChangedFiles(
      "/repo",
      ["packages/a/src/index.ts", "packages/b/other.ts"],
      PATTERNS,
      memoryFileSystem(PACKAGES),
    );
    expect(mapping.packages.map((pkg) => pkg.relative)).toEqual(["packages/a", "packages/b"]);
    expect(mapping.rootChanged).toBe(false);
  });

  test("a file outside every package marks the root as changed", async () => {
    const mapping = await mapChangedFiles(
      "/repo",
      ["package.json", "packages/a/index.ts"],
      PATTERNS,
      memoryFileSystem(PACKAGES),
    );
    expect(mapping.packages.map((pkg) => pkg.relative)).toEqual(["packages/a"]);
    expect(mapping.rootChanged).toBe(true);
  });

  test("root-only changes leave no package selected", async () => {
    const mapping = await mapChangedFiles(
      "/repo",
      ["bun.lock", "docs/x.md"],
      PATTERNS,
      memoryFileSystem(PACKAGES),
    );
    expect(mapping.packages).toEqual([]);
    expect(mapping.rootChanged).toBe(true);
  });

  test("no changes at all", async () => {
    const mapping = await mapChangedFiles("/repo", [], PATTERNS, memoryFileSystem(PACKAGES));
    expect(mapping.packages).toEqual([]);
    expect(mapping.rootChanged).toBe(false);
  });
});

describe("scanTarget with --changed-only", () => {
  const MONOREPO = {
    "package.json": JSON.stringify({ name: "root", private: true, workspaces: ["packages/*"] }),
    "bun.lock": '{"lockfileVersion":2,"packages":{}}',
    "packages/a/package.json": JSON.stringify({
      name: "a",
      dependencies: { "better-sqlite3": "^9" },
    }),
    "packages/a/index.ts": 'import "node:path";',
    "packages/b/package.json": JSON.stringify({ name: "b", dependencies: { zod: "^3" } }),
    "packages/b/index.ts": 'import "node:fs";',
  };

  async function scan(
    gitScript: Record<string, { stdout?: string; code?: number; stderr?: string }>,
    files: Record<string, string> = MONOREPO,
    extra: Record<string, unknown> = {},
  ) {
    return scanTarget(FIXTURE_DIR, {
      fs: memoryFileSystem(repoFiles(files)),
      runtime: RUNTIME,
      changedOnly: true,
      gitEnvironment: fakeGit({ "rev-parse --show-toplevel": { stdout: "/repo\n" }, ...gitScript }),
      ...extra,
    });
  }

  test("a dirty tree under one package scans that package only", async () => {
    const result = await scan({
      "diff --name-only HEAD~1": { stdout: "packages/a/new.ts\n" },
      "diff --name-only HEAD": { stdout: "packages/a/new.ts\n" },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // One target: the array is omitted, so the findings' paths are the proof.
      expect(result.value.targets).toBeUndefined();
      const native = result.value.findings.find((finding) => finding.id === "install/native-addon");
      expect(native?.path).toBe("/repo/packages/a");
      expect(result.value.findings.every((finding) => finding.path !== "/repo")).toBe(true);
    }
  });

  test("a root-only change scans the root and no package", async () => {
    const result = await scan({
      "diff --name-only HEAD~1": { stdout: "package.json\n" },
      "diff --name-only HEAD": { stdout: "" },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.targets).toBeUndefined();
      // The root alone was scanned: no package finding can appear.
      expect(result.value.findings.some((finding) => finding.path === "/repo/packages/a")).toBe(
        false,
      );
      expect(result.value.findings.some((finding) => finding.path === "/repo/packages/b")).toBe(
        false,
      );
    }
  });

  test("no changes yields a clean info finding and no targets", async () => {
    const result = await scan({
      "diff --name-only HEAD~1": { stdout: "" },
      "diff --name-only HEAD": { stdout: "" },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.verdict).toBe("ready");
      expect(result.value.findings).toHaveLength(1);
      expect(result.value.findings[0]?.id).toBe("scan/no-changes");
      expect(result.value.findings[0]?.severity).toBe("info");
      expect(result.value.targets).toBeUndefined();
    }
  });

  test("an invalid git ref fails the scan with the ref in the message", async () => {
    const result = await scan(
      {
        "diff --name-only gone": { code: 128, stderr: "fatal: ambiguous argument 'gone'" },
        "diff --name-only HEAD~1": { stdout: "" },
      },
      MONOREPO,
      { since: "gone" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("E_USAGE");
      expect(result.error.message).toContain("gone");
    }
  });

  test("a non-repository fails with a pointed error", async () => {
    const result = await scanTarget(FIXTURE_DIR, {
      fs: memoryFileSystem(repoFiles(MONOREPO)),
      runtime: RUNTIME,
      changedOnly: true,
      gitEnvironment: fakeGit({ "rev-parse --show-toplevel": { code: 128 } }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("E_USAGE");
      expect(result.error.message).toContain("needs a git repository");
    }
  });

  test("--since is honoured and --changed-only without it uses HEAD~1", async () => {
    const sinceSpy = fakeGit({
      "diff --name-only v1.0": { stdout: "packages/a/one.ts\n" },
      "diff --name-only HEAD": { stdout: "" },
      "diff --name-only HEAD~1": { stdout: "packages/a/one.ts\n" },
      "diff --name-only HEAD~1 ": { stdout: "packages/a/one.ts\n" },
    });
    const withSince = await scan(
      {
        "diff --name-only v1.0": { stdout: "packages/a/one.ts\n" },
        "diff --name-only HEAD": { stdout: "" },
      },
      MONOREPO,
      { since: "v1.0" },
    );
    expect(withSince.ok).toBe(true);
    if (withSince.ok) {
      const native = withSince.value.findings.find(
        (finding) => finding.id === "install/native-addon",
      );
      expect(native?.path).toBe("/repo/packages/a");
    }

    const defaulted = await scan({
      "diff --name-only HEAD~1": { stdout: "packages/a/one.ts\n" },
      "diff --name-only HEAD": { stdout: "" },
    });
    expect(defaulted.ok).toBe(true);
    expect(DEFAULT_SINCE).toBe("HEAD~1");
    void sinceSpy;
  });

  test("--changed-only and --scope are refused together", async () => {
    const result = await scan({}, MONOREPO, { scope: "packages/a" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("E_USAGE");
      expect(result.error.message).toContain("--changed-only and --scope");
    }
  });

  test("baseline regression detection runs against the scanned subset", async () => {
    const subset = {
      "diff --name-only HEAD~1": { stdout: "packages/a/one.ts\n" },
      "diff --name-only HEAD": { stdout: "" },
    };
    const first = await scan(subset);
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    const baselineText = serializeBaseline(first.value.findings);
    const withBaseline = await scan(
      subset,
      { ...MONOREPO, "baseline.json": baselineText },
      {
        baselinePath: "/repo/baseline.json",
      },
    );
    expect(withBaseline.ok).toBe(true);
    if (withBaseline.ok) {
      expect(withBaseline.value.baseline?.known).toBe(first.value.findings.length);
      expect(withBaseline.value.baseline?.new).toBe(0);
      expect(withBaseline.value.findings.every((finding) => finding.isNew !== true)).toBe(true);
    }
  });

  test("a changed file under no package includes the root and its own package", async () => {
    const result = await scan({
      "diff --name-only HEAD~1": { stdout: "packages/b/two.ts\nREADME.md\n" },
      "diff --name-only HEAD": { stdout: "" },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.targets?.map((target) => target.relative)).toEqual([".", "packages/b"]);
    }
  });
});
