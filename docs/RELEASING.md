# Releasing

Two things must be true before a release can happen, and one of them is not in
this repository.

## Prerequisites

1. **CI is green on the commit you are tagging.** The release workflow checks
   this itself and fails closed: it queries the `ci` workflow for a successful
   run on exactly that SHA. If CI is red or has not run, there is no release.
2. **Trusted publishing is configured on npmjs.com** (owner action, done once).
   Open the `@mh-alikhani/bunready` package settings on npmjs.com, add a trusted publisher
   pointing at this repository, the `release.yml` workflow file, and the `release`
   environment if you use one. Without this, the publish job fails with an
   authentication error — by design, because the alternative would be a
   long-lived token in the repository.

No `NPM_TOKEN` secret exists or is needed. Authentication is OIDC.

## Cutting a release

```sh
# 1. Make sure main is where you want it, and CI is green
gh run list --workflow ci.yml --limit 3

# 2. Bump the version and move the changelog entry out of Unreleased
#    (package.json + CHANGELOG.md), then land it through a pull request

# 3. Tag the release commit and push the tag
git tag -a v0.3.4 -m "bunready v0.3.4"
git push origin v0.3.4
```

The tag is the release. `release.yml` then:

| Step | What it does |
| --- | --- |
| `verify` | Refuses to continue unless `ci` succeeded on this SHA. |
| `binaries` | Compiles and smoke-tests `bunready-linux-x64`, `bunready-darwin-arm64`, `bunready-windows-x64.exe`. |
| `publish` | `npm publish --provenance --access public` over OIDC. |
| `release` | Generates `bom.json` (CycloneDX) and `SHA256SUMS`, then attaches all five files to the GitHub release with generated notes. |

## Verifying a release as a user

```sh
gh release download v0.3.4 --repo MHAlikhani/bunready
sha256sum -c SHA256SUMS
```

`bom.json` lists every locked package with a `purl`, so the dependency set behind
a published version can be read without cloning anything.

## Versioning

Semantic versioning. Until `1.0.0`, a minor bump means new rules, a patch bump
means fixes to existing behaviour, and any change to the CLI contract (exit
codes, `--json` fields) gets called out under `### Changed`.

## What is deliberately missing

- **Code signing.** macOS and Windows binaries are unsigned for now; users
  will see Gatekeeper and SmartScreen warnings. Signing needs certificates and a
  budget decision, not just code.
- **A coverage badge.** Auto-committing one would require write access to
  protected `main`; see D23 in STATE.md.
