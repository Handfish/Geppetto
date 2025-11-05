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
 * Process Runner status - lifecycle states of a process runner
 */
export const ProcessRunnerStatus = S.Literal('starting', 'running', 'idle', 'stopped', 'errored')
export type ProcessRunnerStatus = S.Schema.Type<typeof ProcessRunnerStatus>

// Backwards compatibility alias
export const AiRunnerStatus = ProcessRunnerStatus
export type AiRunnerStatus = ProcessRunnerStatus

/**
 * Process Runner configuration
 */
export class ProcessRunnerConfig extends S.Class<ProcessRunnerConfig>('ProcessRunnerConfig')({
  type: AiAgentType,
  name: S.optional(S.String),
  workingDirectory: S.String,
  env: S.optional(S.Record({ key: S.String, value: S.String })),
  command: S.optional(S.String), // Custom command for 'custom' type
  args: S.optional(S.Array(S.String)), // Custom args for 'custom' type
  processHandle: S.optional(ProcessHandle), // For attaching to existing processes
  issueContext: S.optional(
    S.Struct({
      owner: S.String,
      repo: S.String,
      issueNumber: S.Number,
      issueTitle: S.String,
    })
  ), // GitHub issue context when runner is launched from issue
}) {}

// Backwards compatibility alias
export const AiRunnerConfig = ProcessRunnerConfig

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

// Backwards compatibility alias
export const AiRunner = ProcessRunner

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
 * Log entry for process runner logs
 */
export class LogEntry extends S.Class<LogEntry>('LogEntry')({
  timestamp: S.Date,
  level: S.Literal('info', 'error', 'debug', 'stdout', 'stderr'),
  message: S.String,
  runnerId: S.String,
}) {}

/**
 * Runner statistics
 */
export class RunnerStats extends S.Class<RunnerStats>('RunnerStats')({
  runnerId: S.String,
  totalEvents: S.Number,
  lastEventAt: S.optional(S.Date),
  uptime: S.Number, // seconds
  idleTime: S.Number, // seconds since last activity
}) {}
