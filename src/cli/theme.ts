/**
 * Colour handling.
 *
 * Two rules, both boring on purpose: `NO_COLOR` always wins when present (the
 * no-color.org convention: presence, not value, disables colour), and colour is
 * never emitted to something that is not a terminal.
 */
export interface Theme {
  readonly enabled: boolean;
  readonly bold: (text: string) => string;
  readonly dim: (text: string) => string;
  readonly red: (text: string) => string;
  readonly green: (text: string) => string;
  readonly yellow: (text: string) => string;
  readonly cyan: (text: string) => string;
}

const identity = (text: string): string => text;

/** Decides whether a stream's output should be coloured. */
export function colorEnabled(
  env: Readonly<Record<string, string | undefined>>,
  isTty: boolean,
): boolean {
  if (env.NO_COLOR !== undefined) {
    return false;
  }
  if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== "0") {
    return true;
  }
  return isTty;
}

/** Builds the colour palette used by the human-readable report. */
export function createTheme(enabled: boolean): Theme {
  if (!enabled) {
    return {
      enabled: false,
      bold: identity,
      dim: identity,
      red: identity,
      green: identity,
      yellow: identity,
      cyan: identity,
    };
  }

  const wrap = (code: string) => {
    return (text: string): string => `\u001B[${code}m${text}\u001B[0m`;
  };

  return {
    enabled: true,
    bold: wrap("1"),
    dim: wrap("2"),
    red: wrap("31"),
    green: wrap("32"),
    yellow: wrap("33"),
    cyan: wrap("36"),
  };
}
