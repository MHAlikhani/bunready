/**
 * Synthetic benchmark: how long a scan takes, for a single package and for a
 * workspace of many packages.
 *
 * Not part of CI - it writes temporary trees and is only meaningful relative to
 * its own previous run. Usage:
 *
 *   bun run bench                        # 800 files, 5 runs
 *   BENCH_PACKAGES=8 bun run bench       # plus a monorepo of 8 packages
 *   BENCH_FILES=2000 BENCH_RUNS=3 bun run bench
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { nodeFileSystem } from "../src/core/fs";
import { scanTarget } from "../src/scanner/scan";

const filesPerPackage = Number(process.env.BENCH_FILES ?? 800);
const packages = Number(process.env.BENCH_PACKAGES ?? 8);
const runs = Number(process.env.BENCH_RUNS ?? 5);
const work = ".bench-tmp";

const BODY = [
  'import { join } from "node:path";',
  'import { readFile } from "node:fs/promises";',
  'import zod from "zod";',
  'export const value = join("a", "b");',
  "",
].join("\n");

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const low = sorted[mid - 1] ?? 0;
  const high = sorted[mid] ?? 0;
  return sorted.length % 2 === 1 ? high : (low + high) / 2;
}

async function writeSources(dir: string, count: number): Promise<void> {
  await mkdir(join(dir, "src"), { recursive: true });
  await Promise.all(
    Array.from({ length: count }, (_, index) =>
      writeFile(join(dir, "src", `file${index}.ts`), `${BODY}// ${index}\n`),
    ),
  );
}

async function measure(label: string, dir: string, expectedFiles: number): Promise<void> {
  const fs = nodeFileSystem();
  const times: number[] = [];
  let summary = "";

  for (let run = 0; run < runs; run += 1) {
    const started = performance.now();
    const result = await scanTarget(dir, { fs });
    times.push(performance.now() - started);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    summary = `${result.value.stats?.sourceFiles} files, ${result.value.targets?.length ?? 1} dirs, ${result.value.findings.length} findings`;
  }

  console.log(
    `${label.padEnd(22)} median ${median(times).toFixed(1).padStart(7)}ms   min ${Math.min(...times)
      .toFixed(1)
      .padStart(7)}ms   max ${Math.max(...times)
      .toFixed(1)
      .padStart(7)}ms   (${summary}, expected ${expectedFiles})`,
  );
}

async function main(): Promise<void> {
  await rm(work, { recursive: true, force: true });

  const single = join(work, "single");
  await mkdir(single, { recursive: true });
  await writeFile(
    join(single, "package.json"),
    JSON.stringify({ name: "single", dependencies: { zod: "^3" } }),
  );
  await writeSources(single, filesPerPackage);

  console.log(`files per package: ${filesPerPackage}   packages: ${packages}   runs: ${runs}`);
  await measure("single package", single, filesPerPackage);

  if (packages > 0) {
    const root = join(work, "mono");
    await mkdir(root, { recursive: true });
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ name: "mono", private: true, workspaces: ["packages/*"] }),
    );
    for (let index = 0; index < packages; index += 1) {
      const dir = join(root, "packages", `pkg-${index}`);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, "package.json"), JSON.stringify({ name: `pkg-${index}` }));
      await writeSources(dir, filesPerPackage);
    }
    console.log(`monorepo: 1 root + ${packages} packages`);
    await measure("workspace", root, filesPerPackage * packages);
  }

  await rm(work, { recursive: true, force: true });
}

await main();
