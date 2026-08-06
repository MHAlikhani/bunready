import { describe, expect, test } from "bun:test";
import { systemIo } from "../src/cli/io";

describe("systemIo", () => {
  test("wires the real process streams and environment", () => {
    const io = systemIo();

    expect(typeof io.out).toBe("function");
    expect(typeof io.err).toBe("function");
    expect(io.env).toBe(process.env);
    expect(typeof io.isTty).toBe("boolean");

    // Exercise the writers. Empty lines keep the test output clean; only the
    // wiring is under test here.
    io.out("");
    io.err("");
  });
});
