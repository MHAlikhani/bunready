# ADR 0003 - Release pipeline

- **Status:** accepted
- **Date:** 2026-08-27
- **Context:** bunready is a CLI that people will run on their own machines, so
  "trust the release" has to be something a stranger can verify, not a promise.

## Decision

A release is a tag. Pushing `v*` starts `.github/workflows/release.yml`, which:

1. **Asserts CI is green on the tagged commit.** A tag can point at anything, so
   the pipeline queries the `ci` workflow for a successful run on exactly that
   SHA and refuses to continue otherwise.
2. **Publishes to npm with provenance** using OIDC (`id-token: write`) instead of
   a long-lived `NPM_TOKEN`. npm signs a statement that the published bytes came
   from this repository at this commit, verifiable on the registry.
3. **Builds a compiled binary per platform** (`bun build --compile` for
   linux-x64, darwin-arm64, windows-x64) and smoke-tests each one by running
   `--version` before it is allowed to become an artifact. An unsigned binary
   that does not run is not a release artifact.
4. **Publishes an SBOM and checksums.** `dist/bom.json` is CycloneDX 1.5,
   generated from `bun.lock` with bunready's own parser; `dist/SHA256SUMS` uses
   the `sha256sum` format so verification needs no special tooling.

Every action is pinned to a commit SHA. The only job with write access to the
repository is the one attaching files to the release; only the publish job can
mint an OIDC token.

## Consequences

- There is no npm token in this repository to leak or rotate.
- The first release requires one manual step outside the repository: registering
  the trusted publisher on npmjs.com (recorded as O10 in STATE.md). Until that is
  done, the publish job fails closed rather than publishing anonymously.
- Binaries are unsigned. Users on macOS and Windows will see the usual warnings;
  code signing is deliberately out of scope for now.
- The SBOM inherits the lockfile parser's correctness. That is intentional: the
  same parser produces the scanner's dependency graph, so a parser bug shows up
  in both places instead of hiding in one.

## Rejected alternatives

- **Publish on every push to main.** No review point, and a bad commit becomes a
  bad published version with no way back.
- **A long-lived `NPM_TOKEN` secret.** Simplest to set up and the most valuable
  thing in the repository to steal.
- **Ship TypeScript only.** The `bin` needs a runtime with TypeScript support;
  compiled binaries are what a user with no Bun installed can actually try.
- **A hand-written Release notes file.** `--generate-notes` keeps the changelog
  in the commits, where CI already enforces its shape.
