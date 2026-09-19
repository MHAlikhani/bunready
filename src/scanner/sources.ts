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

/** Directories the source walk never descends into. */
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

/** Cap on how many source files are read per target. */
export const MAX_SOURCE_FILES = 2000;

/** How a module was imported: static import, dynamic import or require. */
export type ImportKind = "esm" | "cjs" | "dynamic";

/** One import found in a file: its specifier, kind and line. */
export interface ImportRef {
  readonly specifier: string;
  readonly kind: ImportKind;
  readonly line: number;
}

/** A source file read during the scan. */
export interface SourceFile {
  readonly path: string;
  readonly imports: readonly ImportRef[];
  /** Whole-word identifier matches from the scan's watch list, sorted. */
  readonly identifiers: readonly string[];
}

/** What the walk found: files, imports, and whether the cap truncated it. */
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
 * Template literals are the interesting case: the literal text is still text,
 * but a \`\${ ... }\` interpolation is real code and may contain imports, so the
 * expression is scanned while the surrounding literal stays masked. Without
 * this, \`\${require("node:fs")}\` counted as nothing, and string fixtures that
 * merely contained import-shaped text were counted as imports.
 */
export function maskNonCode(text: string): string {
  const out: string[] = [];
  type Frame =
    | { readonly kind: "code"; readonly depth: number }
    | { readonly kind: "string"; readonly quote: string }
    | { readonly kind: "template" }
    | { readonly kind: "line" }
    | { readonly kind: "block" };
  const frames: Frame[] = [{ kind: "code", depth: 0 }];
  let index = 0;

  const blank = (char: string): string => (char === "\n" ? "\n" : " ");
  const top = (): Frame => frames[frames.length - 1] ?? { kind: "code", depth: 0 };

  while (index < text.length) {
    const char = text[index] ?? "";
    const next = text[index + 1] ?? "";
    const frame = top();

    if (frame.kind === "code") {
      if (char === "/" && next === "/") {
        frames.push({ kind: "line" });
        out.push("  ");
        index += 2;
        continue;
      }
      if (char === "/" && next === "*") {
        frames.push({ kind: "block" });
        out.push("  ");
        index += 2;
        continue;
      }
      if (char === '"' || char === "'") {
        frames.push({ kind: "string", quote: char });
        out.push(char);
        index += 1;
        continue;
      }
      if (char === "`") {
        frames.push({ kind: "template" });
        out.push(char);
        index += 1;
        continue;
      }
      if (char === "{") {
        frames[frames.length - 1] = { kind: "code", depth: frame.depth + 1 };
        out.push(char);
        index += 1;
        continue;
      }
      if (char === "}") {
        const parent = frames[frames.length - 2];
        if (frame.depth === 0 && parent?.kind === "template") {
          // The interpolation ended: back inside the template literal.
          frames.pop();
        } else {
          frames[frames.length - 1] = { kind: "code", depth: Math.max(0, frame.depth - 1) };
        }
        out.push(char);
        index += 1;
        continue;
      }
      out.push(char);
      index += 1;
      continue;
    }

    if (frame.kind === "line") {
      if (char === "\n") {
        frames.pop();
        out.push("\n");
      } else {
        out.push(" ");
      }
      index += 1;
      continue;
    }

    if (frame.kind === "block") {
      if (char === "*" && next === "/") {
        frames.pop();
        out.push("  ");
        index += 2;
        continue;
      }
      out.push(blank(char));
      index += 1;
      continue;
    }

    if (frame.kind === "string") {
      if (char === "\\") {
        out.push("  ");
        index += 2;
        continue;
      }
      if (char === frame.quote) {
        frames.pop();
        out.push(char);
        index += 1;
        continue;
      }
      out.push(blank(char));
      index += 1;
      continue;
    }

    // Template body: masked, except that ${ opens a code frame again.
    if (char === "\\") {
      out.push("  ");
      index += 2;
      continue;
    }
    if (char === "`") {
      frames.pop();
      out.push(char);
      index += 1;
      continue;
    }
    if (char === "$" && next === "{") {
      frames.push({ kind: "code", depth: 0 });
      out.push("${");
      index += 2;
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

/** Newline offsets for one file, computed once and searched per match. */
function newlinePositions(text: string): number[] {
  const positions: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\n") {
      positions.push(index);
    }
  }
  return positions;
}

/** 1-based line for an offset, by binary search over the newline positions. */
function lineAt(positions: readonly number[], index: number): number {
  let low = 0;
  let high = positions.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if ((positions[mid] ?? 0) < index) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low + 1;
}

function collect(
  masked: string,
  original: string,
  newlines: readonly number[],
  pattern: RegExp,
  kind: ImportKind,
  into: ImportRef[],
): void {
  for (const match of masked.matchAll(pattern)) {
    const specifier = readQuoted(original, match.index + match[0].length);
    if (specifier === undefined) {
      continue;
    }
    into.push({ specifier, kind, line: lineAt(newlines, match.index) });
  }
}

/** Extract every import/require specifier in one file's text. */
export function extractImports(text: string): ImportRef[] {
  const masked = maskNonCode(text);
  const newlines = newlinePositions(text);
  const refs: ImportRef[] = [];

  for (const { kind, pattern } of STATEMENT_PATTERNS) {
    collect(masked, text, newlines, pattern, kind, refs);
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

/** The categories an import specifier can fall into. */
export type SpecifierKind = "node-builtin" | "bun-builtin" | "relative" | "absolute" | "package";

/** Classifies an import specifier. */
export function classifySpecifier(
  specifier: string,
  builtins: ReadonlySet<string> = nodeBuiltinNames(),
): SpecifierKind {
  if (specifier.startsWith("bun:")) {
    return "bun-builtin";
  }
  // A `node:` prefix is unambiguous even when the runtime's own module list
  // lags behind Node (e.g. node:sea is absent from Bun's builtinModules).
  if (specifier.startsWith("node:") || builtins.has(specifier)) {
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

/** Limits for the source walk. */
export interface ScanSourcesOptions {
  readonly maxFiles?: number;
  /** Substrings matched against each file path; a match skips the file. */
  readonly excludePaths?: readonly string[];
  /**
   * Whole-word identifiers to locate in each file, e.g. globals whose
   * compatibility the vendored dataset records. Matched against masked text,
   * so occurrences inside strings or comments do not count.
   */
  readonly identifiers?: readonly string[];
}

/**
 * Bounded-concurrency reads.
 *
 * Files are independent, so the ordered part (the walk) and the slow part (the
 * reads) are separated: the walk decides the order, the pool does the waiting.
 * Results keep their walk order because each file lands in its own slot.
 */
const MAX_READ_CONCURRENCY = 16;

/** Escapes a literal identifier before it is interpolated into a regular expression. */
function escapeIdentifier(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function identifierPattern(names: readonly string[]): RegExp | undefined {
  if (names.length === 0) {
    return undefined;
  }
  return new RegExp(`\\b(?:${[...names].sort().map(escapeIdentifier).join("|")})\\b`, "g");
}

/** The identifiers from the watch list that appear as whole words in the text. */
export function matchIdentifiers(masked: string, pattern: RegExp): string[] {
  const found = new Set<string>();
  for (const match of masked.matchAll(pattern)) {
    const name = match[0];
    if (name !== undefined) {
      found.add(name);
    }
  }
  return [...found].sort((a, b) => a.localeCompare(b));
}

async function readSourceFiles(
  paths: readonly string[],
  fs: FileSystem,
  identifiers: readonly string[],
): Promise<SourceFile[]> {
  const pattern = identifierPattern(identifiers);
  const slots = new Array<SourceFile | undefined>(paths.length);
  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (cursor < paths.length) {
      const index = cursor;
      cursor += 1;
      const path = paths[index];
      if (path === undefined) {
        continue;
      }
      const outcome = await fs.readTextFile(path);
      if (outcome.kind === "text") {
        const masked = maskNonCode(outcome.text);
        slots[index] = {
          path,
          imports: extractImports(outcome.text),
          identifiers: pattern === undefined ? [] : matchIdentifiers(masked, pattern),
        };
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(MAX_READ_CONCURRENCY, paths.length) }, worker));
  return slots.filter((file): file is SourceFile => file !== undefined);
}

/**
 * Walk the target's own source, breadth first and sorted, then read it. Reading
 * a repository of hundreds of files one at a time was the slowest thing a scan
 * did, and the files have no dependency on each other.
 */
export async function scanSources(
  dir: string,
  fs: FileSystem,
  options: ScanSourcesOptions = {},
): Promise<SourceScan> {
  const maxFiles = options.maxFiles ?? MAX_SOURCE_FILES;
  const excludePaths = options.excludePaths ?? [];
  const ignored = new Set<string>(IGNORED_DIRECTORIES);
  const queue: string[] = [dir];
  const candidates: string[] = [];
  let truncated = false;

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) {
      break;
    }

    for (const entry of await fs.listDirectory(current)) {
      if (entry.isDirectory) {
        if (!ignored.has(entry.name)) {
          queue.push(join(current, entry.name));
        }
        continue;
      }
      if (!hasSourceExtension(entry.name)) {
        continue;
      }
      const path = join(current, entry.name).replace(/\\/g, "/");
      // Excluded before the budget is spent: a file the caller asked us to skip
      // must not be what makes the scan report itself as truncated.
      if (excludePaths.some((fragment) => path.includes(fragment))) {
        continue;
      }
      if (candidates.length >= maxFiles) {
        truncated = true;
        continue;
      }
      candidates.push(path);
    }

    if (truncated) {
      break;
    }
  }

  const files = await readSourceFiles(candidates, fs, options.identifiers ?? []);
  return { files, filesScanned: files.length, truncated };
}
