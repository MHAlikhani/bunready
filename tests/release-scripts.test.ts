import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatChecksums, sha256OfFile } from "../scripts/lib/checksums";
import { buildSbom, purlFor } from "../scripts/lib/sbom";

describe("purlFor", () => {
  test("plain and scoped packages follow the CycloneDX encoding", () => {
    expect(purlFor("zod", "3.23.8")).toBe("pkg:npm/zod@3.23.8");
    expect(purlFor("@scope/pkg", "1.2.3")).toBe("pkg:npm/%40scope/pkg@1.2.3");
  });
});

describe("buildSbom", () => {
  const sbom = buildSbom({
    name: "bunready",
    version: "0.1.0",
    timestamp: "2026-08-25T00:00:00.000Z",
    components: [
      { name: "zod", version: "3.23.8" },
      { name: "@scope/pkg", version: "1.2.3" },
      { name: "typescript", version: "5.9.3" },
    ],
  });

  test("declares CycloneDX 1.5 with the tool as the root component", () => {
    expect(sbom.bomFormat).toBe("CycloneDX");
    expect(sbom.specVersion).toBe("1.5");
    expect(sbom.metadata.component.purl).toBe("pkg:npm/bunready@0.1.0");
    expect(sbom.metadata.timestamp).toBe("2026-08-25T00:00:00.000Z");
  });

  test("lists every component, sorted and with a purl", () => {
    expect(sbom.components.map((component) => component.name)).toEqual([
      "@scope/pkg",
      "typescript",
      "zod",
    ]);
    for (const component of sbom.components) {
      expect(component.type).toBe("library");
      expect(component.purl.startsWith("pkg:npm/")).toBe(true);
      expect(component.purl.endsWith(`@${component.version}`)).toBe(true);
    }
  });

  test("is serialisable JSON", () => {
    expect(() => JSON.stringify(sbom)).not.toThrow();
  });
});

describe("sha256OfFile", () => {
  test("matches the known digest of the bytes on disk", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bunready-sums-"));
    const file = join(dir, "artifact.bin");
    await writeFile(file, "abc", "utf8");

    try {
      // The canonical SHA-256 of "abc".
      expect(await sha256OfFile(file)).toBe(
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("formatChecksums", () => {
  test("emits sha256sum-compatible lines, sorted, with a trailing newline", () => {
    const text = formatChecksums([
      { name: "b-binary", hash: "bbbb" },
      { name: "a-binary", hash: "aaaa" },
    ]);
    expect(text).toBe("aaaa  a-binary\nbbbb  b-binary\n");
  });
});
