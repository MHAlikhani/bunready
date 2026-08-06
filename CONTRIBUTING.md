# Contributing to bunready

Thanks for taking the time to help. This file describes how changes land.

## Ground rules

- Be direct and kind. Disagreement about code is welcome; disrespect is not.
- Every compatibility claim must cite a public source (Bun docs or a Bun
  issue/PR link). See [docs/adr/0001-data-source-policy.md](docs/adr/0001-data-source-policy.md).
- The shipped CLI has **zero third-party runtime dependencies**. Dev
  dependencies are fine.

## Setup

Requires [Bun](https://bun.sh) (see `engines` in `package.json`).

```sh
git clone https://github.com/MHAlikhani/bunready.git
cd bunready
bun install
```

`bun install` wires the local git hooks (via `simple-git-hooks`): `pre-commit`
runs Biome on staged files plus a full typecheck, and `commit-msg` runs
commitlint.

## Everyday commands

| Command | What it does |
| --- | --- |
| `bun run check` | typecheck + lint + tests (run this before pushing) |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run lint` | Biome check |
| `bun run format` | Biome check with `--write` |
| `bun test` | `bun:test` suite |
| `bun run build` | bundle the CLI into `dist/` |

## Commit messages

Conventional Commits, enforced by commitlint. Subject ≤ 72 characters,
imperative mood. Use the body to explain **why** the change exists, not what
the diff already shows.

```
feat(rules): detect native addon dependencies

package.json alone cannot reveal a .node binding, so we read the
dependency tree for gypfile/prebuild markers before reporting.
```

Allowed types: `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`,
`refactor`, `revert`, `style`, `test`.

## Style

- TypeScript strict, ESM only, no `any`. Biome enforces formatting and linting.
- Match the surrounding code: comment density, naming, and idiom included.
- Errors crossing a module boundary are returned as values, never thrown.
  See `src/core/errors.ts`.
- Tests live in `tests/` and use `bun:test`.

## Pull requests

- Keep PRs focused. One logical change per PR.
- Describe the problem first, then the fix, then how you verified it.
- Include the exact commands you ran and their result. "Works on my machine"
  is not verification.
- Do not add compatibility facts to the data files without source links.

## Reporting bugs

Open an issue with: what you ran, what you expected, what happened, and the
output of `bunready --version` plus your Bun version. If the output is not
machine-readable, `--json` is appreciated.
