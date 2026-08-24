# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

### Changed

- A scan now produces a verdict and an exit code. The "scanner is not
  implemented yet" branch is gone; `--run` is still unimplemented and says so on
  stderr before scanning.
- Paths in findings print with forward slashes, so output is identical on every
  operating system.

### Fixed

- `engines.bun` now declares `>=1.4.0`. The previous `>=1.2.0` claim was wrong:
  the committed `bun.lock` is text lockfile format version 2, which Bun 1.2 and
  1.3 reject with an unknown-lockfile-version error. The CI matrix caught it on
  its first run.

### Notes

- `src/rules/data/node-runtime.json` ships an empty `gaps` list on purpose: each
  entry would assert that a specific Node built-in is partial or missing in Bun,
  and that claim needs a primary source. Until then the rule reports what the
  repository imports and cites the compatibility table.
- `--run` (executing the target's own scripts under Bun) is not implemented yet;
  the flag says so before scanning.

[Unreleased]: https://github.com/MHAlikhani/bunready/commits/main
