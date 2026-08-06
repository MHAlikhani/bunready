import packageJson from "../../package.json";
import { formatError } from "../core/errors";
import { parseArgs } from "./args";
import { helpText, SCANNER_NOT_IMPLEMENTED, SCANNER_NOT_IMPLEMENTED_HINT, TOOL } from "./copy";
import { type Io, systemIo } from "./io";
import { colorEnabled, createTheme } from "./theme";

export const EXIT_OK = 0;
export const EXIT_BLOCKERS = 1;
export const EXIT_USAGE = 2;

export function version(): string {
  return packageJson.version;
}

/**
 * The whole CLI, minus the process boundary.
 *
 * `run` takes argv and an Io seam and returns an exit code, which keeps the
 * entry point at index.ts tiny and every behaviour reachable from tests.
 */
export async function run(argv: readonly string[], io: Io = systemIo()): Promise<number> {
  const theme = createTheme(colorEnabled(io.env, io.isTty));
  const parsed = parseArgs(argv);

  if (!parsed.ok) {
    io.err(`${theme.red("error")} ${formatError(parsed.error)}`);
    return EXIT_USAGE;
  }

  const options = parsed.value;

  if (options.help) {
    io.out(helpText(version()));
    return EXIT_OK;
  }

  if (options.version) {
    io.out(`${TOOL} ${version()}`);
    return EXIT_OK;
  }

  // Phase 2 and 3 replace this branch with the real scan. Until then the tool
  // refuses to pretend: no findings are printed and the exit code is non-zero.
  io.err(`${theme.yellow("!")} ${SCANNER_NOT_IMPLEMENTED}`);
  io.err(`${theme.dim("hint:")} ${SCANNER_NOT_IMPLEMENTED_HINT}`);
  return EXIT_USAGE;
}
