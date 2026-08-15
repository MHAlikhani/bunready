# STATE.md - bunready working state

Read this instead of the repository. Keep it under 120 lines.

## Where we are

- Repo: `C:\Users\Admin\Desktop\bunready` - `main`, remote
  `https://github.com/MHAlikhani/bunready.git` (public).
- Phase 0 (name gate + git bootstrap): **done**.
- Phase 1 (brand + core scaffold): **done, verified**.
- Phase 2 (dependency graph + install-phase rules + report): **done, verified**.
- Phases 3-6 (runtime rules, `--run`, CI/CD, docs + release): **not started**.
- `bunready <path>` now produces a real verdict. `--run` is still unimplemented and
  says so on stderr before the scan runs.

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
| D11 | A finding must rest on the lockfile, the installed manifest, or a curated entry with a source | Nothing is inferred from a package name. |
| D12 | `installScript` is true only when the format records it (npm `hasInstallScript`, pnpm `requiresBuild`) | A real `bun.lock` records none; verified against our own. |
| D13 | Lockfile parsers are hand-written; an unparseable lockfile is a reported finding | Reporting zero packages would look like a clean verdict. |
| D14 | `engines` uses a minimal in-repo semver subset; unparseable ranges report "could not evaluate" | Never turn "we do not know" into a false. |
| D15 | Native addons are `risk`, never `blocker` | Prebuilds usually exist; "will fail" is not provable offline. |
| D16 | Coverage threshold is enforced per file, not globally | Bun applies `coverageThreshold` per file. |

## Public interfaces

```ts
// core
Result<T>, ok, err, isOk, isErr, defineError(code, message, {hint?, cause?}), formatError
FileSystem { readTextFile(path) => ReadOutcome, pathExists(path) }, nodeFileSystem()
TOOL_NAME, TOOL_VERSION

// scanner
parseManifest(text, source) -> Result<Manifest>
parseLockfile(kind, text, path?) -> Result<ParsedLockfile>   // kind: bun|npm|yarn|pnpm
buildGraph(manifest, lockfile?) -> DependencyGraph
readTarget(dir, fs?) -> Result<TargetSnapshot>
scanTarget(dir, { fs?, runtime? }) -> Result<ScanReport>
satisfies(version, range) -> boolean | undefined

// rules
SEVERITIES, countBySeverity, exitCodeForSeverities, compareSeverity
installFindings(snapshot, graph, runtime) -> Finding[]

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
  `target.ts`, `scan.ts`, `semver.ts`.
- `src/rules/install/` - `lifecycle-scripts.ts`, `native-addon.ts`, `engines.ts`,
  `lockfile-presence.ts`, `index.ts`. `src/rules/data/native-packages.json`.
- `src/report/` - `types.ts`, `human.ts`, `json.ts`.
- `tests/` - 17 files, including `helpers/{memory-fs,disk-fixture}.ts`.
- `docs/brand/`, `docs/adr/`, `assets/`, `scripts/`, `STATE.md`.

## Verification (last run, phase 2)

| Check | Command | Result |
| --- | --- | --- |
| Lint + format | `bunx biome ci .` | exit 0, no notices |
| Types | `bunx tsc --noEmit` | exit 0 |
| Tests | `bun test` | 125 pass / 0 fail |
| Coverage | `bun test --coverage` | 99.73% funcs / 98.88% lines, per-file gate 0.9 |
| Build | `bun build ./src/cli/index.ts --target=bun --outdir=dist` | exit 0, 48.55 KB |
| End-to-end | `bun run src/cli/index.ts .` | exit 1 on our own repo (see O5) |
| Perf | `Measure-Command { bun run src/cli/index.ts . }` | ~109 ms, 106 locked packages |

## Open questions

- **O1** npm publish scope: `bin` ships TypeScript and needs the `bun` runtime.
  Decide before phase 6.
- **O2** Windows hook execution is exercised (`commit-msg` rejects bad messages);
  `pre-commit` has only run against already-formatted trees.
- **O3** `--run` design undecided: temp-dir strategy, `--no-network`, cleanup on
  failure (phase 4).
- **O4** Duplicate versions are computed into `ScanReport.stats` but not yet
  surfaced as a finding. Decide whether phase 3 or 4 owns that rule.
- **O5** Scanning bunready itself exits 1: `simple-git-hooks` declares a
  `postinstall` and is not in `trustedDependencies`. Either trust it, drop the
  dependency, or accept the finding.
- **O6** `--json` has no schema version field. Add one before anyone parses it
  in CI.

## Next action

Phase 3: runtime-phase rules - scan imports/requires for Node built-ins and APIs
Bun does not implement, plus a curated "known broken at runtime" list, each entry
with a source link.
