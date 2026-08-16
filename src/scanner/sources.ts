import { builtinModules } from "node:module";
import { join } from "node:path";
import type { FileSystem } from "../core/fs";

/**
 * Import scanning for the target's own source.
 *
 * This is a deliberately small, regex-based extractor, not a JavaScript parser.
 * It answers one question - "which Node built-ins does this repository import?"
 * - and it says so in the finding, so nobody mistakes it for full static
 * analysis. `node_modules`, build output and VCS data are never scanned: the
 * question is about the code the user is moving, not their dependencies.
 */

export const SOURCE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
] as const;

export const IGNORED_DIRECTORIES = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  "coverage",
  "vendor",
  ".next",
  ".nuxt",
  ".output",
  ".turbo",
  ".cache",
] as const;

export const MAX_SOURCE_FILES = 2000;

export type ImportKind = "esm" | "cjs" | "dynamic";

export interface ImportRef {
  readonly specifier: string;
  readonly kind: ImportKind;
  readonly line: number;
}

export interface SourceFile {
  readonly path: string;
  readonly imports: readonly ImportRef[];
}

export interface SourceScan {
  readonly files: readonly SourceFile[];
  readonly filesScanned: number;
  /** True when the walk stopped at the file cap, so the inventory is partial. */
  readonly truncated: boolean;
}

/**
 * The gap between `import`/`export` and `from` is restricted to the characters a
 * real clause can contain (identifiers, braces, commas, `*`, `type`). Letting it
 * span arbitrary text made one statement swallow the next one's specifier, which
 * would have attributed imports to the wrong line and file.
 */
const IMPORT_CLAUSE = "[\\w$*{}, \\t]|\\n[ \\t]*";

/** Statement-shaped anchors. They are matched against masked text (see below). */
const STATEMENT_PATTERNS: readonly { kind: ImportKind; pattern: RegExp }[] = [
  {
    kind: "esm",
    pattern: new RegExp(
      `(?:^|(?<=\\n))[ \\t]*(?:import|export)[ \\t]*(?:type[ \\t]+)?(?:${IMPORT_CLAUSE})*?from[ \\t]*`,
      "g",
    ),
  },
  { kind: "esm", pattern: /(?:^|(?<=\n))[ \t]*import[ \t]*/g },
  { kind: "cjs", pattern: /\brequire\([ \t]*/g },
  { kind: "dynamic", pattern: /\bimport\([ \t]*/g },
];

/**
 * Replace the contents of strings and comments with spaces, preserving every
 * offset and newline.
 *
 * Without this, a test fixture that contains the text `import cluster from
 * "node:cluster"` inside a string literal was counted as a real import. Masking
 * keeps offsets aligned, so specifiers are read from the original text at the
 * position the anchor matched.
 */
export function maskNonCode(text: string): string {
  const out: string[] = [];
  type Mode = "code" | "single" | "double" | "template" | "line" | "block";
  let mode: Mode = "code";
  let index = 0;

  const blank = (char: string): string => (char === "\n" ? "\n" : " ");

  while (index < text.length) {
    const char = text[index] ?? "";
    const next = text[index + 1] ?? "";

    if (mode === "code") {
      if (char === "/" && next === "/") {
        mode = "line";
        out.push("  ");
        index += 2;
        continue;
      }
      if (char === "/" && next === "*") {
        mode = "block";
        out.push("  ");
        index += 2;
        continue;
      }
      if (char === "'") {
        mode = "single";
      } else if (char === '"') {
        mode = "double";
      } else if (char === "`") {
        mode = "template";
      }
      out.push(char);
      index += 1;
      continue;
    }

    if (mode === "line") {
      if (char === "\n") {
        mode = "code";
        out.push("\n");
      } else {
        out.push(" ");
      }
      index += 1;
      continue;
    }

    if (mode === "block") {
      if (char === "*" && next === "/") {
        mode = "code";
        out.push("  ");
        index += 2;
        continue;
      }
      out.push(blank(char));
      index += 1;
      continue;
    }

    const quote = mode === "single" ? "'" : mode === "double" ? '"' : "`";
    if (char === "\\") {
      out.push("  ");
      index += 2;
      continue;
    }
    if (char === quote) {
      mode = "code";
      out.push(char);
      index += 1;
      continue;
    }
    out.push(blank(char));
    index += 1;
  }

  return out.join("");
}

/** Read a quoted specifier out of the original text, starting at `from`. */
function readQuoted(text: string, from: number): string | undefined {
  let index = from;
  while (index < text.length && (text[index] === " " || text[index] === "\t")) {
    index += 1;
  }
  const quote = text[index];
  if (quote !== '"' && quote !== "'") {
    return undefined;
  }

  let value = "";
  index += 1;
  while (index < text.length && text[index] !== quote) {
    const char = text[index] ?? "";
    if (char === "\n") {
      return undefined;
    }
    if (char === "\\") {
      value += text[index + 1] ?? "";
      index += 2;
      continue;
    }
    value += char;
    index += 1;
  }

  return value === "" ? undefined : value;
}

function lineOf(text: string, index: number): number {
  let line = 1;
  for (let cursor = 0; cursor < index && cursor < text.length; cursor += 1) {
    if (text[cursor] === "\n") {
      line += 1;
    }
  }
  return line;
}

function collect(
  masked: string,
  original: string,
  pattern: RegExp,
  kind: ImportKind,
  into: ImportRef[],
): void {
  for (const match of masked.matchAll(pattern)) {
    const specifier = readQuoted(original, match.index + match[0].length);
    if (specifier === undefined) {
      continue;
    }
    into.push({ specifier, kind, line: lineOf(original, match.index) });
  }
}

/** Extract every import/require specifier in one file's text. */
export function extractImports(text: string): ImportRef[] {
  const masked = maskNonCode(text);
  const refs: ImportRef[] = [];

  for (const { kind, pattern } of STATEMENT_PATTERNS) {
    collect(masked, text, pattern, kind, refs);
  }

  const seen = new Set<string>();
  return refs
    .filter((ref) => {
      const key = `${ref.line}:${ref.kind}:${ref.specifier}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .sort((a, b) => (a.line === b.line ? a.specifier.localeCompare(b.specifier) : a.line - b.line));
}

/**
 * The set of Node built-in module names, taken from the runtime itself rather
 * than from a list we maintain: if Node or Bun adds one, this follows.
 */
export function nodeBuiltinNames(): Set<string> {
  const names = new Set<string>();
  for (const name of builtinModules) {
    names.add(name);
    names.add(`node:${name}`);
  }
  return names;
}

export type SpecifierKind = "node-builtin" | "bun-builtin" | "relative" | "absolute" | "package";

export function classifySpecifier(
  specifier: string,
  builtins: ReadonlySet<string> = nodeBuiltinNames(),
): SpecifierKind {
  if (specifier.startsWith("bun:")) {
    return "bun-builtin";
  }
  if (builtins.has(specifier)) {
    return "node-builtin";
  }
  if (
    specifier.startsWith("./") ||
    specifier.startsWith("../") ||
    specifier === "." ||
    specifier === ".."
  ) {
    return "relative";
  }
  if (specifier.startsWith("/") || /^[A-Za-z]:[\\/]/.test(specifier)) {
    return "absolute";
  }
  return "package";
}

function hasSourceExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return SOURCE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

export interface ScanSourcesOptions {
  readonly maxFiles?: number;
}

/**
 * Walk the target's own source, breadth first and sorted, so the result is
 * deterministic. Hitting the cap is reported, never hidden.
 */
export async function scanSources(
  dir: string,
  fs: FileSystem,
  options: ScanSourcesOptions = {},
): Promise<SourceScan> {
  const maxFiles = options.maxFiles ?? MAX_SOURCE_FILES;
  const ignored = new Set<string>(IGNORED_DIRECTORIES);
  const queue: string[] = [dir];
  const files: SourceFile[] = [];
  let truncated = false;

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) {
      break;
    }

    const entries = await fs.listDirectory(current);
    for (const entry of entries) {
      if (entry.isDirectory) {
        if (!ignored.has(entry.name)) {
          queue.push(join(current, entry.name));
        }
        continue;
      }
      if (!hasSourceExtension(entry.name)) {
        continue;
      }
      if (files.length >= maxFiles) {
        truncated = true;
        continue;
      }
      const path = join(current, entry.name);
      const outcome = await fs.readTextFile(path);
      if (outcome.kind !== "text") {
        continue;
      }
      files.push({ path: path.replace(/\\/g, "/"), imports: extractImports(outcome.text) });
    }

    if (truncated) {
      break;
    }
  }

  return { files, filesScanned: files.length, truncated };
}
