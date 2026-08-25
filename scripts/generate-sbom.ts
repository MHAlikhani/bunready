#!/usr/bin/env bun
/**
 * Write a CycloneDX SBOM for the release.
 *
 * Usage: bun run scripts/generate-sbom.ts [outputPath]   (default dist/bom.json)
 *
 * The component list comes from `bun.lock`, parsed with bunready's own lockfile
 * parser: if that parser is wrong about this repository, the release is wrong in
 * the same way, which is a useful second opinion.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseLockfile } from "../src/scanner/lockfile";
import { parseManifest } from "../src/scanner/manifest";
import { buildSbom } from "./lib/sbom";

async function main(): Promise<number> {
  const root = resolve(import.meta.dir, "..");
  const output = resolve(root, process.argv[2] ?? "dist/bom.json");

  const manifestResult = parseManifest(
    await readFile(resolve(root, "package.json"), "utf8"),
    "package.json",
  );
  if (!manifestResult.ok) {
    console.error(manifestResult.error.message);
    return 1;
  }

  const lockfileResult = parseLockfile(
    "bun",
    await readFile(resolve(root, "bun.lock"), "utf8"),
    "bun.lock",
  );
  if (!lockfileResult.ok) {
    console.error(lockfileResult.error.message);
    return 1;
  }

  const manifest = manifestResult.value;
  const sbom = buildSbom({
    name: manifest.name ?? "bunready",
    version: manifest.version ?? "0.0.0",
    timestamp: new Date().toISOString(),
    components: lockfileResult.value.packages.map((pkg) => ({
      name: pkg.name,
      version: pkg.version,
    })),
  });

  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(sbom, null, 2)}\n`, "utf8");
  console.log(`wrote ${output} with ${sbom.components.length} components`);
  return 0;
}

if (import.meta.main) {
  process.exitCode = await main();
}
