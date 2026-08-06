import { defineError, err, ok, type Result } from "../core/errors";

/** Everything the CLI understands after this phase. */
export interface CliOptions {
  /** Repository to scan; `.` unless the user passed a path. */
  readonly target: string;
  readonly help: boolean;
  readonly version: boolean;
  readonly json: boolean;
  readonly run: boolean;
}

export const DEFAULT_TARGET = ".";

/**
 * Parse argv (already stripped of `node`/`bun` and the script path).
 *
 * Usage problems are returned, not thrown: the caller decides the exit code and
 * the message. `--` ends option parsing so a directory named `--json` stays
 * addressable.
 */
export function parseArgs(argv: readonly string[]): Result<CliOptions> {
  let target: string | undefined;
  let help = false;
  let version = false;
  let json = false;
  let run = false;
  let positionalOnly = false;

  for (const arg of argv) {
    if (positionalOnly) {
      if (target !== undefined) {
        return err(
          defineError("E_USAGE", `unexpected extra argument "${arg}"`, {
            hint: "bunready scans one repository at a time.",
          }),
        );
      }
      target = arg;
      continue;
    }

    switch (arg) {
      case "--":
        positionalOnly = true;
        break;
      case "-h":
      case "--help":
        help = true;
        break;
      case "-v":
      case "--version":
        version = true;
        break;
      case "--json":
        json = true;
        break;
      case "--run":
        run = true;
        break;
      default:
        if (arg.startsWith("-") && arg !== "-") {
          return err(
            defineError("E_USAGE", `unknown option "${arg}"`, {
              hint: "run `bunready --help` to see the supported options.",
            }),
          );
        }
        if (target !== undefined) {
          return err(
            defineError("E_USAGE", `unexpected extra argument "${arg}"`, {
              hint: "bunready scans one repository at a time.",
            }),
          );
        }
        target = arg;
        break;
    }
  }

  return ok({ target: target ?? DEFAULT_TARGET, help, version, json, run });
}
