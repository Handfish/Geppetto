import { Effect, Data, Schema as S, Context, Stream } from 'effect'

// Terminal process states
export class ProcessState extends S.Class<ProcessState>('ProcessState')({
  status: S.Literal('starting', 'running', 'idle', 'stopped', 'error'),
  pid: S.optional(S.Number),
  exitCode: S.optional(S.Number),
  lastActivity: S.Date,
  idleThreshold: S.Number.pipe(S.annotations({ description: 'Milliseconds before idle' })),
}) {}

// Branded ProcessId type - extract type from schema for proper Effect Schema compatibility
export const ProcessIdSchema = S.String.pipe(S.brand('ProcessId'))
export type ProcessId = S.Schema.Type<typeof ProcessIdSchema>

// Terminal process configuration
export class ProcessConfig extends S.Class<ProcessConfig>('ProcessConfig')({
  id: ProcessIdSchema,
  command: S.String,
  args: S.Array(S.String),
  env: S.Record({ key: S.String, value: S.String }),
  cwd: S.String,
  shell: S.optionalWith(S.String, { default: () => process.platform === 'win32' ? 'powershell.exe' : '/bin/bash' }),
  rows: S.optionalWith(S.Number, { default: () => 24 }),
  cols: S.optionalWith(S.Number, { default: () => 80 }),
  issueContext: S.optional(S.Struct({
    owner: S.String,
    repo: S.String,
    issueNumber: S.Number,
    issueTitle: S.String,
    worktreePath: S.String,
    branchName: S.String,
  })),
}) {}

// Terminal output chunk
export class OutputChunk extends S.Class<OutputChunk>('OutputChunk')({
  processId: ProcessIdSchema,
  data: S.String,
  timestamp: S.Date,
  type: S.Literal('stdout', 'stderr'),
}) {}

// Terminal resize event
export class ResizeEvent extends S.Class<ResizeEvent>('ResizeEvent')({
  processId: ProcessIdSchema,
  rows: S.Number,
  cols: S.Number,
}) {}

// Terminal input event
export class InputEvent extends S.Class<InputEvent>('InputEvent')({
  processId: ProcessIdSchema,
  data: S.String,
}) {}

// Process lifecycle events
export class ProcessEvent extends S.Class<ProcessEvent>('ProcessEvent')({
  processId: ProcessIdSchema,
  type: S.Literal('started', 'stopped', 'error', 'idle', 'active'),
  timestamp: S.Date,
  metadata: S.optional(S.Unknown),
}) {}

// Terminal errors
export class TerminalError extends Data.TaggedError('TerminalError')<{
  reason: 'ProcessNotFound' | 'SpawnFailed' | 'AlreadyRunning' | 'PermissionDenied'
  message: string
}> {}

// Terminal Port Interface
export interface TerminalPort {
  // Process lifecycle
  readonly spawn: (config: ProcessConfig) => Effect.Effect<ProcessState, TerminalError>
  readonly kill: (processId: string) => Effect.Effect<void, TerminalError>
  readonly restart: (processId: string) => Effect.Effect<ProcessState, TerminalError>

  // Process interaction
  readonly write: (processId: string, data: string) => Effect.Effect<void, TerminalError>
  readonly resize: (processId: string, rows: number, cols: number) => Effect.Effect<void, TerminalError>

  // Process state
  readonly getState: (processId: string) => Effect.Effect<ProcessState, TerminalError>
  readonly listProcesses: () => Effect.Effect<ReadonlyArray<ProcessState>, never>

  // Stream subscriptions (for IPC)
  readonly subscribe: (processId: string) => Stream.Stream<OutputChunk, TerminalError>
  readonly subscribeToEvents: (processId: string) => Stream.Stream<ProcessEvent, TerminalError>
}

// Port tag for dependency injection
export const TerminalPort = Context.GenericTag<TerminalPort>('TerminalPort')

// Tag registry for adapters
export const TerminalAdapterTag = {
  NodePty: 'NodePtyTerminalAdapter' as const,
  ChildProcess: 'ChildProcessTerminalAdapter' as const,  // Fallback
} as const

export type TerminalAdapterType = typeof TerminalAdapterTag[keyof typeof TerminalAdapterTag]
