import type { FileSystem, ReadOutcome } from "../../src/core/fs";

function normalize(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
}

/**
 * In-memory FileSystem.
 *
 * Scanner tests must be deterministic and must not depend on what happens to be
 * installed on the machine, so they read from a literal map keyed by absolute
 * path. Use dir "/repo" and keys like "/repo/package.json".
 */
export function memoryFileSystem(files: Record<string, string>): FileSystem {
  const entries = new Map<string, string>();
  for (const [path, content] of Object.entries(files)) {
    entries.set(normalize(path), content);
  }

  return {
    readTextFile: async (path): Promise<ReadOutcome> => {
      const content = entries.get(normalize(path));
      return content === undefined ? { kind: "missing" } : { kind: "text", text: content };
    },
    pathExists: async (path) => entries.has(normalize(path)),
  };
}

export const FIXTURE_DIR = "/repo";

/** Paths inside the fixture directory, so tests read as file trees. */
export function repoFiles(files: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [path, content] of Object.entries(files)) {
    result[`${FIXTURE_DIR}/${path}`] = content;
  }
  return result;
}
