import * as S from '@effect/schema/Schema'

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
 * Process event types - events emitted during process monitoring
 */
export class ProcessEvent extends S.Class<ProcessEvent>('ProcessEvent')({
  type: S.Literal('stdout', 'stderr', 'exit', 'error', 'silence'),
  data: S.optional(S.String),
  timestamp: S.Date,
  processId: S.optional(S.String),
}) {}

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
 * AI watcher configuration
 */
export class AiWatcherConfig extends S.Class<AiWatcherConfig>('AiWatcherConfig')({
  type: AiAgentType,
  name: S.optional(S.String),
  workingDirectory: S.String,
  env: S.optional(S.Record(S.String, S.String)),
  command: S.optional(S.String), // Custom command for 'custom' type
  args: S.optional(S.Array(S.String)), // Custom args for 'custom' type
  processHandle: S.optional(ProcessHandle), // For attaching to existing processes
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
  config: AiWatcherConfig,
  createdAt: S.Date,
  lastActivityAt: S.Date,
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
 * Watcher statistics
 */
export class WatcherStats extends S.Class<WatcherStats>('WatcherStats')({
  watcherId: S.String,
  totalEvents: S.Number,
  lastEventAt: S.optional(S.Date),
  uptime: S.Number, // seconds
  idleTime: S.Number, // seconds since last activity
}) {}
