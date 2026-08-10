import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nodeFileSystem } from "../src/core/fs";

describe("nodeFileSystem", () => {
  test("reads text, reports what is missing, and answers pathExists", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bunready-fs-"));
    const file = join(dir, "package.json");
    await writeFile(file, '{"name":"app"}', "utf8");

    const fs = nodeFileSystem();

    try {
      const read = await fs.readTextFile(file);
      expect(read.kind).toBe("text");
      if (read.kind === "text") {
        expect(read.text).toBe('{"name":"app"}');
      }

      const missing = await fs.readTextFile(join(dir, "nope.json"));
      expect(missing.kind).toBe("missing");

      expect(await fs.pathExists(file)).toBe(true);
      expect(await fs.pathExists(join(dir, "nope.json"))).toBe(false);

      // A directory is not readable text. Whatever the platform reports, the
      // outcome must not claim success.
      const asDirectory = await fs.readTextFile(dir);
      expect(asDirectory.kind).not.toBe("text");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
