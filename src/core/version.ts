import packageJson from "../../package.json" with { type: "json" };

/**
 * Tool identity, in a module with no dependencies, so anything (CLI, scanner,
 * report) can read it without importing the CLI and creating a cycle.
 */
export const TOOL_NAME = "bunready";

/** The tool's own version, used in reports. */
export const TOOL_VERSION: string = packageJson.version;
