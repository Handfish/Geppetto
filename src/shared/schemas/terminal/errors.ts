import { Schema as S } from 'effect'

/**
 * Terminal-specific errors for IPC communication
 */

export class TerminalError extends S.Class<TerminalError>('TerminalError')({
  _tag: S.Literal('TerminalError'),
  reason: S.Literal('ProcessNotFound', 'SpawnFailed', 'AlreadyRunning', 'PermissionDenied'),
  message: S.String,
}) {}

export class ProcessNotFoundError extends S.Class<ProcessNotFoundError>('ProcessNotFoundError')({
  _tag: S.Literal('ProcessNotFoundError'),
  processId: S.String,
  message: S.String,
}) {}

export class SpawnFailedError extends S.Class<SpawnFailedError>('SpawnFailedError')({
  _tag: S.Literal('SpawnFailedError'),
  command: S.String,
  message: S.String,
}) {}

export class ProcessAlreadyRunningError extends S.Class<ProcessAlreadyRunningError>('ProcessAlreadyRunningError')({
  _tag: S.Literal('ProcessAlreadyRunningError'),
  processId: S.String,
  message: S.String,
}) {}

export class PermissionDeniedError extends S.Class<PermissionDeniedError>('PermissionDeniedError')({
  _tag: S.Literal('PermissionDeniedError'),
  operation: S.String,
  message: S.String,
}) {}
