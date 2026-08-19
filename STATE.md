# STATE.md - bunready working state

Read this instead of the repository. Keep it under 120 lines.

## Where we are

- Repo: `C:\Users\Admin\Desktop\bunready` - `main`, remote
  `https://github.com/MHAlikhani/bunready.git` (public).
- Phase 0 (name gate + git bootstrap): **done**.
- Phase 1 (brand + core scaffold): **done, verified**.
- Phase 2 (dependency graph + install-phase rules + report): **done, verified**.
- Phase 3 (runtime-phase rules): **partly done** - import/built-in inventory ships;
  the sourced "known runtime gap" dataset is empty by policy (see D19).
- Phases 4-6 (`--run`, CI/CD, release): **not started**.
- Commit dates are deliberate: the history runs 2026-08-06 -> 2026-08-19 and new
  commits continue from the previous commit's date, not from the wall clock (D17).

## Name gate evidence (2026-09-15)

- `npm view bunready` -> `E404` (free). Exact-name GitHub search -> only our repo.

## Decisions locked

| # | Decision | Why |
| --- | --- | --- |
| D1 | Exit codes `0` ok / `1` blockers / `2` usage-or-incomplete | CI gate is `exit != 0` only. |
| D2 | Severity = `blocker` \| `risk` \| `info`, decided by "does this break with no user action?" | ADR 0002. |
| D3 | `Result<T>` everywhere; nothing throws across module boundaries | Callers render or recover. |
| D4 | Zero third-party runtime dependencies | Scan-time code runs on user machines. |
| D5 | `run(argv, io)` is the whole CLI; `index.ts` is 2 lines | Every behaviour is testable. |
| D6 | Colour never carries meaning alone | `NO_COLOR`, CI logs keep full information. |
| D7 | Hooks via `simple-git-hooks`; commits gated by commitlint | Pure JS, no binary download. |
| D8 | Branch protection deferred to the CI phase | Required checks need CI to exist. |
| D9 | Compat data is vendored, versioned JSON with `source` links | ADR 0001; offline, never phones home. |
| D10 | `organizeImports` on in Biome | Import order is not a review topic. |
| D11 | A finding must rest on the lockfile, an installed manifest, or a curated entry with a source | Nothing is inferred from a package name. |
| D12 | `installScript` is true only when the format records it (npm `hasInstallScript`, pnpm `requiresBuild`) | A real `bun.lock` records none. |
| D13 | Lockfile parsers are hand-written; an unparseable lockfile is a reported finding | Reporting zero packages would look like a clean verdict. |
| D14 | `engines` uses a minimal in-repo semver subset; unparseable ranges report "could not evaluate" | Never turn "we do not know" into a false. |
| D15 | Native addons are `risk`, never `blocker` | Prebuilds usually exist; "will fail" is not provable offline. |
| D16 | Coverage threshold is enforced per file, not globally | Bun applies `coverageThreshold` per file. |
| D17 | New commits continue from the previous commit's date, not the wall clock | Requested; keeps one coherent timeline. |
| D18 | Import scanning is regex-based over the repository's own source, with strings and comments masked first | No parser dependency; masking removed false positives from fixtures inside string literals. |
| D19 | No module is listed as a Bun runtime gap without a primary source, so the shipped gap dataset may be empty | ADR 0001: the inventory plus a citation beats a remembered claim. |
| D20 | The source walk is capped (2000 files) and hitting the cap is reported as a finding | A partial inventory must say it is partial. |

## Public interfaces

```ts
// core
Result<T>, ok, err, isOk, isErr, defineError(code, message, {hint?, cause?}), formatError
FileSystem { readTextFile, pathExists, listDirectory }, DirectoryEntry, nodeFileSystem()
TOOL_NAME, TOOL_VERSION

// scanner
parseManifest(text, source) -> Result<Manifest>
parseLockfile(kind, text, path?) -> Result<ParsedLockfile>   // kind: bun|npm|yarn|pnpm
buildGraph(manifest, lockfile?) -> DependencyGraph
readTarget(dir, fs?) -> Result<TargetSnapshot>
scanTarget(dir, { fs?, runtime? }) -> Result<ScanReport>
scanSources(dir, fs, { maxFiles? }) -> SourceScan
extractImports(text) -> ImportRef[], maskNonCode(text) -> string
classifySpecifier(specifier), nodeBuiltinNames() -> Set<string>
satisfies(version, range) -> boolean | undefined

// rules
SEVERITIES, countBySeverity, exitCodeForSeverities, compareSeverity
installFindings(snapshot, graph, runtime) -> Finding[]
runtimeFindings(sourceScan, usages, dataset?) -> Finding[]
collectNodeBuiltins(sourceScan) -> BuiltinUsage[], readRuntimeDataset(raw?)

// report / cli
Finding, ScanReport, ScanStats, verdictFor, sortFindings
renderHumanReport(report, theme), renderJsonReport(report)
run(argv, io?) -> Promise<number>, parseArgs(argv) -> Result<CliOptions>
```

## File map

- `src/cli/` - `index.ts` (entry), `run.ts`, `args.ts`, `copy.ts` (all user
  strings), `io.ts`, `theme.ts`.
- `src/core/` - `errors.ts`, `fs.ts` (file seam), `version.ts`.
- `src/scanner/` - `manifest.ts`, `lockfile.ts` (4 formats + JSONC), `graph.ts`,
  `target.ts`, `sources.ts` (import extraction), `scan.ts`, `semver.ts`.
- `src/rules/install/` - `lifecycle-scripts.ts`, `native-addon.ts`, `engines.ts`,
  `lockfile-presence.ts`, `index.ts`.
- `src/rules/runtime/` - `builtins.ts`, `index.ts`.
- `src/rules/data/` - `native-packages.json`, `node-runtime.json`.
- `src/report/` - `types.ts`, `human.ts`, `json.ts`.
- `tests/` - 19 files, including `helpers/{memory-fs,disk-fixture}.ts`.
- `docs/brand/`, `docs/adr/`, `assets/`, `scripts/`, `STATE.md`.

## Verification (last run, phase 3)

| Check | Command | Result |
| --- | --- | --- |
| Lint + format | `bunx biome ci .` | exit 0, no notices |
| Types | `bunx tsc --noEmit` | exit 0 |
| Tests | `bun test` | 148 pass / 0 fail |
| Coverage | `bun test --coverage` | 99.76% funcs / 98.70% lines, per-file gate 0.9 |
| Build | `bun build ./src/cli/index.ts --target=bun --outdir=dist` | exit 0 |
| End-to-end | `bun run src/cli/index.ts .` | exit 1 on our own repo (see O5) |
| Runtime rule | same, `--json` | inventory: `fs/promises, module, os, path` in 6 files |
| Perf | `Measure-Command { bun run src/cli/index.ts . }` | ~147 ms, 106 locked packages, 50 source files |

## Open questions

- **O1** npm publish scope: `bin` ships TypeScript and needs the `bun` runtime.
- **O2** `pre-commit` has only ever run against already-formatted trees.
- **O3** `--run` design undecided: temp-dir strategy, `--no-network`, cleanup on
  failure (phase 4).
- **O4** Duplicate versions are in `ScanReport.stats` but not yet a finding.
- **O5** Scanning bunready itself exits 1: `simple-git-hooks` declares a
  `postinstall` and is not in `trustedDependencies`. Decide: trust it, drop it,
  or accept the finding.
- **O6** `--json` has no schema version field. Add one before CI parses it.
- **O7** `src/rules/data/node-runtime.json` ships an empty `gaps` list: entries
  need a primary source that is actually read (an issue or docs entry), and one
  search was not enough to establish any module's status honestly.
- **O8** The source walk includes `tests/`; a repository with large fixtures may
  want an exclude list.

## Next action

Phase 4 (`--run`: execute the target's start/test script under Bun in a temp copy
and capture the first real failure), or fill O7 first if a sourced gap list is
wanted sooner.
