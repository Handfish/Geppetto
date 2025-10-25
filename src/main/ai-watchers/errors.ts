import { Data } from 'effect'

/**
 * Process-related errors
 */

export class ProcessSpawnError extends Data.TaggedError('ProcessSpawnError')<{
  message: string
  command: string
  args: string[]
  cause?: unknown
}> {}

export class ProcessAttachError extends Data.TaggedError('ProcessAttachError')<{
  message: string
  pid: number
  cause?: unknown
}> {}

export class ProcessMonitorError extends Data.TaggedError('ProcessMonitorError')<{
  message: string
  processId: string
  cause?: unknown
}> {}

export class ProcessKillError extends Data.TaggedError('ProcessKillError')<{
  message: string
  processId: string
  pid: number
  cause?: unknown
}> {}

export class ProcessNotFoundError extends Data.TaggedError('ProcessNotFoundError')<{
  message: string
  processId: string
}> {}

/**
 * AI Watcher-related errors
 */

export class AiWatcherCreateError extends Data.TaggedError('AiWatcherCreateError')<{
  message: string
  config: {
    type: string
    name?: string
  }
  cause?: unknown
}> {}

export class AiWatcherStartError extends Data.TaggedError('AiWatcherStartError')<{
  message: string
  watcherId: string
  cause?: unknown
}> {}

export class AiWatcherStopError extends Data.TaggedError('AiWatcherStopError')<{
  message: string
  watcherId: string
  cause?: unknown
}> {}

export class WatcherNotFoundError extends Data.TaggedError('WatcherNotFoundError')<{
  message: string
  watcherId: string
}> {}

/**
 * Tmux-related errors
 */

export class TmuxSessionNotFoundError extends Data.TaggedError('TmuxSessionNotFoundError')<{
  message: string
  sessionName: string
}> {}

export class TmuxCommandError extends Data.TaggedError('TmuxCommandError')<{
  message: string
  command: string
  cause?: unknown
}> {}

/**
 * Provider-related errors
 */

export class ProviderNotRegisteredError extends Data.TaggedError('ProviderNotRegisteredError')<{
  message: string
  providerType: string
}> {}

/**
 * Type unions for error handling
 */

export type ProcessError =
  | ProcessSpawnError
  | ProcessAttachError
  | ProcessMonitorError
  | ProcessKillError
  | ProcessNotFoundError

export type AiWatcherError =
  | AiWatcherCreateError
  | AiWatcherStartError
  | AiWatcherStopError
  | WatcherNotFoundError

export type TmuxError = TmuxSessionNotFoundError | TmuxCommandError

export type AllAiWatcherDomainErrors = ProcessError | AiWatcherError | TmuxError | ProviderNotRegisteredError
