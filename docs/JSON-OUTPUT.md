# JSON output

`bunready <path> --json` writes a `ScanReport` to stdout and nothing else, so it
can be piped straight into `jq` or a CI step.

```jsonc
{
  "schemaVersion": 1,          // bumped only for a breaking change
  "failOn": "blocker",         // the threshold that decides the exit code
  "tool": "bunready",
  "version": "0.3.4",
  "target": "/path/to/repo",
  "verdict": "blocked",        // ready | risky | blocked
  "counts": { "blocker": 1, "risk": 0, "info": 1 },
  "findings": [
    {
      "id": "install/lifecycle-script",  // stable rule id
      "severity": "blocker",             // blocker | risk | info
      "title": "…",
      "detail": "…",
      "package": "sharp",                // present when the finding is about one dependency
      "evidence": "…",                   // what was observed, never a guess
      "hint": "…",                       // the next step
      "source": "https://bun.com/docs/pm/lifecycle"  // required for compat claims
    }
  ],
  "stats": { "…": "what the scan looked at" },
  "run": { "script": "test", "exitCode": 0 }  // only with --run
}
```

### Additive fields

Fields are added without bumping `schemaVersion`; CI that pins on the version
only breaks on renames or removals. Current optional fields: `stats.builtinNames`
(the distinct Node built-ins the project's own code imports, sorted), `targets`,
`baseline`, `run`.

## Compatibility

`schemaVersion` is the contract. A patch or minor release of bunready never
changes the meaning of an existing field; a field may be added, and consumers
should ignore unknown fields. A rename or removal bumps `schemaVersion`.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Nothing at or above `failOn`. |
| `1` | At least one finding at or above `failOn`. |
| `2` | Usage error, or the scan could not complete (no `--json` is written in this case). |

## Machine-readable variants

- `--json` - this document.
- `--sarif` - SARIF 2.1.0 for code-scanning upload. The two are mutually
  exclusive; passing both is a usage error rather than an ambiguous stream.
