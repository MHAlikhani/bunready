import { defineError, err, ok, type Result } from "../core/errors";

/** The report formats `--format` accepts. */
export const FORMAT_VALUES = ["human", "json", "sarif", "md"] as const;

/** One of `--format`'s values. */
export type Format = (typeof FORMAT_VALUES)[number];

/** Everything the CLI understands. */
export interface CliOptions {
  /** Repository to scan; `.` unless the user passed a path. */
  readonly target: string;
  readonly help: boolean;
  readonly version: boolean;
  readonly json: boolean;
  readonly sarif: boolean;
  /** Chosen by `--format`; the legacy `--json`/`--sarif` flags map onto it. */
  readonly format: Format;
  readonly run: boolean;
  readonly runScript: string | undefined;
  readonly config: string | undefined;
  readonly scope: string | undefined;
  readonly baseline: string | undefined;
  readonly writeBaseline: string | undefined;
  /** Scan only what changed since `since`. */
  readonly changedOnly: boolean;
  /** The ref `--changed-only` compares against; defaults to `HEAD~1`. */
  readonly since: string | undefined;
}

/** Directory scanned when no path argument is given. */
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
  let format: Format | undefined;
  let run = false;
  let runScript: string | undefined;
  let config: string | undefined;
  let scope: string | undefined;
  let baseline: string | undefined;
  let writeBaseline: string | undefined;
  let changedOnly = false;
  let since: string | undefined;
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
      case "--format": {
        const value = valueFor(arg, index);
        if (!value.ok) {
          return value;
        }
        if (!(FORMAT_VALUES as readonly string[]).includes(value.value)) {
          return err(
            defineError("E_USAGE", `unknown format "${value.value}"`, {
              hint: `use one of: ${FORMAT_VALUES.join(", ")}.`,
            }),
          );
        }
        format = value.value as Format;
        index += 1;
        break;
      }
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
      case "--scope": {
        const value = valueFor(arg, index);
        if (!value.ok) {
          return value;
        }
        scope = value.value;
        index += 1;
        break;
      }
      case "--baseline": {
        const value = valueFor(arg, index);
        if (!value.ok) {
          return value;
        }
        baseline = value.value;
        index += 1;
        break;
      }
      case "--changed-only":
        changedOnly = true;
        break;
      case "--since": {
        const value = valueFor(arg, index);
        if (!value.ok) {
          return value;
        }
        since = value.value;
        index += 1;
        break;
      }
      case "--write-baseline": {
        const value = valueFor(arg, index);
        if (!value.ok) {
          return value;
        }
        writeBaseline = value.value;
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

  if (since !== undefined && !changedOnly) {
    return err(
      defineError("E_USAGE", "--since only means something together with --changed-only", {
        hint: "pass --changed-only, or drop --since.",
      }),
    );
  }
  if (format !== undefined && (json || sarif)) {
    return err(
      defineError(
        "E_USAGE",
        "--format and the --json/--sarif flags both choose the report format",
        {
          hint: "pass either --format <format> or one legacy flag, not both.",
        },
      ),
    );
  }

  return ok({
    target: target ?? DEFAULT_TARGET,
    help,
    version,
    json,
    sarif,
    format: format ?? (json ? "json" : sarif ? "sarif" : "human"),
    run,
    runScript,
    config,
    scope,
    baseline,
    writeBaseline,
    changedOnly,
    since,
  });
}
