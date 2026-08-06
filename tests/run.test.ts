import { describe, expect, test } from "bun:test";
import type { Io } from "../src/cli/io";
import { run, version } from "../src/cli/run";

interface Capture {
  readonly io: Io;
  readonly out: string[];
  readonly err: string[];
}

function capture(env: Record<string, string | undefined> = {}, isTty = false): Capture {
  const out: string[] = [];
  const err: string[] = [];
  return {
    io: {
      out: (line) => out.push(line),
      err: (line) => err.push(line),
      env,
      isTty,
    },
    out,
    err,
  };
}

describe("run", () => {
  test("--help prints usage on stdout and exits 0", async () => {
    const { io, out } = capture();
    const code = await run(["--help"], io);
    expect(code).toBe(0);
    expect(out.join("\n")).toContain("USAGE");
    expect(out.join("\n")).toContain("EXIT CODES");
  });

  test("--version prints the package version on stdout and exits 0", async () => {
    const { io, out } = capture();
    const code = await run(["--version"], io);
    expect(code).toBe(0);
    expect(out[0]).toBe(`bunready ${version()}`);
  });

  test("an unknown option exits 2 with a usage error on stderr", async () => {
    const { io, out, err } = capture();
    const code = await run(["--wat"], io);
    expect(code).toBe(2);
    expect(out).toHaveLength(0);
    expect(err.join("\n")).toContain("E_USAGE");
  });

  test("a scan exits non-zero and never fabricates findings", async () => {
    const { io, out, err } = capture();
    const code = await run(["."], io);
    expect(code).not.toBe(0);
    expect(out).toHaveLength(0);
    expect(err.join("\n")).toContain("not implemented");
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
