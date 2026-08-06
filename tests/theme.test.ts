import { describe, expect, test } from "bun:test";
import { colorEnabled, createTheme } from "../src/cli/theme";

const ESC = "\u001B[";

describe("colorEnabled", () => {
  test("NO_COLOR wins whenever it is present, even when empty", () => {
    expect(colorEnabled({ NO_COLOR: "" }, true)).toBe(false);
    expect(colorEnabled({ NO_COLOR: "1" }, true)).toBe(false);
  });

  test("a non-interactive stream gets no colour", () => {
    expect(colorEnabled({}, false)).toBe(false);
  });

  test("an interactive stream gets colour", () => {
    expect(colorEnabled({}, true)).toBe(true);
  });

  test("FORCE_COLOR can opt a non-interactive stream in", () => {
    expect(colorEnabled({ FORCE_COLOR: "1" }, false)).toBe(true);
    expect(colorEnabled({ FORCE_COLOR: "0" }, false)).toBe(false);
  });
});

describe("createTheme", () => {
  test("disabled theme returns text untouched", () => {
    const theme = createTheme(false);
    expect(theme.enabled).toBe(false);
    expect(theme.red("error")).toBe("error");
    expect(theme.bold("bunready")).toBe("bunready");
  });

  test("enabled theme wraps text in ANSI and resets it", () => {
    const theme = createTheme(true);
    expect(theme.red("error")).toBe(`${ESC}31merror${ESC}0m`);
    expect(theme.enabled).toBe(true);
  });
});
