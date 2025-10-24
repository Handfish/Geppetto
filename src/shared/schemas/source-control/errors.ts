import { Schema as S } from 'effect'
import { GitCommandId } from './command'

export class GitExecutableUnavailableError extends S.TaggedError<GitExecutableUnavailableError>(
  'GitExecutableUnavailableError'
)('GitExecutableUnavailableError', {
  message: S.String,
  binary: S.String,
}) {}

export class GitCommandTimeoutError extends S.TaggedError<GitCommandTimeoutError>(
  'GitCommandTimeoutError'
)('GitCommandTimeoutError', {
  commandId: GitCommandId,
  timeoutMs: S.Number,
  message: S.optional(S.String),
}) {}

export class GitCommandFailedError extends S.TaggedError<GitCommandFailedError>(
  'GitCommandFailedError'
)('GitCommandFailedError', {
  commandId: GitCommandId,
  exitCode: S.Number,
  stdout: S.optional(S.String),
  stderr: S.optional(S.String),
  message: S.optional(S.String),
}) {}

export class GitCommandSpawnError extends S.TaggedError<GitCommandSpawnError>(
  'GitCommandSpawnError'
)('GitCommandSpawnError', {
  commandId: GitCommandId,
  message: S.String,
  cause: S.optional(S.String),
}) {}

export type GitCommandDomainError =
  | GitExecutableUnavailableError
  | GitCommandTimeoutError
  | GitCommandFailedError
  | GitCommandSpawnError
