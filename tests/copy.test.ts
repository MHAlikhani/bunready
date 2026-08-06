import { describe, expect, test } from "bun:test";
import { helpText, POSITIONING, TAGLINE, verdictLine } from "../src/cli/copy";

describe("helpText", () => {
  test("carries the version, usage, exit codes and the trademark disclaimer", () => {
    const help = helpText("9.9.9");

    expect(help).toContain("bunready 9.9.9");
    expect(help).toContain("USAGE");
    expect(help).toContain("EXIT CODES");
    expect(help).toContain("NO_COLOR");
    expect(help).toContain("Not affiliated with the Bun project or Oven.");
  });
});

describe("verdictLine", () => {
  const counts = { blocker: 2, risk: 3, info: 1 };

  test("blocked names the blocker count", () => {
    expect(verdictLine("blocked", counts)).toContain("2 blocker");
  });

  test("risky names the risk count and denies hard blockers", () => {
    const line = verdictLine("risky", counts);
    expect(line).toContain("3 risk");
    expect(line).toContain("no hard blockers");
  });

  test("ready claims nothing beyond the absence of blockers", () => {
    const line = verdictLine("ready", counts);
    expect(line).toContain("ready");
    expect(line).toContain("no Bun compatibility blockers");
  });
});

describe("brand copy", () => {
  test("positioning and tagline are present", () => {
    expect(POSITIONING).toBe("Know what breaks before you move a Node/TS repo to Bun.");
    expect(TAGLINE).toBe("One command. One honest verdict.");
  });
});
