import { describe, expect, test } from "bun:test";
import * as api from "../src/index";

/**
 * The package declares a programmatic entry point, so it has to actually work:
 * npm refuses a package whose `main`/`exports` cannot be resolved, and a broken
 * entry point is worse than a missing one.
 */
describe("public API", () => {
  test("exposes the scanning surface", () => {
    expect(typeof api.scanTarget).toBe("function");
    expect(typeof api.parseManifest).toBe("function");
    expect(typeof api.parseLockfile).toBe("function");
    expect(typeof api.buildGraph).toBe("function");
    expect(typeof api.scanSources).toBe("function");
    expect(typeof api.executeProject).toBe("function");
  });

  test("exposes configuration, baselines and renderers", () => {
    expect(typeof api.parseConfig).toBe("function");
    expect(typeof api.applyBaseline).toBe("function");
    expect(typeof api.fingerprint).toBe("function");
    expect(typeof api.renderHumanReport).toBe("function");
    expect(typeof api.renderJsonReport).toBe("function");
    expect(typeof api.renderSarifReport).toBe("function");
  });

  test("exposes the error model, severities and version", () => {
    const result = api.ok(1);
    expect(api.isOk(result)).toBe(true);
    expect(api.SEVERITIES).toContain("blocker");
    expect(api.TOOL_NAME).toBe("bunready");
    expect(api.SCHEMA_VERSION).toBeGreaterThan(0);
    expect(typeof api.TOOL_VERSION).toBe("string");
  });

  test("the exported pieces compose without shelling out", async () => {
    const fs = api.nodeFileSystem();
    const outcome = await fs.readTextFile("package.json");
    expect(outcome.kind).toBe("text");
    if (outcome.kind === "text") {
      const manifest = api.parseManifest(outcome.text, "package.json");
      expect(manifest.ok).toBe(true);
      if (manifest.ok) {
        expect(manifest.value.name).toBe("@mh-alikhani/bunready");
      }
    }
  });
});
