import { describe, expect, test } from "bun:test";
import { buildGraph, knownPackageNames } from "../src/scanner/graph";
import { parseLockfile } from "../src/scanner/lockfile";
import { parseManifest } from "../src/scanner/manifest";

const MANIFEST = JSON.stringify({
  dependencies: { sharp: "^0.32.0", "left-pad": "^1.3.0" },
  devDependencies: { typescript: "^5" },
  optionalDependencies: { fsevents: "^2" },
  peerDependencies: { react: "^18" },
});

const NPM_LOCK = JSON.stringify({
  lockfileVersion: 3,
  packages: {
    "": { name: "app" },
    "node_modules/sharp": { version: "0.32.6" },
    "node_modules/left-pad": { version: "1.3.0" },
    "node_modules/dup": { version: "1.0.0" },
    "node_modules/a/node_modules/dup": { version: "2.0.0" },
  },
});

function manifest() {
  const result = parseManifest(MANIFEST, "package.json");
  if (!result.ok) {
    throw new Error("fixture manifest is invalid");
  }
  return result.value;
}

function lockfile() {
  const result = parseLockfile("npm", NPM_LOCK);
  if (!result.ok) {
    throw new Error("fixture lockfile is invalid");
  }
  return result.value;
}

describe("buildGraph", () => {
  test("separates direct, dev, optional and peer dependencies", () => {
    const graph = buildGraph(manifest(), lockfile());
    expect(graph.direct).toEqual(["left-pad", "sharp"]);
    expect(graph.dev).toEqual(["typescript"]);
    expect(graph.optional).toEqual(["fsevents"]);
    expect(graph.peer).toEqual(["react"]);
  });

  test("counts locked packages and reports duplicate versions", () => {
    const graph = buildGraph(manifest(), lockfile());
    expect(graph.lockedPackages).toBe(4);
    expect(graph.lockedNames).toBe(3);
    expect(graph.duplicates).toEqual([{ name: "dup", versions: ["1.0.0", "2.0.0"] }]);
  });

  test("works without a lockfile", () => {
    const graph = buildGraph(manifest(), undefined);
    expect(graph.lockedPackages).toBe(0);
    expect(graph.duplicates).toEqual([]);
    expect(graph.direct).toEqual(["left-pad", "sharp"]);
  });
});

describe("knownPackageNames", () => {
  test("unions the manifest and the lockfile", () => {
    const graph = buildGraph(manifest(), lockfile());
    const names = knownPackageNames(graph, lockfile());
    for (const expected of ["sharp", "left-pad", "typescript", "fsevents", "react", "dup"]) {
      expect(names.has(expected)).toBe(true);
    }
  });
});
