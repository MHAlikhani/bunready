# Configuration

`bunready.config.json` in the scanned repository root. Every key is optional; the
defaults are what you get when the file is absent. `--config <path>` points at a
different file, and a path that does not exist is an error rather than a silent
fallback.

```json
{
  "ignore": ["install/no-lockfile"],
  "ignorePackages": ["fsevents"],
  "nativeAllowlist": ["sharp"],
  "excludePaths": ["fixtures/"],
  "failOn": "risk",
  "run": { "script": "test", "maxCopyMegabytes": 100 }
}
```

| Key | Type | Default | Effect |
| --- | --- | --- | --- |
| `ignore` | string[] | `[]` | Drops findings by rule id, e.g. `install/no-lockfile`. |
| `ignorePackages` | string[] | `[]` | Drops findings whose `package` field names one of these dependencies. |
| `nativeAllowlist` | string[] | `[]` | Packages the native-addon rule never reports. |
| `excludePaths` | string[] | `[]` | Substring match against source paths; a match skips the file in the import scan. |
| `failOn` | `blocker` \| `risk` \| `info` | `blocker` | Lowest severity that makes the process exit `1`. |
| `run.script` | string | first of `start`, `test` | Script booted by `--run`. |
| `run.maxCopyMegabytes` | number | `250` | Refuses to copy a repository larger than this. Reported as a `risk`, never a silent skip. |

## What configuration cannot do

It cannot change what a rule *claims*. `ignore` and `ignorePackages` suppress a
finding you have decided is acceptable; they do not rewrite the evidence, and the
report still exits `0` only because you said so. That is the intended trade: the
tool stays honest about the repository, and the repository stays honest about
what it has accepted.

`failOn` is echoed in the `--json` report as `failOn`, so a CI log always shows
which threshold produced the exit code.

## Precedence

1. CLI flags (`--run-script`, `--config`)
2. `bunready.config.json` in the target
3. Built-in defaults
