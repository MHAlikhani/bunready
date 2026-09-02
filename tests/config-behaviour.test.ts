import { describe, expect, test } from "bun:test";
import { exitCodeForFindings } from "../src/rules/severity";
import { scanTarget } from "../src/scanner/scan";
import { FIXTURE_DIR, memoryFileSystem, repoFiles } from "./helpers/memory-fs";

const RUNTIME = { bun: "1.4.2", node: "22.22.0" };

async function scan(files: Record<string, string>) {
  const result = await scanTarget(FIXTURE_DIR, {
    fs: memoryFileSystem(repoFiles(files)),
    runtime: RUNTIME,
  });
  if (!result.ok) {
    throw new Error(`scan failed: ${result.error.message}`);
  }
  return result.value;
}

const NATIVE_REPO = {
  "package.json": JSON.stringify({ name: "app", dependencies: { "better-sqlite3": "^9" } }),
};

const INSTALL_SCRIPT_REPO = {
  "package.json": JSON.stringify({ name: "app", dependencies: { sharp: "^0.32.0" } }),
  "package-lock.json": JSON.stringify({
    lockfileVersion: 3,
    packages: {
      "": { name: "app" },
      "node_modules/sharp": { version: "0.32.6", hasInstallScript: true },
    },
  }),
};

describe("config: ignore", () => {
  test("drops findings by rule id", async () => {
    const report = await scan({
      ...NATIVE_REPO,
      "bunready.config.json": '{"ignore":["install/native-addon"]}',
    });
    expect(report.findings.some((finding) => finding.id === "install/native-addon")).toBe(false);
    expect(report.verdict).toBe("ready");
  });

  test("an empty report still carries the schema version and the threshold", async () => {
    const report = await scan({
      ...NATIVE_REPO,
      "bunready.config.json": '{"ignore":["install/native-addon"]}',
    });
    expect(report.schemaVersion).toBe(1);
    expect(report.failOn).toBe("blocker");
  });
});

describe("config: ignorePackages", () => {
  test("drops findings about one dependency and leaves the rest", async () => {
    const report = await scan({
      "package.json": JSON.stringify({
        name: "app",
        dependencies: { sharp: "^0.32.0", canvas: "^2.11.0" },
      }),
      "package-lock.json": JSON.stringify({
        lockfileVersion: 3,
        packages: {
          "": { name: "app" },
          "node_modules/sharp": { version: "0.32.6" },
          "node_modules/canvas": { version: "2.11.2" },
        },
      }),
      "bunready.config.json": '{"ignorePackages":["sharp"]}',
    });

    const native = report.findings.filter((finding) => finding.id === "install/native-addon");
    expect(native).toHaveLength(1);
    expect(native[0]?.package).toBe("canvas");
  });
});

describe("config: nativeAllowlist", () => {
  test("the allowlisted package is never reported as a native addon", async () => {
    const report = await scan({
      ...NATIVE_REPO,
      "bunready.config.json": '{"nativeAllowlist":["better-sqlite3"]}',
    });
    expect(report.findings.some((finding) => finding.id === "install/native-addon")).toBe(false);
  });
});

describe("config: excludePaths", () => {
  test("excluded source paths do not contribute imports", async () => {
    const files = {
      "package.json": JSON.stringify({ name: "app" }),
      "src/index.ts": 'import "node:path";',
      "fixtures/big.ts": 'import "node:cluster";',
    };

    const withoutConfig = await scan(files);
    expect(withoutConfig.stats?.nodeBuiltins).toBe(2);

    const withConfig = await scan({
      ...files,
      "bunready.config.json": '{"excludePaths":["fixtures/"]}',
    });
    expect(withConfig.stats?.nodeBuiltins).toBe(1);
  });
});

describe("config: failOn", () => {
  test("risk fails the run only when configured, and the report says which threshold applied", async () => {
    const strict = await scan({ ...NATIVE_REPO, "bunready.config.json": '{"failOn":"risk"}' });
    expect(strict.failOn).toBe("risk");
    expect(exitCodeForFindings(strict.findings, strict.failOn)).toBe(1);

    const lenient = await scan(NATIVE_REPO);
    expect(exitCodeForFindings(lenient.findings, lenient.failOn)).toBe(0);
  });
});

describe("config: run.script", () => {
  test("a script that does not exist is a usage error naming the alternatives", async () => {
    const result = await scanTarget(FIXTURE_DIR, {
      fs: memoryFileSystem(
        repoFiles({
          "package.json": JSON.stringify({
            name: "app",
            scripts: { build: "bun build", test: "bun test" },
          }),
          "bunready.config.json": '{"run":{"script":"start"}}',
        }),
      ),
      runtime: RUNTIME,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("E_USAGE");
      expect(result.error.hint).toContain("build, test");
    }
  });

  test("a CLI script overrides the config and is validated the same way", async () => {
    const files = repoFiles({
      "package.json": JSON.stringify({ name: "app", scripts: { test: "bun test" } }),
    });
    const result = await scanTarget(FIXTURE_DIR, {
      fs: memoryFileSystem(files),
      runtime: RUNTIME,
      runScript: "nope",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("E_USAGE");
    }
  });
});

describe("config: errors", () => {
  test("an invalid config file stops the scan", async () => {
    const result = await scanTarget(FIXTURE_DIR, {
      fs: memoryFileSystem(repoFiles({ "package.json": "{}", "bunready.config.json": "{ nope" })),
      runtime: RUNTIME,
    });
    expect(result.ok).toBe(false);
  });

  test("an explicit --config that does not exist is an error, not a silent default", async () => {
    const result = await scanTarget(FIXTURE_DIR, {
      fs: memoryFileSystem(repoFiles({ "package.json": "{}" })),
      runtime: RUNTIME,
      configPath: "missing.json",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("E_IO");
    }
  });
});

describe("self scan hygiene", () => {
  test("a trusted dependency with an install script is informational, not a blocker", async () => {
    const report = await scan({
      ...INSTALL_SCRIPT_REPO,
      "package.json": JSON.stringify({
        name: "app",
        dependencies: { sharp: "^0.32.0" },
        trustedDependencies: ["sharp"],
      }),
    });
    const finding = report.findings.find((entry) => entry.id === "install/lifecycle-script");
    expect(finding?.severity).toBe("info");
    expect(report.verdict).not.toBe("blocked");
  });
});
