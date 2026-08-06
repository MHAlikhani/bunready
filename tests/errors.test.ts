import { describe, expect, test } from "bun:test";
import { defineError, err, formatError, isErr, isOk, ok } from "../src/core/errors";

describe("Result helpers", () => {
  test("ok carries a value and is recognised", () => {
    const result = ok(42);
    expect(isOk(result)).toBe(true);
    expect(isErr(result)).toBe(false);
    if (result.ok) {
      expect(result.value).toBe(42);
    }
  });

  test("err carries an error and is recognised", () => {
    const result = err(defineError("E_IO", "cannot read package.json"));
    expect(isErr(result)).toBe(true);
    expect(isOk(result)).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("E_IO");
    }
  });
});

describe("defineError", () => {
  test("omits absent optional fields entirely", () => {
    const error = defineError("E_PARSE", "bad lockfile");
    expect("hint" in error).toBe(false);
    expect("cause" in error).toBe(false);
  });

  test("keeps the hint and cause when supplied", () => {
    const cause = new Error("boom");
    const error = defineError("E_INTERNAL", "unexpected", { hint: "retry", cause });
    expect(error.hint).toBe("retry");
    expect(error.cause).toBe(cause);
  });
});

describe("formatError", () => {
  test("renders code, message, and hint", () => {
    expect(formatError(defineError("E_IO", "missing file", { hint: "check the path" }))).toBe(
      "E_IO: missing file\n  hint: check the path",
    );
  });

  test("renders without the hint line when there is none", () => {
    expect(formatError(defineError("E_IO", "missing file"))).toBe("E_IO: missing file");
  });
});
