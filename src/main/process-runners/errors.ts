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
 * Process Runner-related errors
 */

export class ProcessRunnerCreateError extends Data.TaggedError('ProcessRunnerCreateError')<{
  message: string
  config: {
    type: string
    name?: string
  }
  cause?: unknown
}> {}

export class ProcessRunnerStartError extends Data.TaggedError('ProcessRunnerStartError')<{
  message: string
  runnerId: string
  cause?: unknown
}> {}

export class ProcessRunnerStopError extends Data.TaggedError('ProcessRunnerStopError')<{
  message: string
  runnerId: string
  cause?: unknown
}> {}

export class RunnerNotFoundError extends Data.TaggedError('RunnerNotFoundError')<{
  message: string
  runnerId: string
}> {}

// Backwards compatibility aliases (for IPC error mapper during Phase A)
export const AiRunnerCreateError = ProcessRunnerCreateError
export const AiRunnerStartError = ProcessRunnerStartError
export const AiRunnerStopError = ProcessRunnerStopError
export const AiRunnerNotFoundError = RunnerNotFoundError

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

export type ProcessRunnerError =
  | ProcessRunnerCreateError
  | ProcessRunnerStartError
  | ProcessRunnerStopError
  | RunnerNotFoundError

// Backwards compatibility alias
export type AiRunnerError = ProcessRunnerError

export type TmuxError = TmuxSessionNotFoundError | TmuxCommandError

export type AllProcessRunnerDomainErrors = ProcessError | ProcessRunnerError | TmuxError | ProviderNotRegisteredError

// Backwards compatibility alias
export type AllAiRunnerDomainErrors = AllProcessRunnerDomainErrors
