import { Schema as S } from 'effect'

/**
 * AI Watcher IPC Error Schemas
 * These are the error types that can cross the main/renderer boundary
 */

export class ProcessError extends S.TaggedError<ProcessError>('ProcessError')(
  'ProcessError',
  {
    message: S.String,
    processId: S.optional(S.String),
    pid: S.optional(S.Number),
  }
) {}

export class WatcherNotFoundError extends S.TaggedError<WatcherNotFoundError>(
  'WatcherNotFoundError'
)('WatcherNotFoundError', {
  message: S.String,
  watcherId: S.String,
}) {}

export class WatcherOperationError extends S.TaggedError<WatcherOperationError>(
  'WatcherOperationError'
)('WatcherOperationError', {
  message: S.String,
  watcherId: S.optional(S.String),
  operation: S.String, // 'create', 'start', 'stop', etc.
}) {}

export class TmuxError extends S.TaggedError<TmuxError>('TmuxError')(
  'TmuxError',
  {
    message: S.String,
    sessionName: S.optional(S.String),
  }
) {}

/**
 * Union of all AI Watcher IPC errors
 */
export type AiWatcherIpcError =
  | ProcessError
  | WatcherNotFoundError
  | WatcherOperationError
  | TmuxError
