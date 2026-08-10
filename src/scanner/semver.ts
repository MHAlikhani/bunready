/**
 * Minimal semver range evaluation.
 *
 * This exists so the `engines` rule can compare declared ranges against the
 * running runtime without adding a dependency. It deliberately supports the
 * subset that appears in `engines` fields: comparators, caret, tilde, x-ranges,
 * hyphen ranges and `||` alternation. Anything it cannot parse returns
 * `undefined`, and callers must report "could not evaluate" rather than guess.
 */

export interface ParsedVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease: string | undefined;
}

type Operator = "<" | "<=" | ">" | ">=" | "=";

interface Comparator {
  readonly operator: Operator;
  readonly version: ParsedVersion;
}

type Conjunction = readonly Comparator[];
type Disjunction = readonly Conjunction[];

const VERSION_PATTERN = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?$/;

export function parseVersion(text: string): ParsedVersion | undefined {
  const cleaned = text.trim().replace(/^[=v]+/, "");
  const match = VERSION_PATTERN.exec(cleaned);
  if (match === null) {
    return undefined;
  }
  return {
    major: Number(match[1]),
    minor: match[2] === undefined ? 0 : Number(match[2]),
    patch: match[3] === undefined ? 0 : Number(match[3]),
    prerelease: match[4],
  };
}

/** Which components the author actually wrote, needed for x-range expansion. */
function writtenParts(text: string): number {
  return (
    text
      .trim()
      .replace(/^[=v]+/, "")
      .split("-")[0]
      ?.split(".").length ?? 0
  );
}

export function compareVersions(a: ParsedVersion, b: ParsedVersion): number {
  if (a.major !== b.major) {
    return a.major < b.major ? -1 : 1;
  }
  if (a.minor !== b.minor) {
    return a.minor < b.minor ? -1 : 1;
  }
  if (a.patch !== b.patch) {
    return a.patch < b.patch ? -1 : 1;
  }
  if (a.prerelease === b.prerelease) {
    return 0;
  }
  if (a.prerelease === undefined) {
    return 1;
  }
  if (b.prerelease === undefined) {
    return -1;
  }
  return a.prerelease < b.prerelease ? -1 : 1;
}

function version(major: number, minor: number, patch: number): ParsedVersion {
  return { major, minor, patch, prerelease: undefined };
}

function isWildcardPart(part: string | undefined): boolean {
  return part === undefined || part === "" || part === "x" || part === "X" || part === "*";
}

/**
 * Turn one token ("^1.2.3", ">=2", "1.x", "*", "1.2.3") into comparators.
 * Returns undefined when the token is not a form this module understands.
 */
function comparatorsForToken(token: string): Comparator[] | undefined {
  const trimmed = token.trim();
  if (trimmed === "" || trimmed === "*" || trimmed === "x" || trimmed === "latest") {
    return [];
  }

  const operatorMatch = /^(>=|<=|>|<|=|\^|~)?\s*(.*)$/.exec(trimmed);
  if (operatorMatch === null) {
    return undefined;
  }
  const operator = operatorMatch[1];
  const rest = operatorMatch[2] ?? "";
  if (rest === "" || rest === "*" || rest === "x") {
    return [];
  }

  const parts = rest.split(".");
  const partsWritten = writtenParts(rest);

  if (operator === "^") {
    const base = parseVersion(rest);
    if (base === undefined) {
      return undefined;
    }
    const upper =
      base.major > 0
        ? version(base.major + 1, 0, 0)
        : base.minor > 0
          ? version(0, base.minor + 1, 0)
          : version(0, 0, base.patch + 1);
    return [
      { operator: ">=", version: base },
      { operator: "<", version: upper },
    ];
  }

  if (operator === "~") {
    const base = parseVersion(rest);
    if (base === undefined) {
      return undefined;
    }
    const upper =
      partsWritten >= 2 ? version(base.major, base.minor + 1, 0) : version(base.major + 1, 0, 0);
    return [
      { operator: ">=", version: base },
      { operator: "<", version: upper },
    ];
  }

  if (operator === ">" || operator === ">=" || operator === "<" || operator === "<=") {
    const bounded = parseVersion(rest);
    return bounded === undefined ? undefined : [{ operator, version: bounded }];
  }

  // x-ranges and partial versions: "1" -> 1.x, "1.2" -> 1.2.x, "1.2.x" -> 1.2.x
  if (isWildcardPart(parts[1]) || isWildcardPart(parts[2]) || partsWritten < 3) {
    const base = parseVersion(
      `${parts[0] ?? "0"}.${isWildcardPart(parts[1]) ? "0" : (parts[1] ?? "0")}.${isWildcardPart(parts[2]) ? "0" : (parts[2] ?? "0")}`,
    );
    if (base === undefined) {
      return undefined;
    }
    const upper = isWildcardPart(parts[1])
      ? version(base.major + 1, 0, 0)
      : version(base.major, base.minor + 1, 0);
    return [
      { operator: ">=", version: base },
      { operator: "<", version: upper },
    ];
  }

  const exact = parseVersion(rest);
  return exact === undefined ? undefined : [{ operator: "=", version: exact }];
}

export function parseRange(range: string): Disjunction | undefined {
  const trimmed = range.trim();
  if (trimmed === "" || trimmed === "*" || trimmed === "latest") {
    return [[]];
  }

  const alternatives: Conjunction[] = [];
  for (const rawAlternative of trimmed.split("||")) {
    const alternative = rawAlternative.trim();
    if (alternative === "") {
      alternatives.push([]);
      continue;
    }

    const hyphen = /^(\S+)\s+-\s+(\S+)$/.exec(alternative);
    if (hyphen !== null) {
      const low = parseVersion(hyphen[1] ?? "");
      const high = parseVersion(hyphen[2] ?? "");
      if (low === undefined || high === undefined) {
        return undefined;
      }
      alternatives.push([
        { operator: ">=", version: low },
        { operator: "<=", version: high },
      ]);
      continue;
    }

    const conjunction: Comparator[] = [];
    for (const token of alternative.split(/\s+/)) {
      const comparators = comparatorsForToken(token);
      if (comparators === undefined) {
        return undefined;
      }
      conjunction.push(...comparators);
    }
    alternatives.push(conjunction);
  }

  return alternatives;
}

/** undefined means "could not evaluate"; never turn that into a false. */
const COMPARATOR_TESTS: Readonly<Record<Operator, (order: number) => boolean>> = {
  "<": (order) => order < 0,
  "<=": (order) => order <= 0,
  ">": (order) => order > 0,
  ">=": (order) => order >= 0,
  "=": (order) => order === 0,
};

export function satisfies(candidate: string, range: string): boolean | undefined {
  const parsedRange = parseRange(range);
  const parsedVersion = parseVersion(candidate);
  if (parsedRange === undefined || parsedVersion === undefined) {
    return undefined;
  }

  return parsedRange.some((conjunction) =>
    conjunction.every((comparator) =>
      COMPARATOR_TESTS[comparator.operator](compareVersions(parsedVersion, comparator.version)),
    ),
  );
}
