#!/usr/bin/env bun
/**
 * Write SHA256SUMS for release artifacts.
 *
 * Usage: bun run scripts/checksums.ts <outputPath> <file...>
 */
import { writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { formatChecksums, sha256OfFile } from "./lib/checksums";

async function main(): Promise<number> {
  const [output, ...inputs] = process.argv.slice(2);

  if (output === undefined || inputs.length === 0) {
    console.error("usage: bun run scripts/checksums.ts <outputPath> <file...>");
    return 2;
  }

  const entries = [];
  for (const input of inputs) {
    entries.push({ name: basename(input), hash: await sha256OfFile(input) });
  }

  const target = resolve(output);
  await writeFile(target, formatChecksums(entries), "utf8");
  console.log(`wrote ${target} with ${entries.length} entries`);
  return 0;
}

if (import.meta.main) {
  process.exitCode = await main();
}
