/**
 * User-facing copy. This file is the single source of truth for what bunready
 * says, so the brand guidelines and the binary cannot drift apart.
 *
 * Voice: calm, precise, non-alarmist. State the fact, then the next step.
 */
import { TOOL_NAME } from "../core/version";
import type { Verdict } from "../report/types";
import type { Severity } from "../rules/severity";

export const TOOL = TOOL_NAME;

export const POSITIONING = "Know what breaks before you move a Node/TS repo to Bun.";

export const TAGLINE = "One command. One honest verdict.";

/** `--run` executes the target's code, so the help text has to say so plainly. */
export const RUN_WARNING =
  "--run executes the target's code in a temporary copy; nothing runs in place and every command is timed";

export function helpText(version: string): string {
  return [
    `${TOOL} ${version}`,
    POSITIONING,
    "",
    "USAGE",
    `  ${TOOL} [path] [options]`,
    "",
    "ARGUMENTS",
    "  path            Repository to scan. Defaults to the current directory.",
    "",
    "OPTIONS",
    "  -h, --help      Print this help and exit.",
    "  -v, --version   Print the version and exit.",
    "      --json      Emit a machine-readable report on stdout.",
    "      --sarif     Emit SARIF 2.1.0 on stdout, for code-scanning upload.",
    "      --run       Copy the repository to a temporary directory, install it and",
    "                  run its start (or test) script under Bun, reporting the first",
    "                  real failure. Executes code; off by default.",
    "",
    "      --config    Path to a bunready.config.json. Defaults to the file in the",
    "                  scanned repository, if any.",
    "",
    "EXIT CODES",
    "  0   No blockers found.",
    "  1   Blockers found.",
    "  2   Usage error, or the scan could not complete.",
    "",
    "ENVIRONMENT",
    "  NO_COLOR        Disable ANSI colour (presence is enough).",
    "",
    "Compatibility claims come only from public Bun documentation and issue",
    "tracker entries, each shipped with a source link. bunready never invents",
    "compatibility facts. Not affiliated with the Bun project or Oven.",
    "",
    "CONFIGURATION",
    "  bunready.config.json in the scanned repository can ignore rule ids or",
    "  packages, allowlist native addons, exclude paths and raise or lower",
    "  failOn. See docs/CONFIGURATION.md.",
  ].join("\n");
}

/** The single line a human reads first. Never alarmist, never vague. */
export function verdictLine(verdict: Verdict, counts: Readonly<Record<Severity, number>>): string {
  switch (verdict) {
    case "blocked":
      return `blocked - ${counts.blocker} blocker(s) must be fixed before this repo runs on Bun`;
    case "risky":
      return `risky - ${counts.risk} risk(s) to review, no hard blockers`;
    case "ready":
      return "ready - no Bun compatibility blockers found";
  }
}
