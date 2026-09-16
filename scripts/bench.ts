/**
 * Synthetic benchmark: how long a scan takes on a repository of N source files.
 *
 * Not part of CI - it writes a temporary tree and is only meaningful relative to
 * its own previous run. Usage:
 *
 *   bun run bench              # 800 files, 5 runs
 *   BENCH_FILES=2000 bun run bench
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { nodeFileSystem } from "../src/core/fs";
import { scanTarget } from "../src/scanner/scan";

const files = Number(process.env.BENCH_FILES ?? 800);
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

async function main(): Promise<void> {
  await rm(work, { recursive: true, force: true });
  await mkdir(join(work, "src"), { recursive: true });
  await writeFile(
    join(work, "package.json"),
    JSON.stringify({ name: "bench", dependencies: { zod: "^3", sharp: "^0.33" } }),
  );

  await Promise.all(
    Array.from({ length: files }, (_, index) =>
      writeFile(join(work, "src", `file${index}.ts`), `${BODY}// ${index}\n`),
    ),
  );

  const fs = nodeFileSystem();
  const times: number[] = [];
  let last = "";
  for (let run = 0; run < runs; run += 1) {
    const started = performance.now();
    const result = await scanTarget(work, { fs });
    times.push(performance.now() - started);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    last = `${result.value.stats?.sourceFiles} files, ${result.value.stats?.nodeBuiltins} builtins, ${result.value.findings.length} findings`;
  }

  console.log(`source files: ${files}   runs: ${runs}`);
  console.log(
    `scan      median ${median(times).toFixed(1)}ms   min ${Math.min(...times).toFixed(1)}ms   max ${Math.max(...times).toFixed(1)}ms`,
  );
  console.log(`last run: ${last}`);

  await rm(work, { recursive: true, force: true });
}

await main();
