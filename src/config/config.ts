import { defineError, type Result } from "../core/errors";
import { SEVERITIES, type Severity } from "../rules/severity";

/**
 * `bunready.config.json`. Every knob here exists because a real repository
 * needed to say "I know, and it is fine" without editing the tool's rules.
 */
export const CONFIG_FILENAME = "bunready.config.json";

export interface RunConfig {
  readonly script: string | undefined;
  readonly maxCopyMegabytes: number;
}

export interface BunreadyConfig {
  /** Finding ids to drop, e.g. `install/no-lockfile`. */
  readonly ignore: readonly string[];
  /** Package names to drop findings for, matched on the finding's package. */
  readonly ignorePackages: readonly string[];
  /** Packages never reported by the native-addon rule. */
  readonly nativeAllowlist: readonly string[];
  /** Substrings matched against source paths during the import scan. */
  readonly excludePaths: readonly string[];
  /** Lowest severity that makes the process exit non-zero. */
  readonly failOn: Severity;
  readonly run: RunConfig;
}

export const DEFAULT_CONFIG: BunreadyConfig = {
  ignore: [],
  ignorePackages: [],
  nativeAllowlist: [],
  excludePaths: [],
  failOn: "blocker",
  run: { script: undefined, maxCopyMegabytes: 250 },
};

export const DEFAULT_MAX_COPY_MEGABYTES = 250;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function configError(source: string, detail: string, hint: string): Result<BunreadyConfig> {
  return { ok: false, error: defineError("E_PARSE", `${source} ${detail}`, { hint }) };
}

export function parseConfig(text: string, source = CONFIG_FILENAME): Result<BunreadyConfig> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      error: defineError("E_PARSE", `${source} is not valid JSON`, {
        hint: "fix the JSON syntax, or delete the file to use the defaults.",
        cause: error,
      }),
    };
  }

  if (!isRecord(raw)) {
    return configError(
      source,
      "must contain a JSON object",
      "see docs/CONFIGURATION.md for the accepted keys.",
    );
  }

  const failOnRaw = raw.failOn;
  if (failOnRaw !== undefined && !(SEVERITIES as readonly unknown[]).includes(failOnRaw)) {
    return configError(
      source,
      `has an unknown failOn value "${String(failOnRaw)}"`,
      `use one of: ${SEVERITIES.join(", ")}.`,
    );
  }

  const runRaw = isRecord(raw.run) ? raw.run : {};
  const maxRaw = runRaw.maxCopyMegabytes;
  if (
    maxRaw !== undefined &&
    (typeof maxRaw !== "number" || !Number.isFinite(maxRaw) || maxRaw <= 0)
  ) {
    return configError(
      source,
      "has an invalid run.maxCopyMegabytes",
      "use a positive number of megabytes.",
    );
  }

  return {
    ok: true,
    value: {
      ignore: readStrings(raw.ignore),
      ignorePackages: readStrings(raw.ignorePackages),
      nativeAllowlist: readStrings(raw.nativeAllowlist),
      excludePaths: readStrings(raw.excludePaths),
      failOn: failOnRaw === undefined ? DEFAULT_CONFIG.failOn : (failOnRaw as Severity),
      run: {
        script:
          typeof runRaw.script === "string" && runRaw.script !== "" ? runRaw.script : undefined,
        maxCopyMegabytes: maxRaw === undefined ? DEFAULT_MAX_COPY_MEGABYTES : maxRaw,
      },
    },
  };
}
