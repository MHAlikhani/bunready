import type { Finding } from "../../report/types";
import type { RunOutcome } from "../../scanner/execute";
import { DEFAULT_RUN_OPTIONS, type RunOptions } from "../../scanner/execute";

/**
 * Findings for the `--run` phase.
 *
 * A timeout is a `risk`, never a `blocker`: a server that does not exit is
 * behaving normally. A green script is `info`: the strongest evidence a scan can
 * produce, and still not a compatibility claim.
 */
const INSTALL_ID = "run/install";
const SCRIPT_FAILED_ID = "run/script-failed";
const SCRIPT_PASSED_ID = "run/script-passed";
const TIMEOUT_ID = "run/timeout";
const NOTHING_TO_RUN_ID = "run/nothing-to-run";
const CLEANUP_ID = "run/cleanup";
const TOO_LARGE_ID = "run/copy-too-large";

function megabytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

/** Turns the outcome of a run into findings. */
export function runFindings(
  outcome: RunOutcome,
  options: RunOptions = DEFAULT_RUN_OPTIONS,
): Finding[] {
  const findings: Finding[] = [];

  if (outcome.copyTooLarge) {
    findings.push({
      id: TOO_LARGE_ID,
      severity: "risk",
      title: "the project was not executed: it is larger than the copy limit",
      detail:
        "Copying this repository would exceed the configured limit, so nothing was installed or run.",
      evidence: `${megabytes(outcome.measuredBytes)} of source, limit ${options.maxCopyMegabytes} MB`,
      hint: "raise run.maxCopyMegabytes in bunready.config.json if you want it executed anyway.",
    });
    return findings;
  }

  if (outcome.installFailed) {
    findings.push({
      id: INSTALL_ID,
      severity: "blocker",
      title: "the project does not install from a clean copy under Bun",
      detail:
        "Dependencies could not be installed in a clean copy of the repository, so nothing could be started.",
      evidence:
        outcome.install?.timedOut === true
          ? `bun install did not finish within ${Math.round(options.installTimeoutMs / 1000)}s`
          : `bun install exited with code ${outcome.install?.code ?? "unknown"}`,
      hint:
        outcome.failure?.message ??
        "run `bun install` in a copy of the repository to see the full output.",
    });
  } else if (outcome.script === undefined) {
    findings.push({
      id: NOTHING_TO_RUN_ID,
      severity: "info",
      title: "no start or test script to run",
      detail:
        "The project installs cleanly, but it declares neither a `start` nor a `test` script, so there is nothing to exercise.",
      evidence: "package.json declares no start or test script",
      hint: "add a test script, or set run.script in bunready.config.json to the script you want.",
    });
  } else if (outcome.result?.timedOut === true) {
    findings.push({
      id: TIMEOUT_ID,
      severity: "risk",
      title: `bun run ${outcome.script} did not finish in time`,
      detail:
        "The script was still running when the timeout expired. A long-running server behaves this way, so this is not evidence of a failure.",
      evidence: `no exit within ${Math.round(options.scriptTimeoutMs / 1000)}s`,
      hint: "run it yourself with a longer timeout if you need a verdict on this script.",
    });
  } else if (outcome.result !== undefined && outcome.result.code === 0) {
    findings.push({
      id: SCRIPT_PASSED_ID,
      severity: "info",
      title: `bun run ${outcome.script} completed successfully`,
      detail:
        "The project installed and its script ran to completion under Bun in a clean copy. This is the strongest evidence a scan can produce.",
      evidence: `exit code 0 after ${outcome.result.durationMs}ms`,
    });
  } else if (outcome.result !== undefined) {
    findings.push({
      id: SCRIPT_FAILED_ID,
      severity: "blocker",
      title: `bun run ${outcome.script} failed`,
      detail: "The script exited with an error under Bun in a clean copy of the repository.",
      evidence: [
        `exit code ${outcome.result.code}`,
        outcome.failure?.message ?? "no error line was recognised in the output",
        ...(outcome.failure?.frames ?? []),
      ].join("\n  "),
      hint: `reproduce with a copy of the repository: bun install && bun run ${outcome.script}`,
    });
  }

  if (outcome.cleanupFailed) {
    findings.push({
      id: CLEANUP_ID,
      severity: "info",
      title: "the temporary copy could not be removed",
      detail: "The run finished but its working directory is still on disk.",
      evidence: outcome.workDir,
      hint: "delete it by hand; on Windows a file handle held by another process causes this.",
    });
  }

  return findings;
}
