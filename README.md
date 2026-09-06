<div align="center">

<img src="docs/brand/logo.svg" alt="bunready" width="360">

**One command that tells you what will break before you move a Node/TS repo to Bun — and gives you one clear verdict.**

[![ci](https://github.com/MHAlikhani/bunready/actions/workflows/ci.yml/badge.svg)](https://github.com/MHAlikhani/bunready/actions/workflows/ci.yml)
[![security](https://github.com/MHAlikhani/bunready/actions/workflows/security.yml/badge.svg)](https://github.com/MHAlikhani/bunready/actions/workflows/security.yml)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![runtime](https://img.shields.io/badge/runtime-Bun%20%E2%89%A5%201.4-black)](https://bun.sh)
[![types](https://img.shields.io/badge/TypeScript-strict-3178c6)](tsconfig.json)
[![status](https://img.shields.io/badge/status-pre--alpha-orange)](#status)

<!-- The npm badge goes live with the first publish.
[![npm](https://img.shields.io/npm/v/bunready)](https://www.npmjs.com/package/bunready)
-->

</div>

---

## Status

Pre-alpha, and precise about it. `bunready <path>` reads `package.json`, any
lockfile, and the repository's own imports, then prints a report with a verdict
and an exit code CI can gate on.

What it does not do yet: `--run` (executing the target's scripts under Bun) is
accepted and reported as unimplemented, and no Node-runtime gap is claimed
without a source. See [STATE.md](STATE.md) for what exists and what does not.

## Install

Not published to npm yet. Until then, run from source:

```sh
git clone https://github.com/MHAlikhani/bunready.git
cd bunready
bun install
```

## Usage

```sh
# from a checkout
bun run src/cli/index.ts --help

# against a target repository
bun run src/cli/index.ts /path/to/node-project
```

| Flag | Meaning |
| --- | --- |
| `--help` | Print usage and exit. |
| `--version` | Print the CLI version and exit. |
| `--json` | Emit machine-readable JSON instead of the terminal report. |
| `--run` | Planned: run the target's own scripts under Bun in a temporary copy. Not implemented yet; the flag says so before scanning. |
| `NO_COLOR` | Environment variable: disable ANSI color when set. |

Exit codes: `0` no blockers, `1` blockers found, `2` usage error.

## Monorepos

A `workspaces` field in `package.json`, or a `pnpm-workspace.yaml`, is detected
automatically: the root and every package are scanned, and the report aggregates
them with a `targets` list and a `path` on each finding. `--scope packages/api`
narrows a scan to the matching packages.

## Baselines

```sh
bunready . --write-baseline bunready.baseline.json   # accept today's findings
bunready . --baseline bunready.baseline.json         # fail only on new ones
```

A baseline records rule, package and path - not the message - so rewording a
finding does not resurrect it.

## In CI

```yaml
permissions:
  contents: read
  security-events: write   # required for the SARIF upload

steps:
  - uses: actions/checkout@v7
  - uses: MHAlikhani/bunready@v0.1.0
    with:
      path: .
```

The action writes a JSON report, uploads the SARIF report to code scanning and
fails the step when findings at or above `failOn` exist. Inputs: `path`,
`version` (`latest` or `local`), `sarif-file`, `json-file`, `upload`.

## Why

Moving a repo to Bun is usually a pile of small unknowns: which npm lifecycle
scripts actually run, which APIs are partial, which packages are native, which
test runner behaviours differ. bunready answers that with evidence and a single
verdict instead of a checklist you have to interpret yourself.

## Compatibility data policy

Compatibility claims come only from public Bun documentation and issue tracker
entries, shipped as versioned JSON with source links. We never invent
compatibility facts. See [ADR 0001](docs/adr/0001-data-source-policy.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and the
[Code of Conduct](CODE_OF_CONDUCT.md). Security reports go through
[SECURITY.md](SECURITY.md).

## Disclaimer

bunready is an independent, community project. It is **not affiliated with,
endorsed by, or sponsored by the Bun project, Oven**. "Bun" and
the Bun logo are trademarks of their respective owners and are used here only
for descriptive, nominative purposes. bunready ships no Bun code and no Bun
branding.

## License

[MIT](LICENSE) © Mohammad Hosein Alikhani
