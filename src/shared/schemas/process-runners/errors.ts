import { Schema as S } from "effect";

/**
 * Process Runner IPC Error Schemas
 * These are the error types that can cross the main/renderer boundary
 */

export class ProcessError extends S.TaggedError<ProcessError>("ProcessError")(
  "ProcessError",
  {
    message: S.String,
    processId: S.optional(S.String),
    pid: S.optional(S.Number),
  },
) {}

export class RunnerNotFoundError extends S.TaggedError<RunnerNotFoundError>(
  "RunnerNotFoundError",
)("RunnerNotFoundError", {
  message: S.String,
  runnerId: S.String,
}) {}

export class RunnerOperationError extends S.TaggedError<RunnerOperationError>(
  "RunnerOperationError",
)("RunnerOperationError", {
  message: S.String,
  runnerId: S.optional(S.String),
  operation: S.String, // 'create', 'start', 'stop', etc.
}) {}

export class TmuxError extends S.TaggedError<TmuxError>("TmuxError")(
  "TmuxError",
  {
    message: S.String,
    sessionName: S.optional(S.String),
  },
) {}

/**
 * Union of all Process Runner IPC errors
 */
export type ProcessRunnerIpcError =
  | ProcessError
  | RunnerNotFoundError
  | RunnerOperationError
  | TmuxError;

// Backwards compatibility alias for Phase B
export type AiRunnerIpcError = ProcessRunnerIpcError;
