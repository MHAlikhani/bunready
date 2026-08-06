#!/usr/bin/env bun
import { run } from "./run";

// Exit through exitCode, not process.exit(): pending stdout writes must flush.
process.exitCode = await run(process.argv.slice(2));
