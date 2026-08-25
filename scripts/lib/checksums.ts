import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

/**
 * Release checksums.
 *
 * Pure functions only, so the file format is tested rather than trusted; the CLI
 * wrapper lives in `scripts/checksums.ts`. The output format is the one
 * `sha256sum -c` expects, so anyone can verify a download with the tools they
 * already have.
 */

export interface ChecksumEntry {
  readonly name: string;
  readonly hash: string;
}

export async function sha256OfFile(path: string): Promise<string> {
  const bytes = await readFile(path);
  return createHash("sha256").update(bytes).digest("hex");
}

/** Sorted by filename, `<hash>  <name>` per line, trailing newline. */
export function formatChecksums(entries: readonly ChecksumEntry[]): string {
  const lines = [...entries]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => `${entry.hash}  ${entry.name}`);
  return `${lines.join("\n")}\n`;
}
