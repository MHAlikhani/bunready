# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.4] - 2026-09-18

### Added

- `--changed-only` scans only the workspace packages with files changed since a
  git ref (`--since <ref>`, default `HEAD~1`), including uncommitted work. Root
  files (manifest, lockfile, CI) mark the root as changed; no changes yields a
  clean `info` finding and exit 0. Baseline comparison runs against the scanned
  subset. O14 resolved.
- `--format md` renders a self-contained Markdown report for PR comments and
  GitHub step summaries: verdict, summary table, findings grouped by severity
  with evidence and source links, and a Node built-in usage section.
- The runtime dataset now records Bun's Node.js **globals** gaps (`navigator`
  partial; `localStorage`, `sessionStorage`, `QuotaExceededError` unimplemented),
  each with its source link, reported when the repository's own code reads the
  global. `partial` stays a `risk`, `unimplemented` a `blocker`.
- `stats.builtinNames` in `--json`: the distinct Node built-ins the project
  imports. Additive; `schemaVersion` stays 1.

## [0.3.4] - 2026-09-16

### Changed

- Every exported symbol carries a doc comment. JSR scores how much of a
  package's exported surface is documented; this package was at 48% and
  is now at 100%. Comments only - no behaviour changed.


## [0.3.3] - 2026-09-16

### Fixed

- `targets[].path` and `report.target` are normalised like `finding.path`, so
  grouping findings by target works on Windows as well as POSIX. The new
  per-target tests caught this.
- Per-target verdicts and counts are computed from the findings that survived
  configuration, so a package can no longer read "blocked" while the report says
  "ready" because its blocker was ignored.
- An excluded path no longer consumes the source-file budget: the scan used to
  report itself as truncated for files it was never going to read.
- Template-literal interpolations are scanned as code. `${require("node:fs")}`
  is an import; template text that merely looks like one is still ignored.

### Changed

- A workspace root no longer re-walks its packages' sources. Benchmark, 8
  packages of 800 files each: 410ms and 8,400 files read became 303ms and 6,400 -
  now exactly one package's worth per target.
- Line numbers come from one newline map per file instead of a rescan per match.
- `sortFindings` is documented and tested as a total order (severity, id, title,
  path), so output is identical however the findings were collected.
- The README is rebuilt around a quickstart, what it checks, CI, FAQ and a
  documentation index.

### Added

- `bun run bench` measures a single package and a workspace.
- `docs/README.md` indexes the documentation.


## [0.3.2] - 2026-09-16

### Changed

- Source files are read with bounded concurrency instead of one at a time. A scan
  of 800 files went from a 200.9ms median to 86.2ms on Windows (bun run bench),
  with identical output.

### Notes

- Measured and rejected: --bytecode cannot compile the entry point because it
  uses top-level await, --minify produces a byte-identical 82.2MB binary (the
  size is the Bun runtime), and deferring the scanner behind dynamic imports moved
  the cost into the scan path without a repeatable win.

## [0.3.1] - 2026-09-16

### Fixed

- Three polynomial-time regular expressions, reported by CodeQL as
  `js/polynomial-redos`. bunready parses files it does not control - a
  `pnpm-workspace.yaml` from a repository being scanned, a semver range in its
  `engines` - so a pathological string could have made a scan take quadratic
  time. The pnpm list item and the semver operator split are now parsed
  directly, and trailing-slash stripping is a linear loop instead of `/+$`.
  Behaviour is unchanged; `tests/workspaces.test.ts` and `tests/semver.test.ts`
  cover the affected paths.

## [0.3.0] - 2026-09-16

### Added

- A programmatic entry point (`src/index.ts`, wired to `main` and `exports`), so
  the scanner can be driven from a script or a test instead of a child process -
  and so npm can resolve the package instead of reporting that it cannot guess an
  entry point.
- `docs/brand/logo-card.svg`: a lockup that carries its own surface, used as the
  README fallback where `<picture>` is stripped (npm). An SVG loaded through
  `<img>` resolves `prefers-color-scheme` against the reader's operating system
  rather than against the page, so a transparent lockup can render
  light-on-white.

### Fixed

- The README logo is legible on npm in both colour schemes.
- `tests/args-flags.test.ts` compared an expression with itself, which CodeQL
  reported as a redundant operation (`js/redundant-operation`).

### Docs

- Changelog link references for 0.2.0 and 0.3.0 were missing.

## [0.2.0] - 2026-09-16

### Added

- **Sourced runtime gap dataset.** `src/rules/data/node-runtime.json` now carries
  18 entries read from Bun's own Node.js compatibility table (17 `partial`,
  1 `unimplemented`), each with the table as its primary source. A repository
  importing a `partial` module gets a `risk`; an `unimplemented` one
  (currently `node:sea`) is a `blocker`, because it breaks on import with no
  user action.
- **Real-project smoke script.** `bun run smoke` downloads the Next.js
  hello-world example, the NestJS starter and turborepo's basic monorepo and
  prints each scan's verdict, so a release is validated against real
  repositories before it ships.
- Decisions D41–D43 in `STATE.md` (optional-dependency severity, `node:`
  prefix classification, the smoke script).

### Fixed

- **Optional dependencies no longer produce blockers.** A skipped install
  script on an *optional* package (the `fsevents` false positive on the NestJS
  starter) is now a `risk`: the installer tolerates an absent optional package
  by design, so a skipped script cannot break the install itself.
- **`node:`-prefixed imports are always classified as Node built-ins**, even
  when the runtime's own `builtinModules` list lags behind Node (e.g.
  `node:sea` is missing from Bun's list).
- README no longer claims `--run` is unimplemented.

## [0.1.0] - 2026-09-09

### Added

- Repository hygiene baseline: `.gitignore`, `.gitattributes`, `.editorconfig`,
  `LICENSE` (MIT), `README.md`, `CONTRIBUTING.md`, `SECURITY.md`,
  `CODE_OF_CONDUCT.md`.
- Git hooks via `simple-git-hooks`: `pre-commit` (Biome on staged files +
  project typecheck) and `commit-msg` (commitlint, Conventional Commits).
- Brand system under `docs/brand/`: design tokens, logo variants, favicon,
  guidelines, and voice/copy reference.
- Project scaffold: strict ESM `tsconfig.json`, Biome 2.x config, `bun:test`
  suite, and the `src/{cli,core,rules,report}` layout.
- CLI skeleton (`src/cli/`): argument parsing, `--help`, `--version`, `--json`,
  `NO_COLOR` handling, and the documented exit-code contract
  (`0` clean, `1` blockers, `2` usage error).
- `src/core/errors.ts`: a `Result` type and an actionable error shape with a
  `hint` field, so failures cross module boundaries as values rather than
  thrown exceptions.
- Architecture decision records `0001` (data source policy) and `0002` (rule
  severity model).
- **Scanning.** `bunready <path>` reads `package.json` and the lockfile and
  prints a real report. The dependency graph is built from `bun.lock`,
  `package-lock.json`, `yarn.lock` or `pnpm-lock.yaml`.
- Hand-written lockfile parsers (`src/scanner/lockfile.ts`), covering Bun's JSONC
  text lockfile, npm v1/v2/v3, Yarn v1 and Berry, and pnpm. A lockfile that
  cannot be parsed is reported as a finding instead of silently yielding an
  empty graph.
- Install-phase rules (`src/rules/install/`): blocked lifecycle scripts
  (`blocker`), native addons (`risk`), `engines` conflicts, and evidence gaps
  such as a binary `bun.lockb` or a missing lockfile.
- Vendored native-package dataset (`src/rules/data/native-packages.json`); every
  entry carries a source link, and entries assert a property of the package
  rather than a Bun compatibility claim.
- Minimal semver range evaluation (`src/scanner/semver.ts`) for `engines`, which
  reports "could not evaluate" instead of guessing.
- Report renderers: a human report (`src/report/human.ts`) and `--json`
  (`src/report/json.ts`), with `ScanReport.stats` for context behind a verdict.
- Runtime-phase rule (`src/rules/runtime/`): the Node built-in modules the
  repository's own code imports, reported as an inventory with a link to Bun's
  compatibility table rather than as a verdict bunready cannot source.
- Import scanning (`src/scanner/sources.ts`): a regex-based extractor that masks
  strings and comments first, so a fixture containing import-shaped text is not
  counted as an import. The walk skips `node_modules` and build output, and
  reports when it hits its file cap.
- `ScanReport.stats` now also carries the source-file count and the number of
  Node built-ins found.
- Continuous integration: `.github/workflows/ci.yml` runs lint, typecheck, tests
  with coverage and a build on Ubuntu, macOS and Windows, against both the
  current Bun release and the exact floor `engines.bun` claims.
- `.github/workflows/security.yml`: gitleaks secret scanning, CodeQL code
  scanning (`security-and-quality`) and `bun audit`, on pushes, pull requests and
  a weekly schedule.
- `.github/dependabot.yml`: weekly updates for dev dependencies and for GitHub
  Actions, so the SHA pins stay current.
- Live CI and security badges in the README.
- Release pipeline (`.github/workflows/release.yml`): a `v*` tag asserts CI is
  green on that exact commit, compiles and smoke-tests Linux, macOS and Windows
  binaries, publishes to npm with provenance over OIDC, and attaches the
  binaries, `SHA256SUMS` and a CycloneDX SBOM to the GitHub release.
- `scripts/generate-sbom.ts` and `scripts/checksums.ts`, with the pure logic in
  `scripts/lib/` so the artifact formats are tested rather than trusted.
- `docs/RELEASING.md` (process and prerequisites) and
  `docs/adr/0003-release-pipeline.md` (why OIDC, binaries and a tag gate).
- `--run`: the target is copied to a temporary directory, dependencies are
  installed there and its `start` (or `test`) script is booted with `bun run`.
  The first real failure is captured with its stack frames. Nothing is executed
  in place, every command is timed, and the copy is removed even when the run
  fails.
- `bunready.config.json` (`src/config/`): ignore findings by rule id or package,
  allowlist native addons, exclude paths, raise or lower `failOn`, and choose the
  script and copy limit `--run` uses. `--config` points elsewhere; a missing file
  is an error rather than a silent default. See `docs/CONFIGURATION.md`.
- `--json` now carries `schemaVersion` and `failOn`, so a CI job can pin the
  contract and see which threshold produced the exit code.
  See `docs/JSON-OUTPUT.md`.
- `--sarif` writes SARIF 2.1.0 for code-scanning upload, generated from the same
  findings as every other renderer.
- `--run-script <name>` picks the script to boot, and `--run` refuses a target
  larger than `run.maxCopyMegabytes` instead of silently skipping it.
- Workspace support: `workspaces` in package.json or a `pnpm-workspace.yaml` is
  detected, every package is scanned, the report aggregates them with a `targets`
  list and a `path` on each finding, and `--scope` narrows a scan to the matching
  packages. Globs are expanded with a small, documented matcher.
- Baseline and regression detection: `--write-baseline` records the findings you
  have accepted, `--baseline` compares against them, marks the rest `new` and
  fails the run only for those. The fingerprint is rule + package + path.
- `action.yml`: a composite GitHub Action that scans a repository, uploads the
  SARIF report to code scanning and fails the step on findings at or above
  `failOn`. `version: local` runs the action from source, which is how CI tests
  it before the first publish.

### Fixed

- `.github/workflows/release.yml` was invalid YAML: a secrets expression had been
  written as a literal `*` alias, and GitHub does not fail loudly for that - it
  simply refuses to run the workflow. `ci.yml` now parses every workflow file on
  each pull request so the class of break cannot reach `main` again.
- `actions/checkout` to v7, `gitleaks/gitleaks-action` to v3, `github/codeql-action`
  init and analyze to v4 (they must move together), `@commitlint/*` to 21 and
  TypeScript to 7, with a regenerated lockfile.
- `engines.bun` now declares `>=1.4.0`. The previous `>=1.2.0` claim was wrong:
  the committed `bun.lock` is text lockfile format version 2, which Bun 1.2 and
  1.3 reject with an unknown-lockfile-version error. The CI matrix caught it on
  its first run.
- Scanning bunready itself now exits `0`. The `install/lifecycle-script` finding
  about `simple-git-hooks` was true, so the fix was to list it in
  `trustedDependencies` rather than to weaken the rule.
- Workspace glob expansion: `packages/*` and `packages/**` are expanded against
  the correct parent directory, bounded in depth, and never walk `node_modules`.
  `finding.path` is also normalised to forward slashes on every platform.

### Changed

- A scan now produces a verdict and an exit code.
- `--run` executes the target's own script in a temporary copy instead of
  reporting itself as unimplemented.
- Paths in findings print with forward slashes, so output is identical on every
  operating system.

### Notes

- `src/rules/data/node-runtime.json` ships an empty `gaps` list on purpose: each
  entry would assert that a specific Node built-in is partial or missing in Bun,
  and that claim needs a primary source. Until then the rule reports what the
  repository imports and cites the compatibility table.

[Unreleased]: https://github.com/MHAlikhani/bunready/compare/v0.4.4...HEAD
[0.4.4]: https://github.com/MHAlikhani/bunready/releases/tag/v0.4.4
[0.3.4]: https://github.com/MHAlikhani/bunready/releases/tag/v0.3.4
[0.3.3]: https://github.com/MHAlikhani/bunready/releases/tag/v0.3.3
[0.3.2]: https://github.com/MHAlikhani/bunready/releases/tag/v0.3.2
[0.3.1]: https://github.com/MHAlikhani/bunready/releases/tag/v0.3.1
[0.3.0]: https://github.com/MHAlikhani/bunready/releases/tag/v0.3.0
[0.2.0]: https://github.com/MHAlikhani/bunready/releases/tag/v0.2.0
[0.1.0]: https://github.com/MHAlikhani/bunready/releases/tag/v0.1.0
