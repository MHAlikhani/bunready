<div align="center">

<img src="docs/brand/logo.svg" alt="bunready" width="360">

**One command that tells you what will break before you move a Node/TS repo to Bun — and gives you one clear verdict.**

[![status](https://img.shields.io/badge/status-pre--alpha-orange)](#status)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![runtime](https://img.shields.io/badge/runtime-Bun%20%E2%89%A5%201.2-black)](https://bun.sh)
[![types](https://img.shields.io/badge/TypeScript-strict-3178c6)](tsconfig.json)

<!-- Badges below become live once .github/workflows/ci.yml exists (CI phase).
[![ci](https://github.com/MHAlikhani/bunready/actions/workflows/ci.yml/badge.svg)](https://github.com/MHAlikhani/bunready/actions/workflows/ci.yml)
[![coverage](https://img.shields.io/badge/coverage-unknown-lightgrey)](#)
[![npm](https://img.shields.io/npm/v/bunready)](https://www.npmjs.com/package/bunready)
-->

</div>

---

## Status

Pre-alpha. The scanner engine is **not implemented yet**: the current CLI resolves
arguments, prints help/version, and exits non-zero with an explicit
"scanner not implemented yet" message. It never prints fabricated findings.
See [STATE.md](STATE.md) for what exists and what does not.

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

# against a target repository (engine lands in a later phase)
bun run src/cli/index.ts /path/to/node-project
```

Planned surface (not all flags are implemented in this phase):

| Flag | Meaning |
| --- | --- |
| `--help` | Print usage and exit. |
| `--version` | Print the CLI version and exit. |
| `--json` | Emit machine-readable JSON instead of the terminal report. |
| `--run` | Execute a command under Bun after scanning. |
| `NO_COLOR` | Environment variable: disable ANSI color when set. |

Exit codes: `0` no blockers, `1` blockers found, `2` usage error.

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
