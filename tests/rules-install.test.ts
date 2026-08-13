import { describe, expect, test } from "bun:test";
import { installFindings } from "../src/rules/install";
import type { RuntimeInfo } from "../src/rules/install/engines";
import { buildGraph } from "../src/scanner/graph";
import { readTarget, type TargetSnapshot } from "../src/scanner/target";
import { FIXTURE_DIR, memoryFileSystem, repoFiles } from "./helpers/memory-fs";

const RUNTIME: RuntimeInfo = { bun: "1.4.2", node: "22.22.0" };

async function snapshotOf(files: Record<string, string>): Promise<TargetSnapshot> {
  const result = await readTarget(FIXTURE_DIR, memoryFileSystem(repoFiles(files)));
  if (!result.ok) {
    throw new Error(`fixture failed to load: ${result.error.message}`);
  }
  return result.value;
}

async function findingsFor(files: Record<string, string>, runtime: RuntimeInfo = RUNTIME) {
  const snapshot = await snapshotOf(files);
  return installFindings(
    snapshot,
    buildGraph(snapshot.manifest, snapshot.lockfiles[0]?.parsed),
    runtime,
  );
}

const NPM_LOCK_WITH_INSTALL_SCRIPT = JSON.stringify({
  lockfileVersion: 3,
  packages: {
    "": { name: "app" },
    "node_modules/sharp": { version: "0.32.6", hasInstallScript: true },
  },
});

describe("lifecycle script rule", () => {
  test("a dependency install script is a blocker with evidence and a fix", async () => {
    const findings = await findingsFor({
      "package.json": JSON.stringify({ name: "app", dependencies: { sharp: "^0.32.0" } }),
      "package-lock.json": NPM_LOCK_WITH_INSTALL_SCRIPT,
    });

    const finding = findings.find((entry) => entry.id === "install/lifecycle-script");
    expect(finding?.severity).toBe("blocker");
    expect(finding?.title).toContain("sharp");
    expect(finding?.evidence).toContain("lockfile");
    expect(finding?.hint).toContain("trustedDependencies");
    expect(finding?.source).toBe("https://bun.com/docs/pm/lifecycle");
  });

  test("the same dependency becomes informational once it is trusted", async () => {
    const findings = await findingsFor({
      "package.json": JSON.stringify({
        name: "app",
        dependencies: { sharp: "^0.32.0" },
        trustedDependencies: ["sharp"],
      }),
      "package-lock.json": NPM_LOCK_WITH_INSTALL_SCRIPT,
    });

    const finding = findings.find((entry) => entry.id === "install/lifecycle-script");
    expect(finding?.severity).toBe("info");
    expect(findings.some((entry) => entry.severity === "blocker")).toBe(false);
  });

  test("an installed dependency manifest is evidence too", async () => {
    const findings = await findingsFor({
      "package.json": JSON.stringify({ name: "app", dependencies: { "weird-native": "1.0.0" } }),
      "node_modules/weird-native/package.json": JSON.stringify({
        name: "weird-native",
        scripts: { install: "node-gyp rebuild" },
      }),
    });

    const blocker = findings.find((entry) => entry.id === "install/lifecycle-script");
    expect(blocker?.severity).toBe("blocker");
    expect(blocker?.evidence).toContain("node_modules/weird-native/package.json");
    expect(blocker?.evidence).toContain('"install"');
  });
});

describe("native addon rule", () => {
  test("a curated native package is a risk pointing at its own source", async () => {
    const findings = await findingsFor({
      "package.json": JSON.stringify({ name: "app", dependencies: { "better-sqlite3": "^9.0.0" } }),
    });

    const finding = findings.find((entry) => entry.id === "install/native-addon");
    expect(finding?.severity).toBe("risk");
    expect(finding?.source).toBe("https://www.npmjs.com/package/better-sqlite3");
  });

  test("a package that is not in the graph produces no finding", async () => {
    const findings = await findingsFor({ "package.json": JSON.stringify({ name: "app" }) });
    expect(findings.some((entry) => entry.id === "install/native-addon")).toBe(false);
  });

  test("a local gypfile is reported as observed evidence", async () => {
    const findings = await findingsFor({
      "package.json": JSON.stringify({ name: "app", dependencies: { "custom-addon": "1.0.0" } }),
      "node_modules/custom-addon/package.json": JSON.stringify({
        name: "custom-addon",
        gypfile: true,
      }),
    });

    const finding = findings.find((entry) => entry.id === "install/native-addon");
    expect(finding?.severity).toBe("risk");
    expect(finding?.evidence).toContain("gypfile");
  });

  test("node-gyp declared by the project is reported once", async () => {
    const findings = await findingsFor({
      "package.json": JSON.stringify({
        name: "app",
        devDependencies: { "node-gyp": "^10.0.0" },
        scripts: { build: "node-gyp rebuild" },
      }),
    });

    const buildTool = findings.filter((entry) => entry.id === "install/native-build-tools");
    expect(buildTool).toHaveLength(1);
    expect(buildTool[0]?.severity).toBe("risk");
  });
});

describe("engines rule", () => {
  test("a declared Bun range the runtime misses is a blocker", async () => {
    const findings = await findingsFor({
      "package.json": JSON.stringify({ name: "app", engines: { bun: "^2.0.0" } }),
    });

    const finding = findings.find((entry) => entry.id === "install/engines-bun");
    expect(finding?.severity).toBe("blocker");
    expect(finding?.evidence).toContain("1.4.2");
  });

  test("a satisfied Bun range produces nothing", async () => {
    const findings = await findingsFor({
      "package.json": JSON.stringify({ name: "app", engines: { bun: ">=1.2.0" } }),
    });
    expect(findings.some((entry) => entry.id.startsWith("install/engines"))).toBe(false);
  });

  test("a Node range the compatibility layer misses is a risk, not a blocker", async () => {
    const findings = await findingsFor({
      "package.json": JSON.stringify({ name: "app", engines: { node: "^23.0.0" } }),
    });

    const finding = findings.find((entry) => entry.id === "install/engines-node");
    expect(finding?.severity).toBe("risk");
    expect(finding?.evidence).toContain("22.22.0");
  });

  test("an unevaluatable range is reported as info, never as a failure", async () => {
    const findings = await findingsFor({
      "package.json": JSON.stringify({ name: "app", engines: { node: "not-a-range" } }),
    });

    const finding = findings.find((entry) => entry.id === "install/engines-node");
    expect(finding?.severity).toBe("info");
  });
});

describe("lockfile presence rule", () => {
  test("a missing lockfile is reported as info", async () => {
    const findings = await findingsFor({ "package.json": JSON.stringify({ name: "app" }) });
    const finding = findings.find((entry) => entry.id === "install/no-lockfile");
    expect(finding?.severity).toBe("info");
  });

  test("a binary bun.lockb is a risk and its contents are never guessed", async () => {
    const findings = await findingsFor({
      "package.json": JSON.stringify({ name: "app" }),
      "bun.lockb": "binary-ish",
    });

    const finding = findings.find((entry) => entry.id === "install/binary-lockfile");
    expect(finding?.severity).toBe("risk");
    expect(finding?.evidence).toContain("bun.lockb");
  });

  test("an unreadable lockfile is reported instead of silently ignored", async () => {
    const findings = await findingsFor({
      "package.json": JSON.stringify({ name: "app" }),
      "package-lock.json": "{ definitely not json",
    });

    const finding = findings.find((entry) => entry.id === "install/unparsed-lockfile");
    expect(finding?.severity).toBe("risk");
  });

  test("a trusted and an untrusted package are reported differently in one scan", async () => {
    const findings = await findingsFor({
      "package.json": JSON.stringify({
        name: "app",
        dependencies: { sharp: "^0.32.0", canvas: "^2.11.0" },
        trustedDependencies: ["sharp"],
      }),
      "package-lock.json": JSON.stringify({
        lockfileVersion: 3,
        packages: {
          "": { name: "app" },
          "node_modules/sharp": { version: "0.32.6", hasInstallScript: true },
          "node_modules/canvas": { version: "2.11.2", hasInstallScript: true },
        },
      }),
    });

    const lifecycle = findings.filter((entry) => entry.id === "install/lifecycle-script");
    expect(lifecycle).toHaveLength(2);
    expect(lifecycle.map((entry) => `${entry.severity}:${entry.title.split(" ")[0]}`)).toEqual([
      "blocker:canvas",
      "info:sharp",
    ]);
  });

  test("findings are ordered blockers first", async () => {
    const findings = await findingsFor({
      "package.json": JSON.stringify({ name: "app", dependencies: { sharp: "^0.32.0" } }),
      "package-lock.json": NPM_LOCK_WITH_INSTALL_SCRIPT,
    });

    expect(findings[0]?.severity).toBe("blocker");
  });
});
