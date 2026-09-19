import { newFindings, serializeBaseline } from "../config/baseline";
import { formatError } from "../core/errors";
import { type FileSystem, nodeFileSystem } from "../core/fs";
import { TOOL_VERSION } from "../core/version";
import { renderHumanReport } from "../report/human";
import { renderJsonReport } from "../report/json";
import { renderMarkdownReport } from "../report/markdown";
import { renderSarifReport } from "../report/sarif";
import { exitCodeForFindings } from "../rules/severity";
import { scanTarget } from "../scanner/scan";
import { parseArgs } from "./args";
import { helpText, RUN_WARNING, TOOL } from "./copy";
import { type Io, systemIo } from "./io";
import { colorEnabled, createTheme } from "./theme";

/** Exit code for a scan with nothing at or above the failure threshold. */
export const EXIT_OK = 0;
/** Exit code for findings at or above the failure threshold. */
export const EXIT_BLOCKERS = 1;
/** Exit code for a usage error or an incomplete scan. */
export const EXIT_USAGE = 2;

/** The tool version, as reported by --version. */
export function version(): string {
  return TOOL_VERSION;
}

/**
 * The whole CLI, minus the process boundary.
 *
 * `run` takes argv and an Io seam and returns an exit code, which keeps the
 * entry point at index.ts tiny and every behaviour reachable from tests.
 */
export async function run(
  argv: readonly string[],
  io: Io = systemIo(),
  fs: FileSystem = nodeFileSystem(),
): Promise<number> {
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
    io.err(`${theme.dim("!")} ${RUN_WARNING}`);
  }

  const scan = await scanTarget(options.target, {
    fs,
    run: options.run,
    ...(options.runScript === undefined ? {} : { runScript: options.runScript }),
    ...(options.config === undefined ? {} : { configPath: options.config }),
    ...(options.scope === undefined ? {} : { scope: options.scope }),
    ...(options.baseline === undefined ? {} : { baselinePath: options.baseline }),
    ...(options.changedOnly ? { changedOnly: true } : {}),
    ...(options.since === undefined ? {} : { since: options.since }),
  });

  if (!scan.ok) {
    io.err(`${theme.red("error")} ${formatError(scan.error)}`);
    return EXIT_USAGE;
  }

  const report = scan.value;

  if (options.writeBaseline !== undefined) {
    try {
      await fs.writeTextFile(options.writeBaseline, serializeBaseline(report.findings));
    } catch (error) {
      io.err(
        `${theme.red("error")} could not write ${options.writeBaseline}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return EXIT_USAGE;
    }
    io.err(
      `${theme.dim("!")} wrote ${report.findings.length} finding(s) to ${options.writeBaseline}`,
    );
  }

  if (options.json || options.format === "json") {
    io.out(renderJsonReport(report));
  } else if (options.sarif || options.format === "sarif") {
    io.out(renderSarifReport(report));
  } else if (options.format === "md") {
    io.out(renderMarkdownReport(report));
  } else {
    io.out(renderHumanReport(report, theme));
  }

  const failing = newFindings(report.findings, report.baseline !== undefined);
  return exitCodeForFindings(failing, report.failOn) === 0 ? EXIT_OK : EXIT_BLOCKERS;
}
