export type Result<T, E = Error> = { ok: true; data: T } | { ok: false; error: E };

export interface ResultError<T> {
  ok: false;
  error: T;
}

export interface ResultOk<T> {
  ok: true;
  data: T;
}

export const ok = <T, E>(data: T): Result<T, E> => ({ ok: true, data });

export const okVoid = <E>(): Result<void, E> => ({ ok: true, data: undefined });

export const err = <E = Error>(error: E): ResultError<E> => ({
  ok: false,
  error,
});

export enum StorageErrorCode {
  Unknown = "unknown",
  /** No Pramaan key is configured: file storage cannot run at all. */
  NotConfigured = "not_configured",
  /** The storage service could not be reached; try again later. */
  Unavailable = "unavailable",
  FileNotFoundError = "file_not_found_error",
  InvalidInput = "invalid_input",
}

export interface StorageError {
  code: StorageErrorCode;
}
