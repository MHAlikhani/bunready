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

### Notes

- The scanner engine, rule set, and `--run` flag are **not implemented** in this
  release. The CLI states that plainly instead of emitting findings.

[Unreleased]: https://github.com/MHAlikhani/bunready/commits/main
