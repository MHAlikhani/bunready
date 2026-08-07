# ADR 0002 - Rule severity model

- **Status:** accepted
- **Date:** 2026-08-07
- **Context:** The report has to be actionable, and CI has to be able to gate on
  it, without turning a migration into a wall of red.

## Decision

Every finding carries exactly one severity:

| Severity | Meaning | Exit code effect |
| --- | --- | --- |
| `blocker` | The target repo cannot run correctly on Bun until this is fixed. | Process exits `1`. |
| `risk` | A real hazard that needs a human judgement call; may still be fine. | No effect. |
| `info` | Context that helps the reader decide. | No effect. |

Exit codes are fixed: `0` no blockers, `1` blockers found, `2` usage error or
incomplete scan.

Severity is decided by one question: **if the user does nothing, does this break
at runtime or at install time?** Yes, and unavoidable -> `blocker`. Yes, but
conditional on how the code is used -> `risk`. No -> `info`.

Colour is presentation only. Every severity prints as a word, so `NO_COLOR`,
monochrome terminals, and log files keep the full meaning.

## Consequences

- CI gating is a one-line rule (`exit != 0`) and cannot be accidentally
  configured into a permanent failure by a `risk`.
- `blocker` is a strong claim, so the bar for assigning it is deliberately high.
- The severity of every rule must be justified against the single question above
  in review.

## Rejected alternatives

- **A numeric score.** Implies precision the model does not have, and invites
  threshold arguments instead of reading the findings.
- **`error` / `warning`.** Borrows linter vocabulary without the run-time
  meaning this tool is about.
- **Letting `risk` fail CI.** Would make the tool unusable on any real repo.
