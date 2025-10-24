import { Schema as S } from 'effect'
import { AccountId, ProviderType } from '../account-context'

/**
 * Branded identifier for a git command execution.
 */
export const GitCommandId = S.UUID.pipe(S.brand('GitCommandId'))
export type GitCommandId = S.Schema.Type<typeof GitCommandId>

/**
 * Supported subprocess stdio modes.
 */
export const GitCommandStdioMode = S.Literal('pipe', 'inherit')
export type GitCommandStdioMode = S.Schema.Type<typeof GitCommandStdioMode>

/**
 * Normalised environment variable pair to keep Schemas serialisable.
 */
export class GitCommandEnvironmentVariable extends S.Class<GitCommandEnvironmentVariable>(
  'GitCommandEnvironmentVariable'
)({
  name: S.String,
  value: S.String,
}) {}

/**
 * Repository/worktree context associated with a command.
 */
export class GitWorktreeContext extends S.Class<GitWorktreeContext>(
  'GitWorktreeContext'
)({
  repositoryPath: S.String,
  accountId: S.optional(AccountId),
  provider: S.optional(ProviderType),
}) {}

/**
 * Canonical request for executing a git command.
 * The `binary` field defaults to `git` but remains configurable for future adapters.
 */
export class GitCommandRequest extends S.Class<GitCommandRequest>(
  'GitCommandRequest'
)({
  id: GitCommandId,
  binary: S.optionalWith(S.String, () => 'git'),
  args: S.Array(S.String),
  worktree: GitWorktreeContext,
  environment: S.optional(S.Array(GitCommandEnvironmentVariable)),
  stdio: S.optionalWith(GitCommandStdioMode, () => 'pipe'),
  timeoutMs: S.optional(S.Number.pipe(S.greaterThanOrEqualTo(0))),
  allowInteractive: S.optionalWith(S.Boolean, () => false),
}) {}

/**
 * Normalised event stream emitted while the command is executing.
 * Consumers should rely on Schema.decode (parse) to coerce serialized payloads.
 */
export const GitCommandEvent = S.Union(
  S.Struct({
    _tag: S.Literal('Started'),
    commandId: GitCommandId,
    startedAt: S.Date,
    binary: S.String,
    args: S.Array(S.String),
    cwd: S.String,
  }),
  S.Struct({
    _tag: S.Literal('StdoutChunk'),
    commandId: GitCommandId,
    data: S.String,
    timestamp: S.Date,
  }),
  S.Struct({
    _tag: S.Literal('StderrChunk'),
    commandId: GitCommandId,
    data: S.String,
    timestamp: S.Date,
  }),
  S.Struct({
    _tag: S.Literal('Heartbeat'),
    commandId: GitCommandId,
    timestamp: S.Date,
  }),
  S.Struct({
    _tag: S.Literal('Exited'),
    commandId: GitCommandId,
    exitCode: S.Number,
    endedAt: S.Date,
  }),
  S.Struct({
    _tag: S.Literal('Failed'),
    commandId: GitCommandId,
    error: S.Struct({
      message: S.String,
      cause: S.optional(S.String),
    }),
    failedAt: S.Date,
  })
)
export type GitCommandEvent = S.Schema.Type<typeof GitCommandEvent>

/**
 * Summary produced when a command finishes or fails.
 */
export class GitCommandResult extends S.Class<GitCommandResult>(
  'GitCommandResult'
)({
  commandId: GitCommandId,
  exitCode: S.optional(S.Number),
  status: S.Literal('success', 'failure', 'cancelled'),
  startedAt: S.Date,
  completedAt: S.optional(S.Date),
  durationMs: S.optional(S.Number),
  stdout: S.optional(S.String),
  stderr: S.optional(S.String),
}) {}
