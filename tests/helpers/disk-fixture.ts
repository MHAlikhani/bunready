import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export interface DiskFixture {
  readonly dir: string;
  readonly cleanup: () => Promise<void>;
}

/**
 * A throwaway repository on disk, for the few tests that need the real
 * filesystem (the CLI end-to-end path). Keyed by relative path.
 */
export async function makeDiskFixture(files: Record<string, string>): Promise<DiskFixture> {
  const dir = await mkdtemp(join(tmpdir(), "bunready-"));

  for (const [relative, content] of Object.entries(files)) {
    const target = join(dir, relative);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
  }

  return {
    dir,
    cleanup: async () => {
      await rm(dir, { recursive: true, force: true });
    },
  };
}
