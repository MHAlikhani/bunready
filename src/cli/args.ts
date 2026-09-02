import { defineError, err, ok, type Result } from "../core/errors";

/** Everything the CLI understands. */
export interface CliOptions {
  /** Repository to scan; `.` unless the user passed a path. */
  readonly target: string;
  readonly help: boolean;
  readonly version: boolean;
  readonly json: boolean;
  readonly sarif: boolean;
  readonly run: boolean;
  readonly runScript: string | undefined;
  readonly config: string | undefined;
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
  let sarif = false;
  let run = false;
  let runScript: string | undefined;
  let config: string | undefined;
  let positionalOnly = false;

  const valueFor = (flag: string, index: number): Result<string> => {
    const value = argv[index + 1];
    if (value === undefined || value === "") {
      return err(
        defineError("E_USAGE", `${flag} needs a value`, {
          hint: `write it as ${flag} <value>.`,
        }),
      );
    }
    return ok(value);
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";

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
      case "--sarif":
        sarif = true;
        break;
      case "--run":
        run = true;
        break;
      case "--run-script": {
        const value = valueFor(arg, index);
        if (!value.ok) {
          return value;
        }
        runScript = value.value;
        run = true;
        index += 1;
        break;
      }
      case "--config": {
        const value = valueFor(arg, index);
        if (!value.ok) {
          return value;
        }
        config = value.value;
        index += 1;
        break;
      }
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

  if (json && sarif) {
    return err(
      defineError("E_USAGE", "--json and --sarif both write a machine-readable report to stdout", {
        hint: "choose one of them.",
      }),
    );
  }

  return ok({
    target: target ?? DEFAULT_TARGET,
    help,
    version,
    json,
    sarif,
    run,
    runScript,
    config,
  });
}
