/** Terminal seam: `run()` writes through this, never straight to `process`. */
export interface Io {
  readonly out: (line: string) => void;
  readonly err: (line: string) => void;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly isTty: boolean;
}

export function systemIo(): Io {
  return {
    out: (line) => {
      process.stdout.write(`${line}\n`);
    },
    err: (line) => {
      process.stderr.write(`${line}\n`);
    },
    env: process.env,
    isTty: process.stdout.isTTY === true,
  };
}
