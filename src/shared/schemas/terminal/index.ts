import { Schema as S } from 'effect'

/**
 * Terminal process status
 */
export const ProcessStatus = S.Literal('starting', 'running', 'idle', 'stopped', 'error')
export type ProcessStatus = S.Schema.Type<typeof ProcessStatus>

/**
 * Terminal process state - represents the current state of a PTY process
 */
export class ProcessState extends S.Class<ProcessState>('ProcessState')({
  status: ProcessStatus,
  pid: S.optional(S.Number),
  exitCode: S.optional(S.Number),
  lastActivity: S.Date,
  idleThreshold: S.Number,
}) {}

/**
 * Terminal output chunk - a piece of output from a process
 */
export class OutputChunk extends S.Class<OutputChunk>('OutputChunk')({
  processId: S.String,
  data: S.String,
  timestamp: S.Date,
  type: S.Literal('stdout', 'stderr'),
}) {}

/**
 * Process lifecycle event
 */
export class ProcessEvent extends S.Class<ProcessEvent>('ProcessEvent')({
  processId: S.String,
  type: S.Literal('started', 'stopped', 'error', 'idle', 'active'),
  timestamp: S.Date,
  metadata: S.optional(S.Unknown),
}) {}

/**
 * Issue context for AI runner processes
 */
export class IssueContext extends S.Class<IssueContext>('IssueContext')({
  owner: S.String,
  repo: S.String,
  issueNumber: S.Number,
  issueTitle: S.String,
  worktreePath: S.String,
  branchName: S.String,
}) {}

/**
 * Spawn runner input - configuration for spawning a new AI runner
 */
export class SpawnRunnerInput extends S.Class<SpawnRunnerInput>('SpawnRunnerInput')({
  accountId: S.String,
  agentType: S.String,
  prompt: S.String,
  issueContext: S.optional(IssueContext),
}) {}

/**
 * Runner info - complete information about an active runner
 */
export class RunnerInfo extends S.Class<RunnerInfo>('RunnerInfo')({
  processId: S.String,
  accountId: S.String,
  agentType: S.String,
  prompt: S.String,
  state: ProcessState,
  issueContext: S.optional(IssueContext),
}) {}

/**
 * Spawn runner result
 */
export class SpawnRunnerResult extends S.Class<SpawnRunnerResult>('SpawnRunnerResult')({
  processId: S.String,
  state: ProcessState,
}) {}

/**
 * Terminal error for IPC
 */
export class TerminalError extends S.Class<TerminalError>('TerminalError')({
  _tag: S.Literal('TerminalError'),
  reason: S.Literal('ProcessNotFound', 'SpawnFailed', 'AlreadyRunning', 'PermissionDenied'),
  message: S.String,
}) {}
