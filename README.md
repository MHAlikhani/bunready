<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/brand/logo-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="docs/brand/logo.svg">
  <img src="docs/brand/logo-card.svg" alt="bunready" width="360">
</picture>

**Know what breaks before you move a Node/TS repo to Bun.**

One command. One honest verdict. Evidence, not estimates — and it runs in CI.

[![ci](https://github.com/MHAlikhani/bunready/actions/workflows/ci.yml/badge.svg)](https://github.com/MHAlikhani/bunready/actions/workflows/ci.yml)
[![security](https://github.com/MHAlikhani/bunready/actions/workflows/security.yml/badge.svg)](https://github.com/MHAlikhani/bunready/actions/workflows/security.yml)
[![npm](https://img.shields.io/npm/v/@mh-alikhani/bunready)](https://www.npmjs.com/package/@mh-alikhani/bunready)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![runtime](https://img.shields.io/badge/runtime-Bun%20%E2%89%A5%201.4-black)](https://bun.sh)
[![types](https://img.shields.io/badge/TypeScript-strict-3178c6)](tsconfig.json)

</div>

## Quickstart

```sh
bunx @mh-alikhani/bunready .          # scan the current directory
bunx @mh-alikhani/bunready . --json   # machine-readable report
bunx @mh-alikhani/bunready --help     # every flag
```

Scanning this repository prints its findings and one verdict:

```
bunready 0.4.4  ·  106 locked packages  ·  bun.lock
/path/to/your/project

info  the project's own code imports 4 Node built-in module(s)  (runtime/node-builtins)
  Bun implements a large and still-moving part of the Node API…
  evidence: fs/promises, module, os, path (in 6 file(s))
  source:   https://bun.com/docs/runtime/nodejs-compat

ready - no Bun compatibility blockers found
```

Exit codes are the contract: **0** nothing at or above your threshold, **1** findings, **2** usage error.

## What it checks

| Phase | Rules | Why it matters |
| --- | --- | --- |
| Install | Blocked lifecycle scripts, native addons, `engines` conflicts, lockfile gaps (`bun.lockb`, missing or unreadable lockfiles) | `bun install` behaves differently from npm: untrusted packages' install scripts do not run, and native builds need a toolchain |
| Runtime | The Node built-ins your own code imports, with a link to Bun's compatibility table | Tells you which surface to test rather than guessing |
| Run (`--run`) | Installs and boots your `start`/`test` script in a temporary copy, then reports the first real failure with its stack frames | The only way to know your project actually runs |

Every finding carries the evidence it rests on and, when it makes a compatibility claim, a link to the Bun documentation or issue that supports it — see [ADR 0001](docs/adr/0001-data-source-policy.md). bunready never invents compatibility facts.

## In CI

```yaml
permissions:
  contents: read
  security-events: write   # for the SARIF upload

steps:
  - uses: actions/checkout@v7
  - uses: MHAlikhani/bunready@v0.4.4
    with:
      path: .
```

The [action](action.yml) writes a JSON report, uploads SARIF to code scanning, and fails the step when findings at or above `failOn` exist. It is also [on the GitHub Marketplace](https://github.com/marketplace/actions/bunready).

## Monorepos

A `workspaces` field or a `pnpm-workspace.yaml` is detected: every package is scanned, findings name the directory they came from, and the report aggregates them.

```sh
bunready . --scope packages/api      # one package
bunready . --changed-only --since HEAD~3  # only what the last commits touched
bunready . --sarif > bunready.sarif  # SARIF 2.1.0 for code scanning
bunready . --format md > report.md   # Markdown for PR comments and summaries
```

## Baselines

Accept today's findings, then fail only on what is new:

```sh
bunready . --write-baseline bunready.baseline.json
bunready . --baseline bunready.baseline.json
```

A fingerprint is rule + package + path — not the message — so rewording a finding does not resurrect one you already triaged.

## Configuration

`bunready.config.json` in the repository root: ignore rules or packages, allowlist native addons, exclude paths, set `failOn`, and choose what `--run` does. See [docs/CONFIGURATION.md](docs/CONFIGURATION.md).

## Documentation

| Document | What it covers |
| --- | --- |
| [Configuration](docs/CONFIGURATION.md) | Every key in `bunready.config.json` |
| [JSON output](docs/JSON-OUTPUT.md) | The `--json` contract, `schemaVersion`, exit codes |
| [Releasing](docs/RELEASING.md) | How a release is cut and verified |
| [ADRs](docs/adr/) | Data source policy, severity model, release pipeline |
| [Brand](docs/brand/guidelines.md) | Logo, tokens, voice |
| [State](STATE.md) | Decisions and open questions, kept current |

## FAQ

**Does it need network access?** No. A scan reads your repository and nothing else. Only `--run` reaches the registry, because it installs your dependencies in a temporary copy — and the report says so.

**Does it modify my repository?** No. Scans are read-only. `--run` copies the project to a temporary directory, excluding `.git`, `node_modules` and build output, and removes it afterwards.

**Why is the npm name scoped?** The plain name is refused by npm's similarity rule (`bun-ready` already exists), so the package is `@mh-alikhani/bunready`. The command, repository and action are all still `bunready`.

**How is it different from an estimate-style checker?** Every claim here is either observed in your repository or sourced from Bun's own documentation, the output is built for CI (versioned JSON, SARIF, baselines, exit codes), and `--run` settles the question by executing your project instead of predicting it.

**Does it support monorepos?** Yes — workspace packages are detected and scanned individually, with `--scope` to narrow the scan, or `--changed-only` to scan only the packages the git history touched since a ref (`--since`, default `HEAD~1`).

## Status

Pre-alpha, and precise about it. Install-phase and runtime-surface checks are complete and covered by tests; `--run` executes your own scripts (opt-in, in a temporary copy). What is not done is listed in [STATE.md](STATE.md#open-questions), and the 0.3.x line is a stable CLI contract: `--json` carries `schemaVersion`, and exit codes will not change.

## Licence

[MIT](LICENSE). Not affiliated with the Bun project or Oven.
