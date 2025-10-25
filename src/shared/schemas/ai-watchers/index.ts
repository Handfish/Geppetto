import { Schema as S } from 'effect'

/**
 * AI agent types supported by the system
 */
export const AiAgentType = S.Literal('claude-code', 'codex', 'cursor', 'custom')
export type AiAgentType = S.Schema.Type<typeof AiAgentType>

/**
 * Watcher status - lifecycle states of an AI watcher
 */
export const AiWatcherStatus = S.Literal('starting', 'running', 'idle', 'stopped', 'errored')
export type AiWatcherStatus = S.Schema.Type<typeof AiWatcherStatus>

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
 * AI watcher configuration (for IPC input)
 */
export class AiWatcherConfig extends S.Class<AiWatcherConfig>('AiWatcherConfig')({
  type: AiAgentType,
  name: S.optional(S.String),
  workingDirectory: S.String,
  env: S.optional(S.Record({ key: S.String, value: S.String })),
  command: S.optional(S.String), // Custom command for 'custom' type
  args: S.optional(S.Array(S.String)), // Custom args for 'custom' type
}) {}

/**
 * AI watcher - represents a monitored AI agent instance
 */
export class AiWatcher extends S.Class<AiWatcher>('AiWatcher')({
  id: S.String,
  name: S.String,
  type: AiAgentType,
  processHandle: ProcessHandle,
  status: AiWatcherStatus,
  createdAt: S.Date,
  lastActivityAt: S.Date,
}) {}

/**
 * Log entry for AI watcher logs
 */
export class LogEntry extends S.Class<LogEntry>('LogEntry')({
  timestamp: S.Date,
  level: S.Literal('info', 'error', 'debug', 'stdout', 'stderr'),
  message: S.String,
  watcherId: S.String,
}) {}

/**
 * Tmux session information
 */
export class TmuxSession extends S.Class<TmuxSession>('TmuxSession')({
  name: S.String,
  attached: S.Boolean,
  created: S.Date,
  sessionId: S.optional(S.String),
}) {}
