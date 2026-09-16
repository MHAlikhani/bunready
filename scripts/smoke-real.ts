/**
 * Real-project smoke test: downloads well-known repository templates and runs
 * the bunready scan against each, printing the verdict and finding counts.
 *
 * This is deliberately NOT part of CI - it downloads from the network and its
 * subjects change upstream. Run it before a release:
 *
 *   bun run smoke
 *
 * Exit code 0 as long as every scan completes (any verdict is fine); a crash
 * or an exit code above 1 from bunready fails the script.
 */
import { $ } from "bun";

const CLI = import.meta.dir.replace(/\\/g, "/") + "/../src/cli/index.ts";
const WORK = ".smoke-tmp";

const SUBJECTS: { name: string; label: string; tarball: string; subdirectory?: string }[] = [
  {
    name: "next-app",
    label: "Next.js (vercel/next.js examples/hello-world)",
    tarball: "https://codeload.github.com/vercel/next.js/tar.gz/refs/heads/canary",
    subdirectory: "examples/hello-world",
  },
  {
    name: "nest",
    label: "NestJS (nestjs/typescript-starter)",
    tarball: "https://codeload.github.com/nestjs/typescript-starter/tar.gz/refs/heads/master",
  },
  {
    name: "turborepo-basic",
    label: "monorepo (vercel/turborepo examples/basic)",
    tarball: "https://codeload.github.com/vercel/turborepo/tar.gz/refs/heads/main",
    subdirectory: "examples/basic",
  },
];

await $`rm -rf ${WORK} && mkdir -p ${WORK}`;
let failed = false;

for (const subject of SUBJECTS) {
  console.log(`\n== ${subject.label}`);
  const dest = `${WORK}/${subject.name}`;
  try {
    const response = await fetch(subject.tarball);
    if (!response.ok) {
      throw new Error(`download returned HTTP ${response.status}`);
    }
    await Bun.write(`${dest}.tar.gz`, response);
    if (subject.subdirectory) {
      // Extract only the example subdirectory: whole-monorepo tarballs are huge
      // and full of symlinks that fail on Windows.
      await $`mkdir -p ${dest} && tar -xzf ${dest}.tar.gz -C ${dest} --strip-components=2 --wildcards '*${subject.subdirectory}/*'`;
    } else {
      await $`mkdir -p ${dest} && tar -xzf ${dest}.tar.gz -C ${dest} --strip-components=1`;
    }
  } catch (error) {
    console.error(`   setup failed: ${error instanceof Error ? error.message : error}`);
    failed = true;
    continue;
  }
  const target = subject.subdirectory ? `${dest}/${subject.subdirectory.split("/").pop()}` : dest;
  const scan = Bun.spawnSync(["bun", "run", CLI, target, "--json"]);
  if (scan.exitCode === null || scan.exitCode > 1) {
    console.error(
      `   scan crashed (exit ${scan.exitCode}):\n${scan.stderr.toString().slice(-400)}`,
    );
    failed = true;
    continue;
  }
  try {
    const report = JSON.parse(scan.stdout.toString());
    console.log(
      `   verdict=${report.verdict}  exit=${scan.exitCode}  findings=${report.counts.blocker} blocker / ${report.counts.risk} risk / ${report.counts.info} info`,
    );
    for (const finding of report.findings.filter(
      (f: { severity: string }) => f.severity !== "info",
    )) {
      console.log(`   - [${finding.severity}] ${finding.id}: ${finding.title}`);
    }
  } catch {
    console.error(`   could not parse --json output:\n${scan.stdout.toString().slice(-400)}`);
    failed = true;
  }
}

await $`rm -rf ${WORK}`;
console.log(failed ? "\nsmoke: FAILED" : "\nsmoke: all scans completed");
process.exit(failed ? 1 : 0);
