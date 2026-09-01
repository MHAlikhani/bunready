import { describe, expect, test } from "bun:test";
import type { Io } from "../src/cli/io";
import { run, version } from "../src/cli/run";
import type { ScanReport } from "../src/report/types";
import { makeDiskFixture } from "./helpers/disk-fixture";

interface Capture {
  readonly io: Io;
  readonly out: string[];
  readonly err: string[];
}

function capture(env: Record<string, string | undefined> = {}, isTty = false): Capture {
  const out: string[] = [];
  const err: string[] = [];
  return {
    io: { out: (line) => out.push(line), err: (line) => err.push(line), env, isTty },
    out,
    err,
  };
}

async function withFixture<T>(
  files: Record<string, string>,
  body: (dir: string) => Promise<T>,
): Promise<T> {
  const fixture = await makeDiskFixture(files);
  try {
    return await body(fixture.dir);
  } finally {
    await fixture.cleanup();
  }
}

const CLEAN_REPO = { "package.json": JSON.stringify({ name: "clean-app" }) };

const BLOCKED_REPO = {
  "package.json": JSON.stringify({ name: "blocked-app", dependencies: { sharp: "^0.32.0" } }),
  "package-lock.json": JSON.stringify({
    lockfileVersion: 3,
    packages: {
      "": { name: "blocked-app" },
      "node_modules/sharp": { version: "0.32.6", hasInstallScript: true },
    },
  }),
};

describe("run", () => {
  test("--help prints usage on stdout and exits 0", async () => {
    const { io, out } = capture();
    expect(await run(["--help"], io)).toBe(0);
    expect(out.join("\n")).toContain("USAGE");
    expect(out.join("\n")).toContain("EXIT CODES");
  });

  test("--version prints the package version on stdout and exits 0", async () => {
    const { io, out } = capture();
    expect(await run(["--version"], io)).toBe(0);
    expect(out[0]).toBe(`bunready ${version()}`);
  });

  test("an unknown option exits 2 with a usage error on stderr", async () => {
    const { io, out, err } = capture();
    expect(await run(["--wat"], io)).toBe(2);
    expect(out).toHaveLength(0);
    expect(err.join("\n")).toContain("E_USAGE");
  });

  test("a repo with no blockers exits 0 and says ready", async () => {
    await withFixture(CLEAN_REPO, async (dir) => {
      const { io, out } = capture();
      expect(await run([dir], io)).toBe(0);
      expect(out.join("\n")).toContain("ready - no Bun compatibility blockers found");
    });
  });

  test("a repo with a blocked install exits 1", async () => {
    await withFixture(BLOCKED_REPO, async (dir) => {
      const { io, out } = capture();
      expect(await run([dir], io)).toBe(1);
      const text = out.join("\n");
      expect(text).toContain("blocker");
      expect(text).toContain("blocked");
    });
  });

  test("--json emits a parseable ScanReport", async () => {
    await withFixture(BLOCKED_REPO, async (dir) => {
      const { io, out } = capture();
      expect(await run([dir, "--json"], io)).toBe(1);
      const report = JSON.parse(out.join("\n")) as ScanReport;
      expect(report.tool).toBe("bunready");
      expect(report.verdict).toBe("blocked");
      expect(report.findings.length).toBeGreaterThan(0);
      expect(report.counts.blocker).toBeGreaterThan(0);
    });
  });

  test("--run executes in a temporary copy and reports what it found", async () => {
    await withFixture(
      { "package.json": JSON.stringify({ name: "run-app", private: true }) },
      async (dir) => {
        const { io, out, err } = capture();
        const code = await run([dir, "--run"], io);

        // No dependencies and no scripts: the copy installs, finds nothing to run,
        // and says so instead of inventing a result.
        expect(code).toBe(0);
        expect(err.join("\n")).toContain("executes the target's code");
        expect(out.join("\n")).toContain("no start or test script");
      },
    );
  }, 60_000);

  test("a directory without a package.json exits 2 with E_IO", async () => {
    await withFixture({}, async (dir) => {
      const { io, out, err } = capture();
      expect(await run([dir], io)).toBe(2);
      expect(out).toHaveLength(0);
      expect(err.join("\n")).toContain("E_IO");
    });
  });

  test("colour is emitted only when the stream is interactive", async () => {
    const tty = capture({}, true);
    await run(["--wat"], tty.io);
    expect(tty.err.join("\n")).toContain("\u001B[");

    const plain = capture({ NO_COLOR: "" }, true);
    await run(["--wat"], plain.io);
    expect(plain.err.join("\n")).not.toContain("\u001B[");
  });
});
