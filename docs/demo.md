# 30-second demo

The GIF this script produces is **not** committed here: it is recorded from the
real binary, never mocked up: every output below is real. This file is the
shot list and the exact commands.

## Preconditions

```sh
bun install
bun run src/cli/index.ts --version   # prints: bunready 0.3.4
```

Recording: 1200x700, 30fps, ~14s of content cut to a 30s budget, no fake
typing pauses. Terminal font 16px, dark theme with a light-theme counterpart
shot, `NO_COLOR` shot last.

## Shot list

| # | Duration | Terminal command | What the viewer must see |
| --- | --- | --- | --- |
| 1 | 3s | `bunready --help` | The positioning line, the exit-code table, the disclaimer. |
| 2 | 6s | `cd ~/code/some-node-service && bunready .` | The human table: findings grouped blocker / risk / info. |
| 3 | 4s | same, scrolled to the verdict | The single verdict line and the non-zero exit code. |
| 4 | 5s | `bunready . --json \| head -40` | The same findings as JSON, stable field names. |
| 5 | 4s | `bunready --run .` | The **first** real failure and its stack trace. |
| 6 | 3s | `NO_COLOR=1 bunready .` | Plain text, identical information, still a real verdict. |
| 7 | 5s | `bunready . ; echo "exit=$?"` | The exit code CI depends on. |

Total: 30s. No cuts inside a command; no invented output.

## Target repo for the recording

Pick a real repository with at least one native dependency and one blocked
lifecycle script, so every severity is genuinely present. Record its commit SHA
in the GIF description.
