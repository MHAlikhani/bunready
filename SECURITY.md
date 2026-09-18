# Security Policy

## Supported versions

Only the latest released version is supported; earlier releases receive no
security fixes. Report issues against the tip of `main`.

## Scope

The interesting security surface for this project is small but real:

- **Process execution.** The `--run` flag executes commands on the user's
  behalf. Treat command construction, argument quoting, and shell selection as
  security-sensitive code.
- **Data files.** Compatibility data ships as versioned JSON. Its parser must
  tolerate hostile input from a modified or compromised data file.
- **Network access.** The scanner should not need the network to reach a
  verdict. Any future network fetch must be explicit, opt-in, and documented.
- **Supply chain.** The shipped CLI must keep zero third-party runtime
  dependencies. A PR that adds one is a security review item.

Out of scope: vulnerabilities in Bun itself, and in the target repository being
scanned. Report those upstream.

## Reporting a vulnerability

Do **not** open a public issue. Use GitHub's private vulnerability reporting on
this repository ("Security" tab → "Report a vulnerability").

Please include:

- affected version or commit,
- a minimal reproduction,
- the impact you believe this has,
- any suggested fix or mitigation.

## What to expect

This is a volunteer-run project, so these are best-effort targets rather than
an SLA:

- Acknowledgement within 5 working days.
- An initial assessment within 10 working days.
- Coordinated disclosure: we will agree on a timeline with you before any
  public write-up, and credit you unless you prefer otherwise.

## Safe harbour

Good-faith security research on this project — including testing the scanner
against your own repositories — is welcome. Do not test against systems you do
not own or have permission to test.
