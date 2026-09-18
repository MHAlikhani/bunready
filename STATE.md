# STATE.md - bunready working state

Read this instead of the repository. Keep it under 120 lines.

## Where we are

- Repo: `C:\Users\Admin\Desktop\bunready` - `main`, remote
  `https://github.com/MHAlikhani/bunready.git` (public).
- Phases 0-6 all **done**: scaffold, dependency graph, runtime rules, CI/CD,
  release pipeline, `--run`. Package published to npm and JSR; action listed on
  the GitHub Marketplace; npm trusted publishing live (provenance since 0.3.0).
- 0.4.4 shipped `--changed-only`/`--since` (O14 resolved), `--format md`, and
  the Node **globals** gap dataset (`navigator`, `localStorage`,
  `sessionStorage`, `QuotaExceededError`).
- Commit dates are deliberate: the history runs 2026-08-06 onwards and new commits
  continue from the previous commit's date, not from the wall clock (D17).

## Decisions locked

| # | Decision | Why |
| --- | --- | --- |
| D1-D43 | Exit codes, severity model, Result<T>, zero deps, vendored data with sources, workspaces, baselines, action | See ADRs 0001-0003 and CHANGELOG 0.1.0-0.3.4. |
| D44 | `--changed-only` maps a local git diff (`--since`, default `HEAD~1`, plus the dirty tree) onto workspace packages; files outside every package mark the root as changed; no changes is a clean `info` + exit 0 | CI on a monorepo should pay for what the PR touched, not the repo; a silent full scan would defeat the flag. |
| D45 | `--format md` renders the same findings as human/json/sarif, self-contained, GFM-escaped | PR comments and job summaries need a readable artifact; a second rule set would drift. |
| D46 | Global gaps are detected by a whole-word identifier watch list fed from the dataset, matched against masked source | Globals are not imports; the dataset decides what is watched, so no claim ships without a source (ADR 0001). |
| D47 | `stats.builtinNames` is additive; `schemaVersion` stays 1 | Additions never bump the contract (D32). |

## Public interfaces

```ts
// git (0.4.4)
gitRoot(dir, env), changedFiles(root, since, env), mapChangedFiles(root, files, patterns, fs)
GitEnvironment, systemGitEnvironment(), DEFAULT_SINCE
// report
renderMarkdownReport(report)   // new
// scanner
scanSources(dir, fs, { maxFiles?, excludePaths?, identifiers? })
// dataset
readRuntimeDataset(): { compatibilityDocs, gaps, globalGaps? }
datasetIdentifiers(dataset)
```

Everything else is unchanged; see the 0.3.x STATE snapshot in git history.

## Verification (0.4.4, local)

| Check | Result |
| --- | --- |
| `bun run check` (types, lint, tests) | green; 297 tests across 34 files |
| Coverage | see CI; new modules covered by `tests/git-changes.test.ts` and `tests/features-044.test.ts` |
| Self scan (`bun run src/cli/index.ts .`) | exit 0 |
| `--format md` self render | renders, verdict risky, sources linked |
| `--changed-only --since HEAD~5` on this repo | scans root + touched packages, exit 0 |

## Open questions

- **O2** `pre-commit` has only ever run against already-formatted trees.
- **O4** Duplicate versions are in `ScanReport.stats` but not yet a finding.
- **O8** The source walk includes `tests/`; large fixtures may want an exclude list.
- **O9** Two Dependabot PRs (codeql-action v4) fail their own security run; triage pending.

## Next action

1. Triage O9 (Dependabot/codeql-action v4).
2. Consider O4 (duplicate versions as a finding) for 0.5.0.
