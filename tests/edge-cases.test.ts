import { describe, expect, test } from "bun:test";
import { defineError } from "../src/core/errors";
import type { FileSystem } from "../src/core/fs";
import { installFindings } from "../src/rules/install";
import { buildGraph } from "../src/scanner/graph";
import { parseLockfile } from "../src/scanner/lockfile";
import { parseManifest } from "../src/scanner/manifest";
import { satisfies } from "../src/scanner/semver";
import { readTarget } from "../src/scanner/target";
import { FIXTURE_DIR, memoryFileSystem, repoFiles } from "./helpers/memory-fs";

const RUNTIME = { bun: "1.4.2", node: "22.22.0" };

async function findingsFor(files: Record<string, string>) {
  const result = await readTarget(FIXTURE_DIR, memoryFileSystem(repoFiles(files)));
  if (!result.ok) {
    throw new Error(`fixture failed to load: ${result.error.message}`);
  }
  return installFindings(
    result.value,
    buildGraph(result.value.manifest, result.value.lockfiles[0]?.parsed),
    RUNTIME,
  );
}

describe("lockfile failure paths", () => {
  test("bun.lock that is not JSON fails loudly", () => {
    const result = parseLockfile("bun", "{ definitely");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("E_PARSE");
      expect(result.error.hint).toBeDefined();
    }
  });

  test("bun.lock whose packages field is the wrong type fails loudly", () => {
    const result = parseLockfile("bun", '{"lockfileVersion":2,"packages":[]}');
    expect(result.ok).toBe(false);
  });

  test("package-lock.json with neither packages nor dependencies fails loudly", () => {
    const result = parseLockfile("npm", '{"lockfileVersion":3}');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("E_PARSE");
    }
  });

  test("yarn.lock with no recognisable block fails instead of reporting zero packages", () => {
    const result = parseLockfile("yarn", "some text without blocks\nanother line\n");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("E_PARSE");
    }
  });

  test("yarn v1 entries without a version line are skipped, not invented", () => {
    const result = parseLockfile(
      "yarn",
      '"left-pad@^1.3.0":\n  resolved "https://example.test/left-pad.tgz"\n',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.packages).toEqual([]);
    }
  });

  test("pnpm keys with peer and patch suffixes keep the real name and version", () => {
    const text = [
      "lockfileVersion: '9.0'",
      "",
      "packages:",
      "",
      "  'foo@1.2.3(react@18.2.0)':",
      "    resolution: {integrity: sha512-a}",
      "",
      "  /@scope/bar@4.5.6_peer@1.0.0:",
      "    resolution: {integrity: sha512-b}",
      "",
    ].join("\n");

    const result = parseLockfile("pnpm", text);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.packages.map((pkg) => `${pkg.name}@${pkg.version}`)).toEqual([
        "@scope/bar@4.5.6",
        "foo@1.2.3",
      ]);
    }
  });

  test("bun.lock ignores entries whose resolution carries no version", () => {
    const text =
      '{"lockfileVersion":2,"packages":{"workspace-root":["workspace-root@workspace:."]}}';
    const result = parseLockfile("bun", text);
    expect(result.ok && result.value.packages).toEqual([]);
  });
});

describe("semver edge cases", () => {
  test("prerelease tags participate in comparison", () => {
    expect(satisfies("1.2.3", ">=1.2.3-beta")).toBe(true);
    expect(satisfies("1.2.3-beta", ">=1.2.4")).toBe(false);
  });

  test("x-ranges with an explicit x", () => {
    expect(satisfies("1.5.0", "1.x")).toBe(true);
    expect(satisfies("2.0.0", "1.x")).toBe(false);
  });

  test("a malformed hyphen range cannot be evaluated", () => {
    expect(satisfies("1.2.3", "1.2.3 - banana")).toBeUndefined();
  });

  test("an unparseable comparator cannot be evaluated", () => {
    expect(satisfies("1.2.3", ">=banana")).toBeUndefined();
  });
});

describe("readTarget failure paths", () => {
  test("an unreadable package.json returns the read error", async () => {
    const failing: FileSystem = {
      readTextFile: async (path) =>
        path.endsWith("package.json")
          ? { kind: "error", error: defineError("E_IO", "permission denied") }
          : { kind: "missing" },
      pathExists: async () => false,
    };

    const result = await readTarget(FIXTURE_DIR, failing);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("E_IO");
    }
  });

  test("an unreadable lockfile is recorded as unparsed rather than dropped", async () => {
    const failing: FileSystem = {
      readTextFile: async (path) => {
        if (path.endsWith("package.json")) {
          return { kind: "text", text: '{"name":"app"}' };
        }
        if (path.endsWith("bun.lock")) {
          return { kind: "error", error: defineError("E_IO", "locked") };
        }
        return { kind: "missing" };
      },
      pathExists: async () => false,
    };

    const result = await readTarget(FIXTURE_DIR, failing);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.unparsedLockfiles).toHaveLength(1);
      expect(result.value.unparsedLockfiles[0]?.kind).toBe("bun");
    }
  });

  test("an installed dependency with unreadable JSON is skipped, not guessed at", async () => {
    const findings = await findingsFor({
      "package.json": JSON.stringify({ name: "app", dependencies: { broken: "1.0.0" } }),
      "node_modules/broken/package.json": "{ not json at all",
    });

    expect(findings.some((finding) => finding.id === "install/lifecycle-script")).toBe(false);
    expect(findings.some((finding) => finding.severity === "blocker")).toBe(false);
  });
});

describe("evidence base findings", () => {
  test("multiple lockfiles are reported and the highest priority one wins", async () => {
    const findings = await findingsFor({
      "package.json": JSON.stringify({ name: "app", dependencies: { sharp: "^0.32.0" } }),
      "bun.lock": '{"lockfileVersion":2,"packages":{"left-pad":["left-pad@1.3.0"]}}',
      "package-lock.json": JSON.stringify({
        lockfileVersion: 3,
        packages: { "": { name: "app" }, "node_modules/sharp": { version: "0.32.6" } },
      }),
    });

    const multiple = findings.find((finding) => finding.id === "install/multiple-lockfiles");
    expect(multiple?.severity).toBe("info");
    expect(multiple?.evidence).toContain("bun.lock");
  });

  test("an unevaluatable Bun engine range is reported as info", async () => {
    const result = await readTarget(
      FIXTURE_DIR,
      memoryFileSystem(
        repoFiles({ "package.json": JSON.stringify({ engines: { bun: "bogus" } }) }),
      ),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const findings = installFindings(
      result.value,
      buildGraph(result.value.manifest, undefined),
      RUNTIME,
    );
    const finding = findings.find((entry) => entry.id === "install/engines-bun");
    expect(finding?.severity).toBe("info");
  });

  test("a manifest without a name still scans", async () => {
    const result = parseManifest("{}", "package.json");
    expect(result.ok && result.value.name).toBeUndefined();
  });
});
