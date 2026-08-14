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

/** `--run` is planned, not built. Say so rather than scan silently and imply more. */
export const RUN_NOT_IMPLEMENTED =
  "--run is not implemented yet: this scan reads the repository and never executes the target's code";

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
    "      --run       Planned: exercise the target's own scripts under Bun in a",
    "                  temporary copy. Not implemented yet.",
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
