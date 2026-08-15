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

### Changed

- A scan now produces a verdict and an exit code. The "scanner is not
  implemented yet" branch is gone; `--run` is still unimplemented and says so on
  stderr before scanning.
- Paths in findings print with forward slashes, so output is identical on every
  operating system.

### Notes

- Runtime-phase rules (Node built-ins and APIs Bun does not implement, and a
  curated list of packages known to misbehave at runtime) are not implemented
  yet. The verdict is an install-phase verdict.

[Unreleased]: https://github.com/MHAlikhani/bunready/commits/main
