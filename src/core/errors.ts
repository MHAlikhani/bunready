/**
 * Typed error model.
 *
 * bunready never throws across module boundaries. Every fallible operation
 * returns a `Result`, and every failure carries enough context for the CLI to
 * say what happened *and* what the user can do about it.
 */

/** Stable, machine-readable failure codes. Never reuse or renumber one. */
export type ErrorCode = "E_USAGE" | "E_IO" | "E_PARSE" | "E_UNSUPPORTED" | "E_INTERNAL";

/** A failure a caller can render, report, or recover from. */
export interface BunreadyError {
  readonly code: ErrorCode;
  readonly message: string;
  /** Concrete next step for the user. Optional in the type, preferred in practice. */
  readonly hint?: string;
  /** Original failure, kept for debugging. Never printed by default. */
  readonly cause?: unknown;
}

/** A successful result. */
export type Ok<T> = { readonly ok: true; readonly value: T };
/** A failed result carrying an error. */
export type Err = { readonly ok: false; readonly error: BunreadyError };

/** Success or failure. Errors are values here, not control flow. */
export type Result<T> = Ok<T> | Err;

/** Wraps a value in a successful result. */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/** Wraps an error in a failed result. */
export function err<T = never>(error: BunreadyError): Result<T> {
  return { ok: false, error };
}

/** Narrows a result to its success case. */
export function isOk<T>(result: Result<T>): result is Ok<T> {
  return result.ok;
}

/** Narrows a result to its failure case. */
export function isErr<T>(result: Result<T>): result is Err {
  return !result.ok;
}

/** Build an error without ever assigning an explicit `undefined` optional field. */
export function defineError(
  code: ErrorCode,
  message: string,
  options: { readonly hint?: string; readonly cause?: unknown } = {},
): BunreadyError {
  const base: BunreadyError = { code, message };
  const withHint = options.hint === undefined ? base : { ...base, hint: options.hint };
  return options.cause === undefined ? withHint : { ...withHint, cause: options.cause };
}

/** One-line-first rendering used by the CLI. */
export function formatError(error: BunreadyError): string {
  const head = `${error.code}: ${error.message}`;
  return error.hint === undefined ? head : `${head}\n  hint: ${error.hint}`;
}
