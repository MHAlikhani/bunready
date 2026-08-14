import { formatError } from "../core/errors";
import { TOOL_VERSION } from "../core/version";
import { renderHumanReport } from "../report/human";
import { renderJsonReport } from "../report/json";
import { exitCodeForSeverities } from "../rules/severity";
import { scanTarget } from "../scanner/scan";
import { parseArgs } from "./args";
import { helpText, RUN_NOT_IMPLEMENTED, TOOL } from "./copy";
import { type Io, systemIo } from "./io";
import { colorEnabled, createTheme } from "./theme";

export const EXIT_OK = 0;
export const EXIT_BLOCKERS = 1;
export const EXIT_USAGE = 2;

export function version(): string {
  return TOOL_VERSION;
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

  if (options.run) {
    io.err(`${theme.yellow("!")} ${RUN_NOT_IMPLEMENTED}`);
  }

  const scan = await scanTarget(options.target);
  if (!scan.ok) {
    io.err(`${theme.red("error")} ${formatError(scan.error)}`);
    return EXIT_USAGE;
  }

  const report = scan.value;
  io.out(options.json ? renderJsonReport(report) : renderHumanReport(report, theme));

  const exitCode = exitCodeForSeverities(report.findings.map((finding) => finding.severity));
  return exitCode === 0 ? EXIT_OK : EXIT_BLOCKERS;
}
