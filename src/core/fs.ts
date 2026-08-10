import { readFile, stat } from "node:fs/promises";
import { type BunreadyError, defineError } from "./errors";

/**
 * Result of one read attempt. "missing" and "error" are kept apart on purpose:
 * a missing lockfile is normal and reportable, an unreadable one is a failure
 * the user has to know about.
 */
export type ReadOutcome =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "missing" }
  | { readonly kind: "error"; readonly error: BunreadyError };

/** Minimal file seam, so scanners can be exercised without touching the disk. */
export interface FileSystem {
  readonly readTextFile: (path: string) => Promise<ReadOutcome>;
  readonly pathExists: (path: string) => Promise<boolean>;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function nodeFileSystem(): FileSystem {
  return {
    readTextFile: async (path) => {
      try {
        return { kind: "text", text: await readFile(path, "utf8") };
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === "ENOENT" || code === "ENOTDIR") {
          return { kind: "missing" };
        }
        return {
          kind: "error",
          error: defineError("E_IO", `cannot read ${path}: ${describe(error)}`, {
            hint: "check the file permissions, then run bunready again.",
            cause: error,
          }),
        };
      }
    },
    pathExists: async (path) => {
      try {
        await stat(path);
        return true;
      } catch {
        return false;
      }
    },
  };
}
