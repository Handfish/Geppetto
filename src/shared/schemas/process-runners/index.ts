import { Schema as S } from 'effect'

/**
 * AI agent types supported by the system
 */
export const AiAgentType = S.Literal('claude-code', 'codex', 'cursor', 'custom')
export type AiAgentType = S.Schema.Type<typeof AiAgentType>

/**
 * Process Runner status - lifecycle states of a process runner
 */
export const ProcessRunnerStatus = S.Literal('starting', 'running', 'idle', 'stopped', 'errored')
export type ProcessRunnerStatus = S.Schema.Type<typeof ProcessRunnerStatus>

// Backwards compatibility alias for Phase B
export const AiWatcherStatus = ProcessRunnerStatus
export type AiWatcherStatus = ProcessRunnerStatus

/**
 * Process handle - represents a process being monitored
 */
export class ProcessHandle extends S.Class<ProcessHandle>('ProcessHandle')({
  id: S.String,
  pid: S.Number,
  type: S.Literal('spawned', 'attached'),
  startedAt: S.Date,
}) {}

/**
 * Process Runner configuration (for IPC input)
 */
export class ProcessRunnerConfig extends S.Class<ProcessRunnerConfig>('ProcessRunnerConfig')({
  type: AiAgentType,
  name: S.optional(S.String),
  workingDirectory: S.String,
  env: S.optional(S.Record({ key: S.String, value: S.String })),
  command: S.optional(S.String), // Custom command for 'custom' type
  args: S.optional(S.Array(S.String)), // Custom args for 'custom' type
}) {}

// Backwards compatibility alias for Phase B
export const AiWatcherConfig = ProcessRunnerConfig

/**
 * Process Runner - represents a monitored process instance
 */
export class ProcessRunner extends S.Class<ProcessRunner>('ProcessRunner')({
  id: S.String,
  name: S.String,
  type: AiAgentType,
  processHandle: ProcessHandle,
  status: ProcessRunnerStatus,
  config: ProcessRunnerConfig,
  createdAt: S.Date,
  lastActivityAt: S.Date,
}) {}

// Backwards compatibility alias for Phase B
export const AiWatcher = ProcessRunner

/**
 * Log entry for process runner logs
 */
export class LogEntry extends S.Class<LogEntry>('LogEntry')({
  timestamp: S.Date,
  level: S.Literal('info', 'error', 'debug', 'stdout', 'stderr'),
  message: S.String,
  runnerId: S.String,
}) {}

// Backwards compatibility: also accept watcherId
export const LogEntryCompat = S.Class<any>('LogEntry')({
  timestamp: S.Date,
  level: S.Literal('info', 'error', 'debug', 'stdout', 'stderr'),
  message: S.String,
  watcherId: S.optional(S.String),
  runnerId: S.optional(S.String),
})

/**
 * Tmux session information
 */
export class TmuxSession extends S.Class<TmuxSession>('TmuxSession')({
  name: S.String,
  attached: S.Boolean,
  created: S.Date,
  sessionId: S.optional(S.String),
}) {}
