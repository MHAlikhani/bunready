# ADR 0001 - Compatibility data source policy

- **Status:** accepted
- **Date:** 2026-09-15
- **Context:** `bunready`'s only value is that its verdict can be trusted.

## Decision

Compatibility claims ship as versioned JSON in `src/rules/data/`, and every
entry carries `source`, a link to the public Bun documentation or issue that
establishes the claim. The dataset records the Bun version range it was
validated against.

Rules may also report **observed facts about the scanned repository** (a native
addon is present, a lifecycle script exists, an import resolves to a Node
built-in). Those need no external source: the evidence is the repo itself and is
printed with the finding.

If a claim has neither a source link nor repo evidence, it does not ship.

## Consequences

- The dataset is reviewable: a reviewer can open every link.
- Adding a rule requires a source, which keeps rule authorship slow on purpose.
- The dataset is versioned with the code; the report states which dataset
  version produced the verdict, so an old verdict stays explainable.

## Rejected alternatives

- **Bundling an upstream compatibility list without links.** Unverifiable, ages
  badly, and makes us the authority on someone else's runtime.
- **Asking the network at scan time.** `bunready` must work offline and must
  never phone home. Data is vendored, not fetched.
- **Inferring compatibility from package metadata alone.** Would produce
  confident-sounding guesses; the guardrail is "never invent compatibility
  facts".
