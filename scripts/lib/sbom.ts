/**
 * Release artifact metadata.
 *
 * Pure functions only, so the SBOM shape is tested rather than trusted. The CLI
 * wrapper lives in `scripts/generate-sbom.ts`.
 *
 * We emit CycloneDX because it is the format GitHub's dependency graph and most
 * scanners already understand, and because a release nobody can audit is just a
 * tarball with good manners.
 */

export interface SbomInputComponent {
  readonly name: string;
  readonly version: string;
}

export interface SbomInput {
  readonly name: string;
  readonly version: string;
  readonly timestamp: string;
  readonly components: readonly SbomInputComponent[];
}

export interface SbomComponent {
  readonly type: "library";
  readonly name: string;
  readonly version: string;
  readonly purl: string;
}

export interface Sbom {
  readonly bomFormat: "CycloneDX";
  readonly specVersion: "1.5";
  readonly version: number;
  readonly metadata: {
    readonly timestamp: string;
    readonly tools: readonly {
      readonly vendor: string;
      readonly name: string;
      readonly version: string;
    }[];
    readonly component: {
      readonly type: "application";
      readonly name: string;
      readonly version: string;
      readonly purl: string;
    };
  };
  readonly components: readonly SbomComponent[];
}

/** Package URL for an npm package. Scoped names keep the CycloneDX encoding. */
export function purlFor(name: string, version: string): string {
  const encoded = name.startsWith("@") ? `%40${name.slice(1)}` : name;
  return `pkg:npm/${encoded}@${version}`;
}

export function buildSbom(input: SbomInput): Sbom {
  const components: SbomComponent[] = [...input.components]
    .sort((a, b) =>
      a.name === b.name ? a.version.localeCompare(b.version) : a.name.localeCompare(b.name),
    )
    .map((component) => ({
      type: "library",
      name: component.name,
      version: component.version,
      purl: purlFor(component.name, component.version),
    }));

  return {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    version: 1,
    metadata: {
      timestamp: input.timestamp,
      tools: [{ vendor: "bunready", name: "scripts/generate-sbom.ts", version: input.version }],
      component: {
        type: "application",
        name: input.name,
        version: input.version,
        purl: purlFor(input.name, input.version),
      },
    },
    components,
  };
}
