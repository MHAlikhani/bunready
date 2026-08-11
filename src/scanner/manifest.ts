import { defineError, type Result } from "../core/errors";

/** The parts of a target's `package.json` that bunready reasons about. */
export interface Manifest {
  readonly name: string | undefined;
  readonly version: string | undefined;
  readonly scripts: Readonly<Record<string, string>>;
  readonly dependencies: Readonly<Record<string, string>>;
  readonly devDependencies: Readonly<Record<string, string>>;
  readonly optionalDependencies: Readonly<Record<string, string>>;
  readonly peerDependencies: Readonly<Record<string, string>>;
  readonly engines: Readonly<Record<string, string>>;
  readonly trustedDependencies: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readStringMap(value: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (!isRecord(value)) {
    return result;
  }
  for (const [key, raw] of Object.entries(value)) {
    const text = asString(raw);
    if (text !== undefined) {
      result[key] = text;
    }
  }
  return result;
}

/**
 * `trustedDependencies` is documented as an array, but an object form is
 * tolerated: if one appears we read its keys, because refusing to read it would
 * produce a false "blocked lifecycle script" finding.
 */
function readTrustedDependencies(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }
  if (isRecord(value)) {
    return Object.keys(value);
  }
  return [];
}

export function parseManifest(text: string, source: string): Result<Manifest> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      error: defineError("E_PARSE", `${source} is not valid JSON`, {
        hint: "fix the JSON syntax in package.json, then run bunready again.",
        cause: error,
      }),
    };
  }

  if (!isRecord(parsed)) {
    return {
      ok: false,
      error: defineError("E_PARSE", `${source} does not contain a JSON object`, {
        hint: "package.json must contain an object at the top level.",
      }),
    };
  }

  return {
    ok: true,
    value: {
      name: asString(parsed.name),
      version: asString(parsed.version),
      scripts: readStringMap(parsed.scripts),
      dependencies: readStringMap(parsed.dependencies),
      devDependencies: readStringMap(parsed.devDependencies),
      optionalDependencies: readStringMap(parsed.optionalDependencies),
      peerDependencies: readStringMap(parsed.peerDependencies),
      engines: readStringMap(parsed.engines),
      trustedDependencies: readTrustedDependencies(parsed.trustedDependencies),
    },
  };
}
