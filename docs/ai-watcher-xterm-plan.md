# AI Runner XTerm.js Terminal - Complete Implementation Plan

> **Goal**: Replace tmux-based AI runners with an integrated xterm.js terminal window featuring LED status indicators, multi-process management, and seamless process switching.

## Executive Summary

This plan outlines the migration from tmux-based AI runners to a native xterm.js terminal implementation within the Electron application. The new system will provide:

- **Native Terminal Integration**: xterm.js embedded directly in the UI
- **LED Status Indicators**: Visual process status within the terminal window
- **Multi-Process Management**: Launch and switch between multiple AI runner processes
- **Hexagonal Architecture**: Clean separation via ports and adapters
- **Effect-TS Integration**: Type-safe process management with Effect patterns

**Estimated Duration**: 10-12 hours (2 days)
**Complexity**: High (requires process management, IPC, and terminal emulation)

---

## Phase 1: Terminal Port & Adapter Architecture (2-3 hours)

### 1.1 Define Terminal Port Interface

**File**: `src/main/terminal/terminal-port.ts`

```typescript
import { Effect, Data, Schema as S } from 'effect'

// Terminal process states
export class ProcessState extends S.Class<ProcessState>('ProcessState')({
  status: S.Literal('starting', 'running', 'idle', 'stopped', 'error'),
  pid: S.optional(S.Number),
  exitCode: S.optional(S.Number),
  lastActivity: S.Date,
  idleThreshold: S.Number.pipe(S.annotations({ description: 'Milliseconds before idle' })),
}) {}

// Terminal process configuration
export class ProcessConfig extends S.Class<ProcessConfig>('ProcessConfig')({
  id: S.String.pipe(S.brand('ProcessId')),
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
  processId: S.String.pipe(S.brand('ProcessId')),
  data: S.String,
  timestamp: S.Date,
  type: S.Literal('stdout', 'stderr'),
}) {}

// Terminal resize event
export class ResizeEvent extends S.Class<ResizeEvent>('ResizeEvent')({
  processId: S.String.pipe(S.brand('ProcessId')),
  rows: S.Number,
  cols: S.Number,
}) {}

// Terminal input event
export class InputEvent extends S.Class<InputEvent>('InputEvent')({
  processId: S.String.pipe(S.brand('ProcessId')),
  data: S.String,
}) {}

// Process lifecycle events
export class ProcessEvent extends S.Class<ProcessEvent>('ProcessEvent')({
  processId: S.String.pipe(S.brand('ProcessId')),
  type: S.Literal('started', 'stopped', 'error', 'idle', 'active'),
  timestamp: S.Date,
  metadata: S.optional(S.Unknown),
}) {}

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
  readonly subscribe: (processId: string) => Effect.Stream<OutputChunk, TerminalError>
  readonly subscribeToEvents: (processId: string) => Effect.Stream<ProcessEvent, TerminalError>
}

// Terminal errors
export class TerminalError extends Data.TaggedError<TerminalError>('TerminalError') {
  constructor(readonly reason: 'ProcessNotFound' | 'SpawnFailed' | 'AlreadyRunning' | 'PermissionDenied', readonly message: string) {
    super()
  }
}

// Port tag for dependency injection
export class TerminalPort extends Effect.Context.Tag('TerminalPort')<TerminalPort, TerminalPort>() {}

// Tag registry for adapters
export const TerminalAdapterTag = {
  NodePty: 'NodePtyTerminalAdapter' as const,
  ChildProcess: 'ChildProcessTerminalAdapter' as const,  // Fallback
} as const

export type TerminalAdapterType = typeof TerminalAdapterTag[keyof typeof TerminalAdapterTag]
```

### 1.2 Create NodePty Terminal Adapter

**File**: `src/main/terminal/node-pty/adapter.ts`

```typescript
import { Effect, Layer, Stream, HashMap, Ref, PubSub, Duration, pipe } from 'effect'
import * as pty from 'node-pty'
import { TerminalPort, ProcessConfig, ProcessState, OutputChunk, ProcessEvent, TerminalError } from '../terminal-port'

interface ProcessInstance {
  config: ProcessConfig
  ptyProcess: pty.IPty
  state: Ref.Ref<ProcessState>
  outputStream: PubSub.PubSub<OutputChunk>
  eventStream: PubSub.PubSub<ProcessEvent>
  idleTimer: Ref.Ref<number | null>
}

export class NodePtyTerminalAdapter extends Effect.Service<NodePtyTerminalAdapter>()(
  'NodePtyTerminalAdapter',
  {
    effect: Effect.gen(function* () {
      // Process registry
      const processes = yield* Ref.make(HashMap.empty<string, ProcessInstance>())

      // Helper to update idle status
      const updateIdleStatus = (instance: ProcessInstance) => Effect.gen(function* () {
        const currentState = yield* Ref.get(instance.state)
        const now = Date.now()
        const timeSinceActivity = now - currentState.lastActivity.getTime()

        if (currentState.status === 'running' && timeSinceActivity > currentState.idleThreshold) {
          yield* Ref.update(instance.state, (s) => ({
            ...s,
            status: 'idle' as const,
            lastActivity: new Date(now),
          }))

          yield* PubSub.publish(
            instance.eventStream,
            new ProcessEvent({
              processId: instance.config.id,
              type: 'idle',
              timestamp: new Date(),
            })
          )
        }
      })

      // Helper to reset idle timer
      const resetIdleTimer = (instance: ProcessInstance) => Effect.gen(function* () {
        const currentTimer = yield* Ref.get(instance.idleTimer)
        if (currentTimer) clearTimeout(currentTimer)

        const newTimer = setTimeout(() => {
          Effect.runPromise(updateIdleStatus(instance)).catch(console.error)
        }, instance.config.issueContext ? 30000 : 60000) // 30s for issues, 60s default

        yield* Ref.set(instance.idleTimer, newTimer as any)

        const state = yield* Ref.get(instance.state)
        if (state.status === 'idle') {
          yield* Ref.update(instance.state, (s) => ({
            ...s,
            status: 'running' as const,
            lastActivity: new Date(),
          }))

          yield* PubSub.publish(
            instance.eventStream,
            new ProcessEvent({
              processId: instance.config.id,
              type: 'active',
              timestamp: new Date(),
            })
          )
        }
      })

      const spawn = (config: ProcessConfig) => Effect.gen(function* () {
        const existing = yield* pipe(
          Ref.get(processes),
          Effect.map(HashMap.get(config.id))
        )

        if (existing !== undefined) {
          const state = yield* Ref.get(existing.state)
          if (state.status === 'running' || state.status === 'idle' || state.status === 'starting') {
            return yield* Effect.fail(new TerminalError('AlreadyRunning', `Process ${config.id} is already running`))
          }
        }

        // Create PTY process
        const ptyProcess = yield* Effect.try({
          try: () => pty.spawn(config.shell || '/bin/bash', config.args, {
            name: 'xterm-256color',
            cols: config.cols || 80,
            rows: config.rows || 24,
            cwd: config.cwd,
            env: { ...process.env, ...config.env } as any,
          }),
          catch: (error) => new TerminalError('SpawnFailed', `Failed to spawn process: ${error}`)
        })

        // Create state and streams
        const state = yield* Ref.make(new ProcessState({
          status: 'starting' as const,
          pid: ptyProcess.pid,
          lastActivity: new Date(),
          idleThreshold: config.issueContext ? 30000 : 60000,
        }))

        const outputStream = yield* PubSub.unbounded<OutputChunk>()
        const eventStream = yield* PubSub.unbounded<ProcessEvent>()
        const idleTimer = yield* Ref.make<number | null>(null)

        const instance: ProcessInstance = {
          config,
          ptyProcess,
          state,
          outputStream,
          eventStream,
          idleTimer,
        }

        // Set up event handlers
        ptyProcess.onData((data: string) => {
          Effect.runPromise(Effect.gen(function* () {
            yield* PubSub.publish(
              outputStream,
              new OutputChunk({
                processId: config.id,
                data,
                timestamp: new Date(),
                type: 'stdout',
              })
            )

            yield* Ref.update(state, (s) => ({
              ...s,
              lastActivity: new Date(),
            }))

            yield* resetIdleTimer(instance)
          })).catch(console.error)
        })

        ptyProcess.onExit(({ exitCode, signal }) => {
          Effect.runPromise(Effect.gen(function* () {
            yield* Ref.update(state, (s) => ({
              ...s,
              status: 'stopped' as const,
              exitCode: exitCode ?? undefined,
            }))

            yield* PubSub.publish(
              eventStream,
              new ProcessEvent({
                processId: config.id,
                type: 'stopped',
                timestamp: new Date(),
                metadata: { exitCode, signal },
              })
            )

            // Clear idle timer
            const timer = yield* Ref.get(idleTimer)
            if (timer) clearTimeout(timer)
          })).catch(console.error)
        })

        // Store process instance
        yield* Ref.update(processes, HashMap.set(config.id, instance))

        // Update state to running
        yield* Ref.update(state, (s) => ({
          ...s,
          status: 'running' as const,
        }))

        yield* PubSub.publish(
          eventStream,
          new ProcessEvent({
            processId: config.id,
            type: 'started',
            timestamp: new Date(),
          })
        )

        // Start idle timer
        yield* resetIdleTimer(instance)

        return yield* Ref.get(state)
      })

      const kill = (processId: string) => Effect.gen(function* () {
        const instance = yield* pipe(
          Ref.get(processes),
          Effect.map(HashMap.get(processId)),
          Effect.flatMap(Effect.fromNullable(new TerminalError('ProcessNotFound', `Process ${processId} not found`)))
        )

        // Clear idle timer
        const timer = yield* Ref.get(instance.idleTimer)
        if (timer) clearTimeout(timer)

        // Kill the PTY process
        yield* Effect.try({
          try: () => instance.ptyProcess.kill(),
          catch: (error) => new TerminalError('PermissionDenied', `Failed to kill process: ${error}`)
        })

        // Update state
        yield* Ref.update(instance.state, (s) => ({
          ...s,
          status: 'stopped' as const,
        }))

        // Remove from registry
        yield* Ref.update(processes, HashMap.remove(processId))
      })

      const restart = (processId: string) => Effect.gen(function* () {
        const instance = yield* pipe(
          Ref.get(processes),
          Effect.map(HashMap.get(processId)),
          Effect.flatMap(Effect.fromNullable(new TerminalError('ProcessNotFound', `Process ${processId} not found`)))
        )

        yield* kill(processId)
        yield* Effect.sleep(Duration.millis(500)) // Brief pause before restart
        return yield* spawn(instance.config)
      })

      const write = (processId: string, data: string) => Effect.gen(function* () {
        const instance = yield* pipe(
          Ref.get(processes),
          Effect.map(HashMap.get(processId)),
          Effect.flatMap(Effect.fromNullable(new TerminalError('ProcessNotFound', `Process ${processId} not found`)))
        )

        yield* Effect.try({
          try: () => instance.ptyProcess.write(data),
          catch: (error) => new TerminalError('PermissionDenied', `Failed to write to process: ${error}`)
        })

        // Reset idle timer on input
        yield* resetIdleTimer(instance)
      })

      const resize = (processId: string, rows: number, cols: number) => Effect.gen(function* () {
        const instance = yield* pipe(
          Ref.get(processes),
          Effect.map(HashMap.get(processId)),
          Effect.flatMap(Effect.fromNullable(new TerminalError('ProcessNotFound', `Process ${processId} not found`)))
        )

        yield* Effect.try({
          try: () => instance.ptyProcess.resize(cols, rows),
          catch: (error) => new TerminalError('PermissionDenied', `Failed to resize process: ${error}`)
        })
      })

      const getState = (processId: string) => Effect.gen(function* () {
        const instance = yield* pipe(
          Ref.get(processes),
          Effect.map(HashMap.get(processId)),
          Effect.flatMap(Effect.fromNullable(new TerminalError('ProcessNotFound', `Process ${processId} not found`)))
        )

        return yield* Ref.get(instance.state)
      })

      const listProcesses = () => Effect.gen(function* () {
        const processMap = yield* Ref.get(processes)
        const instances = Array.from(HashMap.values(processMap))

        const states = yield* Effect.all(
          instances.map((instance) => Ref.get(instance.state)),
          { concurrency: 'unbounded' }
        )

        return states
      })

      const subscribe = (processId: string) => Stream.gen(function* () {
        const instance = yield* Stream.fromEffect(
          pipe(
            Ref.get(processes),
            Effect.map(HashMap.get(processId)),
            Effect.flatMap(Effect.fromNullable(new TerminalError('ProcessNotFound', `Process ${processId} not found`)))
          )
        )

        return yield* Stream.fromPubSub(instance.outputStream)
      }).pipe(Stream.flatten)

      const subscribeToEvents = (processId: string) => Stream.gen(function* () {
        const instance = yield* Stream.fromEffect(
          pipe(
            Ref.get(processes),
            Effect.map(HashMap.get(processId)),
            Effect.flatMap(Effect.fromNullable(new TerminalError('ProcessNotFound', `Process ${processId} not found`)))
          )
        )

        return yield* Stream.fromPubSub(instance.eventStream)
      }).pipe(Stream.flatten)

      return {
        spawn,
        kill,
        restart,
        write,
        resize,
        getState,
        listProcesses,
        subscribe,
        subscribeToEvents,
      } satisfies TerminalPort
    }),
    dependencies: [],
  }
) {}

// Export as Layer
export const NodePtyTerminalAdapterLayer = Layer.succeed(
  TerminalPort,
  NodePtyTerminalAdapter.Default
)
```

### 1.3 Create Terminal Registry Service

**File**: `src/main/terminal/terminal-registry.ts`

```typescript
import { Effect, Layer, HashMap, Context } from 'effect'
import { TerminalPort, TerminalAdapterType, TerminalAdapterTag } from './terminal-port'

// Registry service that captures all adapters at construction time
export class TerminalRegistry extends Effect.Service<TerminalRegistry>()(
  'TerminalRegistry',
  {
    effect: Effect.gen(function* () {
      // Capture the TerminalPort adapter at construction
      const adapter = yield* TerminalPort

      // For now we only have one adapter, but this allows future expansion
      const adapters = HashMap.make<TerminalAdapterType, TerminalPort>([
        [TerminalAdapterTag.NodePty, adapter],
      ])

      const getAdapter = (type: TerminalAdapterType) => Effect.gen(function* () {
        const adapter = HashMap.get(adapters, type)
        if (adapter._tag === 'None') {
          return yield* Effect.fail(new Error(`Terminal adapter ${type} not found`))
        }
        return adapter.value
      })

      const getDefaultAdapter = () => Effect.succeed(adapter)

      return {
        getAdapter,
        getDefaultAdapter,
        listAdapters: () => Effect.succeed(Array.from(HashMap.keys(adapters))),
      }
    }),
    dependencies: [TerminalPort],
  }
) {}
```

### 1.4 Create Terminal Service (Domain Service)

**File**: `src/main/terminal/terminal-service.ts`

```typescript
import { Effect, Layer, Stream, Ref, HashMap, Duration, pipe } from 'effect'
import { TerminalRegistry } from './terminal-registry'
import { ProcessConfig, ProcessState, OutputChunk, ProcessEvent, TerminalError } from './terminal-port'
import { AccountContextService } from '../account/account-context-service'
import { TierService } from '../tier/tier-service'

interface RunnerProcessConfig extends ProcessConfig {
  accountId: string
  agentType: string
  prompt: string
}

export class TerminalService extends Effect.Service<TerminalService>()(
  'TerminalService',
  {
    effect: Effect.gen(function* () {
      const registry = yield* TerminalRegistry
      const accountService = yield* AccountContextService
      const tierService = yield* TierService

      // Track active runners
      const activeRunners = yield* Ref.make(HashMap.empty<string, RunnerProcessConfig>())

      const spawnAiRunner = (config: {
        accountId: string
        agentType: string
        prompt: string
        issueContext?: {
          owner: string
          repo: string
          issueNumber: number
          issueTitle: string
          worktreePath: string
          branchName: string
        }
      }) => Effect.gen(function* () {
        // Check tier limits
        yield* tierService.checkFeatureAvailable('ai-runners')

        const account = yield* accountService.getAccountContext(config.accountId)
        const adapter = yield* registry.getDefaultAdapter()

        // Generate process ID
        const processId = config.issueContext
          ? `runner-${config.accountId}-issue-${config.issueContext.issueNumber}`
          : `runner-${config.accountId}-${Date.now()}`

        // Build command based on agent type
        const command = config.agentType === 'claude' ? 'claude' : 'cursor'
        const cwd = config.issueContext?.worktreePath || process.cwd()

        const processConfig: RunnerProcessConfig = {
          id: processId,
          command,
          args: ['--task', config.prompt],
          env: {
            ANTHROPIC_API_KEY: account.credentials?.apiKey || '',
          },
          cwd,
          shell: process.platform === 'win32' ? 'powershell.exe' : '/bin/bash',
          rows: 30,
          cols: 120,
          issueContext: config.issueContext,
          accountId: config.accountId,
          agentType: config.agentType,
          prompt: config.prompt,
        }

        // Spawn the process
        const state = yield* adapter.spawn(processConfig)

        // Track the runner
        yield* Ref.update(activeRunners, HashMap.set(processId, processConfig))

        return {
          processId,
          state,
        }
      })

      const killRunner = (processId: string) => Effect.gen(function* () {
        const adapter = yield* registry.getDefaultAdapter()
        yield* adapter.kill(processId)
        yield* Ref.update(activeRunners, HashMap.remove(processId))
      })

      const killAllRunners = () => Effect.gen(function* () {
        const runners = yield* Ref.get(activeRunners)
        const adapter = yield* registry.getDefaultAdapter()

        yield* Effect.all(
          Array.from(HashMap.keys(runners)).map((processId) =>
            adapter.kill(processId).pipe(
              Effect.catchAll(() => Effect.void) // Ignore errors
            )
          ),
          { concurrency: 'unbounded' }
        )

        yield* Ref.set(activeRunners, HashMap.empty())
      })

      const restartRunner = (processId: string) => Effect.gen(function* () {
        const runners = yield* Ref.get(activeRunners)
        const config = HashMap.get(runners, processId)

        if (config._tag === 'None') {
          return yield* Effect.fail(new TerminalError('ProcessNotFound', `Runner ${processId} not found`))
        }

        const adapter = yield* registry.getDefaultAdapter()
        return yield* adapter.restart(processId)
      })

      const writeToRunner = (processId: string, data: string) => Effect.gen(function* () {
        const adapter = yield* registry.getDefaultAdapter()
        yield* adapter.write(processId, data)
      })

      const resizeRunner = (processId: string, rows: number, cols: number) => Effect.gen(function* () {
        const adapter = yield* registry.getDefaultAdapter()
        yield* adapter.resize(processId, rows, cols)
      })

      const getRunnerState = (processId: string) => Effect.gen(function* () {
        const adapter = yield* registry.getDefaultAdapter()
        return yield* adapter.getState(processId)
      })

      const listActiveRunners = () => Effect.gen(function* () {
        const runners = yield* Ref.get(activeRunners)
        const adapter = yield* registry.getDefaultAdapter()

        const states = yield* Effect.all(
          Array.from(HashMap.entries(runners)).map(([processId, config]) =>
            adapter.getState(processId).pipe(
              Effect.map((state) => ({
                processId,
                config,
                state,
              })),
              Effect.catchAll(() =>
                Effect.succeed({
                  processId,
                  config,
                  state: new ProcessState({
                    status: 'stopped' as const,
                    lastActivity: new Date(),
                    idleThreshold: 60000,
                  }),
                })
              )
            )
          ),
          { concurrency: 'unbounded' }
        )

        return states
      })

      const subscribeToRunner = (processId: string) => {
        const adapter = registry.getDefaultAdapter()
        return Stream.fromEffect(adapter).pipe(
          Stream.flatMap((adapter) => adapter.subscribe(processId))
        )
      }

      const subscribeToRunnerEvents = (processId: string) => {
        const adapter = registry.getDefaultAdapter()
        return Stream.fromEffect(adapter).pipe(
          Stream.flatMap((adapter) => adapter.subscribeToEvents(processId))
        )
      }

      return {
        spawnAiRunner,
        killRunner,
        killAllRunners,
        restartRunner,
        writeToRunner,
        resizeRunner,
        getRunnerState,
        listActiveRunners,
        subscribeToRunner,
        subscribeToRunnerEvents,
      }
    }),
    dependencies: [TerminalRegistry, AccountContextService, TierService],
  }
) {}
```

---

## Phase 2: IPC Contracts & Handlers (2 hours)

### 2.1 Define IPC Contracts

**File**: `src/shared/ipc-contracts/terminal-contracts.ts`

```typescript
import { IpcContract } from '../ipc-contract'
import { Schema as S } from 'effect'
import { ProcessState, OutputChunk, ProcessEvent } from '../schemas/terminal'

// Import schemas (will be created next)
import { SpawnRunnerInput, RunnerInfo } from '../schemas/terminal'

export const TerminalIpcContracts = {
  spawnRunner: IpcContract.make('terminal:spawn-runner', {
    input: SpawnRunnerInput,
    output: S.Struct({
      processId: S.String,
      state: ProcessState,
    }),
    errors: S.Union(TerminalError, AuthenticationError, TierLimitError),
  }),

  killRunner: IpcContract.make('terminal:kill-runner', {
    input: S.Struct({
      processId: S.String,
    }),
    output: S.Void,
    errors: S.Union(TerminalError),
  }),

  killAllRunners: IpcContract.make('terminal:kill-all-runners', {
    input: S.Void,
    output: S.Void,
    errors: S.Never,
  }),

  restartRunner: IpcContract.make('terminal:restart-runner', {
    input: S.Struct({
      processId: S.String,
    }),
    output: ProcessState,
    errors: S.Union(TerminalError),
  }),

  writeToRunner: IpcContract.make('terminal:write-to-runner', {
    input: S.Struct({
      processId: S.String,
      data: S.String,
    }),
    output: S.Void,
    errors: S.Union(TerminalError),
  }),

  resizeRunner: IpcContract.make('terminal:resize-runner', {
    input: S.Struct({
      processId: S.String,
      rows: S.Number,
      cols: S.Number,
    }),
    output: S.Void,
    errors: S.Union(TerminalError),
  }),

  getRunnerState: IpcContract.make('terminal:get-runner-state', {
    input: S.Struct({
      processId: S.String,
    }),
    output: ProcessState,
    errors: S.Union(TerminalError),
  }),

  listActiveRunners: IpcContract.make('terminal:list-active-runners', {
    input: S.Void,
    output: S.Array(RunnerInfo),
    errors: S.Never,
  }),

  // Stream subscriptions (handled differently for IPC)
  subscribeToRunner: IpcContract.make('terminal:subscribe-to-runner', {
    input: S.Struct({
      processId: S.String,
    }),
    output: S.Struct({
      subscriptionId: S.String,
    }),
    errors: S.Union(TerminalError),
  }),

  unsubscribeFromRunner: IpcContract.make('terminal:unsubscribe-from-runner', {
    input: S.Struct({
      subscriptionId: S.String,
    }),
    output: S.Void,
    errors: S.Never,
  }),
} as const
```

### 2.2 Create Shared Schemas

**File**: `src/shared/schemas/terminal/index.ts`

```typescript
import { Schema as S } from 'effect'

// Re-export from port (these will be copied to shared for IPC)
export class ProcessState extends S.Class<ProcessState>('ProcessState')({
  status: S.Literal('starting', 'running', 'idle', 'stopped', 'error'),
  pid: S.optional(S.Number),
  exitCode: S.optional(S.Number),
  lastActivity: S.Date,
  idleThreshold: S.Number,
}) {}

export class OutputChunk extends S.Class<OutputChunk>('OutputChunk')({
  processId: S.String,
  data: S.String,
  timestamp: S.Date,
  type: S.Literal('stdout', 'stderr'),
}) {}

export class ProcessEvent extends S.Class<ProcessEvent>('ProcessEvent')({
  processId: S.String,
  type: S.Literal('started', 'stopped', 'error', 'idle', 'active'),
  timestamp: S.Date,
  metadata: S.optional(S.Unknown),
}) {}

export class SpawnRunnerInput extends S.Class<SpawnRunnerInput>('SpawnRunnerInput')({
  accountId: S.String,
  agentType: S.String,
  prompt: S.String,
  issueContext: S.optional(S.Struct({
    owner: S.String,
    repo: S.String,
    issueNumber: S.Number,
    issueTitle: S.String,
    worktreePath: S.String,
    branchName: S.String,
  })),
}) {}

export class RunnerInfo extends S.Class<RunnerInfo>('RunnerInfo')({
  processId: S.String,
  accountId: S.String,
  agentType: S.String,
  prompt: S.String,
  state: ProcessState,
  issueContext: S.optional(S.Struct({
    owner: S.String,
    repo: S.String,
    issueNumber: S.Number,
    issueTitle: S.String,
    worktreePath: S.String,
    branchName: S.String,
  })),
}) {}

// Terminal errors for IPC
export class TerminalError extends S.Class<TerminalError>('TerminalError')({
  _tag: S.Literal('TerminalError'),
  reason: S.Literal('ProcessNotFound', 'SpawnFailed', 'AlreadyRunning', 'PermissionDenied'),
  message: S.String,
}) {}
```

### 2.3 Create IPC Handlers

**File**: `src/main/ipc/terminal-handlers.ts`

```typescript
import { Effect, Stream, HashMap, Ref, PubSub, Duration } from 'effect'
import { ipcMain } from 'electron'
import { TerminalService } from '../terminal/terminal-service'
import { TerminalIpcContracts } from '../../shared/ipc-contracts/terminal-contracts'
import { registerIpcHandler } from './ipc-handler-setup'
import { OutputChunk, ProcessEvent } from '../../shared/schemas/terminal'

interface Subscription {
  id: string
  processId: string
  cleanup: () => void
}

// Track active subscriptions
const subscriptions = new Map<string, Subscription>()

export const registerTerminalHandlers = () => Effect.gen(function* () {
  const terminalService = yield* TerminalService

  // Basic operations
  registerIpcHandler(
    TerminalIpcContracts.spawnRunner,
    (input) => terminalService.spawnAiRunner(input)
  )

  registerIpcHandler(
    TerminalIpcContracts.killRunner,
    ({ processId }) => terminalService.killRunner(processId)
  )

  registerIpcHandler(
    TerminalIpcContracts.killAllRunners,
    () => terminalService.killAllRunners()
  )

  registerIpcHandler(
    TerminalIpcContracts.restartRunner,
    ({ processId }) => terminalService.restartRunner(processId)
  )

  registerIpcHandler(
    TerminalIpcContracts.writeToRunner,
    ({ processId, data }) => terminalService.writeToRunner(processId, data)
  )

  registerIpcHandler(
    TerminalIpcContracts.resizeRunner,
    ({ processId, rows, cols }) => terminalService.resizeRunner(processId, rows, cols)
  )

  registerIpcHandler(
    TerminalIpcContracts.getRunnerState,
    ({ processId }) => terminalService.getRunnerState(processId)
  )

  registerIpcHandler(
    TerminalIpcContracts.listActiveRunners,
    () => terminalService.listActiveRunners().pipe(
      Effect.map((runners) =>
        runners.map((w) => ({
          processId: w.processId,
          accountId: w.config.accountId,
          agentType: w.config.agentType,
          prompt: w.config.prompt,
          state: w.state,
          issueContext: w.config.issueContext,
        }))
      )
    )
  )

  // Stream subscription handler
  registerIpcHandler(
    TerminalIpcContracts.subscribeToRunner,
    ({ processId }) => Effect.gen(function* () {
      const subscriptionId = `sub-${processId}-${Date.now()}`

      // Set up output stream
      const outputStream = terminalService.subscribeToRunner(processId)
      const eventStream = terminalService.subscribeToRunnerEvents(processId)

      // Create a fiber that runs the streams and sends data via IPC
      const fiber = yield* Stream.merge(
        outputStream.pipe(Stream.map((chunk) => ({ type: 'output' as const, data: chunk }))),
        eventStream.pipe(Stream.map((event) => ({ type: 'event' as const, data: event })))
      ).pipe(
        Stream.tap((message) => Effect.sync(() => {
          // Send to all renderer windows
          const windows = require('electron').BrowserWindow.getAllWindows()
          windows.forEach((window) => {
            window.webContents.send(`terminal:stream:${processId}`, message)
          })
        })),
        Stream.runDrain,
        Effect.fork
      )

      // Store subscription
      subscriptions.set(subscriptionId, {
        id: subscriptionId,
        processId,
        cleanup: () => {
          Effect.runPromise(fiber.pipe(Effect.flatMap((f) => f.interrupt))).catch(console.error)
        },
      })

      return { subscriptionId }
    })
  )

  registerIpcHandler(
    TerminalIpcContracts.unsubscribeFromRunner,
    ({ subscriptionId }) => Effect.sync(() => {
      const sub = subscriptions.get(subscriptionId)
      if (sub) {
        sub.cleanup()
        subscriptions.delete(subscriptionId)
      }
    })
  )
})
```

---

## Phase 3: Frontend Terminal Components (3-4 hours)

### 3.1 Create Terminal Atoms

**File**: `src/renderer/atoms/terminal-atoms.ts`

```typescript
import { Atom, Result } from '@effect-atom/atom-react'
import { Effect, Duration, Stream, HashMap, Ref } from 'effect'
import { RunnerInfo, ProcessState, OutputChunk, ProcessEvent } from '../../shared/schemas/terminal'
import { ElectronIpcClient } from '../lib/ipc-client'

// Active runners atom
export const activeRunnersAtom = Atom.make(() =>
  Effect.gen(function* () {
    const ipc = yield* ElectronIpcClient
    return yield* ipc.terminal.listActiveRunners()
  }).pipe(
    Effect.map((runners) => Result.success(runners)),
    Effect.catchAll((error) => Effect.succeed(Result.fail(error)))
  )
).pipe(
  Atom.setIdleTTL(Duration.minutes(1)),
  Atom.withKeys(['terminal:runners'])
)

// Individual runner state atom family
export const runnerStateAtom = Atom.family((processId: string) =>
  Atom.make(() =>
    Effect.gen(function* () {
      const ipc = yield* ElectronIpcClient
      return yield* ipc.terminal.getRunnerState({ processId })
    }).pipe(
      Effect.map((state) => Result.success(state)),
      Effect.catchAll((error) => Effect.succeed(Result.fail(error)))
    )
  ).pipe(
    Atom.setIdleTTL(Duration.seconds(30)),
    Atom.withKeys(['terminal:runner:state', processId])
  )
)

// Terminal output buffer atom (stores last N lines per process)
interface OutputBuffer {
  lines: string[]
  maxLines: number
}

const outputBuffers = new Map<string, OutputBuffer>()

export const runnerOutputAtom = Atom.family((processId: string) =>
  Atom.make(() => {
    // Initialize buffer if needed
    if (!outputBuffers.has(processId)) {
      outputBuffers.set(processId, {
        lines: [],
        maxLines: 1000,
      })
    }

    return Effect.succeed(Result.success(outputBuffers.get(processId)!.lines))
  }).pipe(
    Atom.withKeys(['terminal:output', processId])
  )
)

// Terminal subscription manager (handles IPC streaming)
class TerminalSubscriptionManager {
  private subscriptions = new Map<string, string>() // processId -> subscriptionId
  private listeners = new Map<string, (data: any) => void>()

  subscribe(processId: string, onData: (data: OutputChunk | ProcessEvent) => void) {
    return Effect.gen(function* () {
      // If already subscribed, just add listener
      if (this.subscriptions.has(processId)) {
        return { unsubscribe: () => this.unsubscribe(processId) }
      }

      const ipc = yield* ElectronIpcClient
      const { subscriptionId } = yield* ipc.terminal.subscribeToRunner({ processId })

      this.subscriptions.set(processId, subscriptionId)

      // Set up IPC listener
      const listener = (event: any, message: { type: 'output' | 'event', data: any }) => {
        if (message.type === 'output') {
          const chunk = message.data as OutputChunk

          // Update output buffer
          const buffer = outputBuffers.get(processId)
          if (buffer) {
            const newLines = chunk.data.split('\n')
            buffer.lines.push(...newLines)

            // Trim to max lines
            if (buffer.lines.length > buffer.maxLines) {
              buffer.lines = buffer.lines.slice(-buffer.maxLines)
            }
          }
        }

        onData(message.data)
      }

      this.listeners.set(processId, listener)
      window.electron.ipcRenderer.on(`terminal:stream:${processId}`, listener)

      return {
        unsubscribe: () => this.unsubscribe(processId),
      }
    }.bind(this))
  }

  unsubscribe(processId: string) {
    const subscriptionId = this.subscriptions.get(processId)
    const listener = this.listeners.get(processId)

    if (subscriptionId) {
      // Call IPC to unsubscribe
      ElectronIpcClient.pipe(
        Effect.flatMap((ipc) => ipc.terminal.unsubscribeFromRunner({ subscriptionId })),
        Effect.runPromise
      ).catch(console.error)

      this.subscriptions.delete(processId)
    }

    if (listener) {
      window.electron.ipcRenderer.removeListener(`terminal:stream:${processId}`, listener)
      this.listeners.delete(processId)
    }
  }

  unsubscribeAll() {
    Array.from(this.subscriptions.keys()).forEach((processId) => {
      this.unsubscribe(processId)
    })
  }
}

export const terminalSubscriptionManager = new TerminalSubscriptionManager()
```

### 3.2 Create XTerm Terminal Component

**File**: `src/renderer/components/terminal/XTerminal.tsx`

```typescript
import React, { useEffect, useRef, useCallback, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import '@xterm/xterm/css/xterm.css'
import { useAtomValue, useAtomRefresh } from '@effect-atom/atom-react'
import { Result } from '@effect-atom/atom-react'
import { runnerOutputAtom, terminalSubscriptionManager } from '../../atoms/terminal-atoms'
import { OutputChunk, ProcessEvent } from '../../../shared/schemas/terminal'
import { cn } from '../../lib/utils'

interface XTerminalProps {
  processId: string
  className?: string
  onData?: (data: string) => void
  onResize?: (rows: number, cols: number) => void
  isActive?: boolean
}

export function XTerminal({
  processId,
  className,
  onData,
  onResize,
  isActive = true,
}: XTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const searchAddonRef = useRef<SearchAddon | null>(null)
  const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null)

  const outputResult = useAtomValue(runnerOutputAtom(processId))
  const refreshOutput = useAtomRefresh(runnerOutputAtom(processId))

  // Initialize terminal
  useEffect(() => {
    if (!terminalRef.current) return

    const terminal = new Terminal({
      theme: {
        background: '#0a0a0a',
        foreground: '#e4e4e7',
        black: '#27272a',
        red: '#ef4444',
        green: '#10b981',
        yellow: '#fbbf24',
        blue: '#3b82f6',
        magenta: '#8b5cf6',
        cyan: '#06b6d4',
        white: '#e4e4e7',
        brightBlack: '#52525b',
        brightRed: '#f87171',
        brightGreen: '#34d399',
        brightYellow: '#fde047',
        brightBlue: '#60a5fa',
        brightMagenta: '#a78bfa',
        brightCyan: '#22d3ee',
        brightWhite: '#f4f4f5',
        cursor: '#fbbf24',
        cursorAccent: '#0a0a0a',
        selectionBackground: '#3b82f6',
        selectionForeground: '#ffffff',
      },
      fontFamily: '"JetBrains Mono", "Cascadia Code", "Fira Code", monospace',
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 1000,
      convertEol: true,
    })

    xtermRef.current = terminal

    // Add addons
    const fitAddon = new FitAddon()
    fitAddonRef.current = fitAddon
    terminal.loadAddon(fitAddon)

    const searchAddon = new SearchAddon()
    searchAddonRef.current = searchAddon
    terminal.loadAddon(searchAddon)

    const webLinksAddon = new WebLinksAddon()
    terminal.loadAddon(webLinksAddon)

    // Open terminal
    terminal.open(terminalRef.current)

    // Initial fit
    setTimeout(() => fitAddon.fit(), 0)

    // Handle input
    terminal.onData((data) => {
      onData?.(data)
    })

    // Handle resize
    terminal.onResize(({ rows, cols }) => {
      onResize?.(rows, cols)
    })

    return () => {
      subscriptionRef.current?.unsubscribe()
      terminal.dispose()
    }
  }, [processId])

  // Subscribe to output stream
  useEffect(() => {
    if (!xtermRef.current) return

    const terminal = xtermRef.current

    // Subscribe to terminal output
    Effect.runPromise(
      terminalSubscriptionManager.subscribe(processId, (data) => {
        if ('data' in data && 'type' in data) {
          // OutputChunk
          const chunk = data as OutputChunk
          terminal.write(chunk.data)
        } else {
          // ProcessEvent
          const event = data as ProcessEvent
          if (event.type === 'stopped' || event.type === 'error') {
            terminal.write(`\r\n\x1b[31m[Process ${event.type}]\x1b[0m\r\n`)
          }
        }
      })
    ).then((subscription) => {
      subscriptionRef.current = subscription
    }).catch(console.error)

    return () => {
      subscriptionRef.current?.unsubscribe()
    }
  }, [processId])

  // Load existing output
  useEffect(() => {
    if (!xtermRef.current) return

    Result.match(outputResult, {
      onSuccess: (lines) => {
        if (lines.length > 0) {
          xtermRef.current!.write(lines.join('\n'))
        }
      },
      onError: () => {},
      onInitial: () => {},
    })
  }, [outputResult])

  // Handle active state changes
  useEffect(() => {
    if (!xtermRef.current) return

    if (isActive) {
      xtermRef.current.focus()
    } else {
      xtermRef.current.blur()
    }
  }, [isActive])

  // Handle resize
  useEffect(() => {
    if (!fitAddonRef.current) return

    const handleResize = () => {
      fitAddonRef.current?.fit()
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    if (!xtermRef.current || !searchAddonRef.current) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isActive) return

      // Ctrl+F: Search
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        const searchTerm = prompt('Search for:')
        if (searchTerm) {
          searchAddonRef.current?.findNext(searchTerm)
        }
      }

      // Ctrl+Shift+C: Copy
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
        e.preventDefault()
        const selection = xtermRef.current?.getSelection()
        if (selection) {
          navigator.clipboard.writeText(selection)
        }
      }

      // Ctrl+Shift+V: Paste
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'V') {
        e.preventDefault()
        navigator.clipboard.readText().then((text) => {
          onData?.(text)
        })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isActive, onData])

  return (
    <div
      ref={terminalRef}
      className={cn(
        'w-full h-full bg-black rounded-lg overflow-hidden',
        isActive && 'ring-2 ring-blue-500',
        className
      )}
    />
  )
}
```

### 3.3 Create Terminal LED Indicator

**File**: `src/renderer/components/terminal/TerminalLED.tsx`

```typescript
import React from 'react'
import { cn } from '../../lib/utils'
import { ProcessState } from '../../../shared/schemas/terminal'

interface TerminalLEDProps {
  state: ProcessState
  label?: string
  onClick?: () => void
  isActive?: boolean
  className?: string
}

export function TerminalLED({ state, label, onClick, isActive, className }: TerminalLEDProps) {
  const getStatusColor = () => {
    switch (state.status) {
      case 'running':
        return 'bg-green-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]'
      case 'idle':
        return 'bg-yellow-500 shadow-[0_0_10px_rgba(251,191,36,0.8)]'
      case 'starting':
        return 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)] animate-pulse'
      case 'error':
        return 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]'
      case 'stopped':
      default:
        return 'bg-gray-600'
    }
  }

  const getStatusText = () => {
    switch (state.status) {
      case 'running':
        return 'Running'
      case 'idle':
        return 'Idle'
      case 'starting':
        return 'Starting...'
      case 'error':
        return 'Error'
      case 'stopped':
        return 'Stopped'
    }
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        'group flex items-center gap-2 px-3 py-1.5 rounded-full',
        'bg-gray-900/90 backdrop-blur-sm border',
        isActive ? 'border-blue-500 bg-blue-950/50' : 'border-gray-700 hover:border-gray-600',
        'transition-all duration-200',
        onClick && 'cursor-pointer hover:scale-105',
        className
      )}
      title={`${label || `Process ${state.pid || 'N/A'}`}: ${getStatusText()}`}
    >
      <div className={cn('w-2 h-2 rounded-full', getStatusColor())} />
      {label && (
        <span className="text-xs font-medium text-gray-300 group-hover:text-white">
          {label}
        </span>
      )}
      <span className="text-xs text-gray-500">
        {getStatusText()}
      </span>
    </button>
  )
}
```

### 3.4 Create Terminal Panel Component

**File**: `src/renderer/components/terminal/TerminalPanel.tsx`

```typescript
import React, { useState, useCallback, useEffect } from 'react'
import { useAtomValue, useAtomRefresh } from '@effect-atom/atom-react'
import { Result } from '@effect-atom/atom-react'
import { activeRunnersAtom, runnerStateAtom } from '../../atoms/terminal-atoms'
import { XTerminal } from './XTerminal'
import { TerminalLED } from './TerminalLED'
import { cn } from '../../lib/utils'
import { X, Maximize2, Minimize2, RotateCcw, Plus } from 'lucide-react'
import { useTerminalOperations } from '../../hooks/useTerminalOperations'

interface TerminalPanelProps {
  className?: string
  onClose?: () => void
}

export function TerminalPanel({ className, onClose }: TerminalPanelProps) {
  const runnersResult = useAtomValue(activeRunnersAtom)
  const refreshRunners = useAtomRefresh(activeRunnersAtom)
  const { writeToRunner, resizeRunner, killRunner, restartRunner } = useTerminalOperations()

  const [activeProcessId, setActiveProcessId] = useState<string | null>(null)
  const [isMaximized, setIsMaximized] = useState(false)

  // Auto-select first runner
  useEffect(() => {
    Result.match(runnersResult, {
      onSuccess: (runners) => {
        if (runners.length > 0 && !activeProcessId) {
          setActiveProcessId(runners[0].processId)
        }
      },
      onError: () => {},
      onInitial: () => {},
    })
  }, [runnersResult, activeProcessId])

  const handleTerminalData = useCallback((data: string) => {
    if (activeProcessId) {
      writeToRunner(activeProcessId, data)
    }
  }, [activeProcessId, writeToRunner])

  const handleTerminalResize = useCallback((rows: number, cols: number) => {
    if (activeProcessId) {
      resizeRunner(activeProcessId, rows, cols)
    }
  }, [activeProcessId, resizeRunner])

  const handleKillProcess = useCallback((processId: string) => {
    killRunner(processId).then(() => {
      refreshRunners()
      if (processId === activeProcessId) {
        setActiveProcessId(null)
      }
    })
  }, [activeProcessId, killRunner, refreshRunners])

  const handleRestartProcess = useCallback((processId: string) => {
    restartRunner(processId).then(() => {
      refreshRunners()
    })
  }, [restartRunner, refreshRunners])

  return (
    <div
      className={cn(
        'flex flex-col bg-gray-950/95 backdrop-blur-xl border border-gray-800 rounded-xl shadow-2xl',
        isMaximized ? 'fixed inset-4 z-50' : 'relative',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-200">AI Runners Terminal</h3>
          <span className="text-xs text-gray-500">
            {Result.match(runnersResult, {
              onSuccess: (runners) => `${runners.length} active`,
              onError: () => 'Error',
              onInitial: () => 'Loading...',
            })}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => refreshRunners()}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors"
            title="Refresh"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            onClick={() => setIsMaximized(!isMaximized)}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors"
            title={isMaximized ? 'Restore' : 'Maximize'}
          >
            {isMaximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* LED Status Bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-800 overflow-x-auto">
        {Result.builder(runnersResult)
          .onSuccess((runners) => (
            <>
              {runners.map((runner) => {
                const stateResult = useAtomValue(runnerStateAtom(runner.processId))

                return Result.builder(stateResult)
                  .onSuccess((state) => (
                    <TerminalLED
                      key={runner.processId}
                      state={state}
                      label={runner.issueContext ? `#${runner.issueContext.issueNumber}` : runner.agentType}
                      isActive={runner.processId === activeProcessId}
                      onClick={() => setActiveProcessId(runner.processId)}
                    />
                  ))
                  .onInitial(() => (
                    <TerminalLED
                      key={runner.processId}
                      state={runner.state}
                      label={runner.issueContext ? `#${runner.issueContext.issueNumber}` : runner.agentType}
                      isActive={runner.processId === activeProcessId}
                      onClick={() => setActiveProcessId(runner.processId)}
                    />
                  ))
                  .onError(() => null)
                  .render()
              })}
            </>
          ))
          .onInitial(() => (
            <div className="text-xs text-gray-500">Loading runners...</div>
          ))
          .onError((error) => (
            <div className="text-xs text-red-500">Error loading runners</div>
          ))
          .render()}
      </div>

      {/* Terminal Content */}
      <div className="flex-1 min-h-0 p-4">
        {activeProcessId ? (
          <XTerminal
            processId={activeProcessId}
            className="h-full"
            onData={handleTerminalData}
            onResize={handleTerminalResize}
            isActive={true}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <p className="mb-2">No active runners</p>
              <p className="text-xs">Launch AI runners from the Issues modal</p>
            </div>
          </div>
        )}
      </div>

      {/* Footer Controls */}
      {activeProcessId && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-gray-800">
          <div className="text-xs text-gray-500">
            Process: {activeProcessId}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleRestartProcess(activeProcessId)}
              className="px-3 py-1 text-xs font-medium text-blue-400 hover:text-blue-300 hover:bg-blue-950/50 rounded transition-colors"
            >
              Restart
            </button>
            <button
              onClick={() => handleKillProcess(activeProcessId)}
              className="px-3 py-1 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-950/50 rounded transition-colors"
            >
              Kill
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
```

---

## Phase 4: Integration & Testing (2 hours)

### 4.1 Create Terminal Operations Hook

**File**: `src/renderer/hooks/useTerminalOperations.ts`

```typescript
import { useCallback } from 'react'
import { Effect } from 'effect'
import { ElectronIpcClient } from '../lib/ipc-client'
import { SpawnRunnerInput } from '../../shared/schemas/terminal'

export function useTerminalOperations() {
  const spawnRunner = useCallback(async (input: SpawnRunnerInput) => {
    return Effect.runPromise(
      ElectronIpcClient.pipe(
        Effect.flatMap((ipc) => ipc.terminal.spawnRunner(input))
      )
    )
  }, [])

  const killRunner = useCallback(async (processId: string) => {
    return Effect.runPromise(
      ElectronIpcClient.pipe(
        Effect.flatMap((ipc) => ipc.terminal.killRunner({ processId }))
      )
    )
  }, [])

  const killAllRunners = useCallback(async () => {
    return Effect.runPromise(
      ElectronIpcClient.pipe(
        Effect.flatMap((ipc) => ipc.terminal.killAllRunners())
      )
    )
  }, [])

  const restartRunner = useCallback(async (processId: string) => {
    return Effect.runPromise(
      ElectronIpcClient.pipe(
        Effect.flatMap((ipc) => ipc.terminal.restartRunner({ processId }))
      )
    )
  }, [])

  const writeToRunner = useCallback(async (processId: string, data: string) => {
    return Effect.runPromise(
      ElectronIpcClient.pipe(
        Effect.flatMap((ipc) => ipc.terminal.writeToRunner({ processId, data }))
      )
    )
  }, [])

  const resizeRunner = useCallback(async (processId: string, rows: number, cols: number) => {
    return Effect.runPromise(
      ElectronIpcClient.pipe(
        Effect.flatMap((ipc) => ipc.terminal.resizeRunner({ processId, rows, cols }))
      )
    )
  }, [])

  return {
    spawnRunner,
    killRunner,
    killAllRunners,
    restartRunner,
    writeToRunner,
    resizeRunner,
  }
}
```

### 4.2 Update Main Layer

**File**: `src/main/index.ts` (additions)

```typescript
import { NodePtyTerminalAdapterLayer } from './terminal/node-pty/adapter'
import { TerminalRegistry } from './terminal/terminal-registry'
import { TerminalService } from './terminal/terminal-service'
import { registerTerminalHandlers } from './ipc/terminal-handlers'

// Add to MainLayer composition
const TerminalLayer = Layer.mergeAll(
  NodePtyTerminalAdapterLayer,
  TerminalRegistry.Default,
  TerminalService.Default
)

// Update MainLayer
const MainLayer = Layer.mergeAll(
  CoreInfrastructureLayer,
  GitHubLayer,
  AiProviderLayer,
  TerminalLayer, // Add this
  // ... other layers
)

// Add terminal handlers registration
yield* registerTerminalHandlers()
```

### 4.3 Update IPC Client

**File**: `src/renderer/lib/ipc-client.ts` (additions)

```typescript
import { TerminalIpcContracts } from '../../shared/ipc-contracts/terminal-contracts'

// Add terminal namespace
const terminal = {
  spawnRunner: createIpcMethod(TerminalIpcContracts.spawnRunner),
  killRunner: createIpcMethod(TerminalIpcContracts.killRunner),
  killAllRunners: createIpcMethod(TerminalIpcContracts.killAllRunners),
  restartRunner: createIpcMethod(TerminalIpcContracts.restartRunner),
  writeToRunner: createIpcMethod(TerminalIpcContracts.writeToRunner),
  resizeRunner: createIpcMethod(TerminalIpcContracts.resizeRunner),
  getRunnerState: createIpcMethod(TerminalIpcContracts.getRunnerState),
  listActiveRunners: createIpcMethod(TerminalIpcContracts.listActiveRunners),
  subscribeToRunner: createIpcMethod(TerminalIpcContracts.subscribeToRunner),
  unsubscribeFromRunner: createIpcMethod(TerminalIpcContracts.unsubscribeFromRunner),
}

// Add to client object
return {
  github,
  aiProvider,
  terminal, // Add this
  // ... other namespaces
}
```

### 4.4 Update Issues Modal to Use Terminal

**File**: `src/renderer/components/ai-runners/IssuesModal.tsx` (modifications)

```typescript
import { useTerminalOperations } from '../../hooks/useTerminalOperations'

// Replace tmux launcher with terminal operations
const { spawnRunner } = useTerminalOperations()

const handleLaunchRunners = async () => {
  // ... existing git worktree setup code ...

  // Replace tmux spawn with terminal spawn
  await spawnRunner({
    accountId: selectedAccount.id,
    agentType: issue.agentType || globalAgentType,
    prompt: generatePrompt(issue),
    issueContext: {
      owner,
      repo,
      issueNumber: issue.number,
      issueTitle: issue.title,
      worktreePath,
      branchName,
    },
  })
}
```

### 4.5 Add Terminal Panel to Main Layout

**File**: `src/renderer/App.tsx` (modifications)

```typescript
import { TerminalPanel } from './components/terminal/TerminalPanel'

// Add state for terminal visibility
const [showTerminal, setShowTerminal] = useState(false)

// Add toggle button and panel
<div className="flex flex-col h-full">
  {/* Existing header/content */}

  {/* Terminal Toggle Button */}
  <button
    onClick={() => setShowTerminal(!showTerminal)}
    className="fixed bottom-4 right-4 p-3 bg-blue-600 hover:bg-blue-700 rounded-full shadow-lg transition-colors"
    title="Toggle Terminal"
  >
    <Terminal className="h-5 w-5 text-white" />
  </button>

  {/* Terminal Panel */}
  {showTerminal && (
    <div className="fixed bottom-0 left-0 right-0 h-1/2 z-40">
      <TerminalPanel
        onClose={() => setShowTerminal(false)}
      />
    </div>
  )}
</div>
```

---

## Testing Checklist

### Phase 1: Architecture
- [ ] Compile with `pnpm compile:app`
- [ ] Verify no TypeScript errors
- [ ] Check Layer composition in `src/main/index.ts`

### Phase 2: IPC
- [ ] Test spawn runner IPC call
- [ ] Test kill runner IPC call
- [ ] Test stream subscription
- [ ] Verify error handling for invalid process IDs

### Phase 3: UI Components
- [ ] Terminal renders correctly
- [ ] LED indicators show correct status colors
- [ ] Process switching works
- [ ] Terminal accepts keyboard input
- [ ] Copy/paste functionality works
- [ ] Resize handling works

### Phase 4: Integration
- [ ] Launch runner from Issues modal
- [ ] Verify process appears in terminal panel
- [ ] Test multiple concurrent runners
- [ ] Test restart functionality
- [ ] Test kill functionality
- [ ] Verify cleanup on app close

## Package Dependencies

Add to `package.json`:

```json
{
  "dependencies": {
    "node-pty": "^1.0.0",
    "@xterm/xterm": "^5.5.0",
    "@xterm/addon-fit": "^0.10.0",
    "@xterm/addon-web-links": "^0.11.0",
    "@xterm/addon-search": "^0.15.0"
  }
}
```

## Performance Considerations

1. **Terminal Output Buffering**: Limit to 1000 lines per process
2. **Stream Throttling**: Consider adding throttle for high-frequency output
3. **Lazy Terminal Initialization**: Only create Terminal instances for visible processes
4. **Process Cleanup**: Ensure all processes are killed on app close
5. **Memory Management**: Clear output buffers when processes are killed

## Security Considerations

1. **Input Sanitization**: Sanitize all terminal input to prevent injection
2. **Process Isolation**: Each runner runs in its own PTY process
3. **Environment Variables**: Only pass necessary env vars to child processes
4. **File System Access**: Restrict to worktree directories
5. **Command Validation**: Validate AI agent commands before execution

## Migration Notes

### From tmux to xterm.js

1. **Session Management**: Replace tmux sessions with process registry
2. **Window Switching**: Replace tmux windows with LED-based switching
3. **Output Capture**: Replace tmux capture-pane with PTY streams
4. **Process Lifecycle**: Direct PTY control instead of tmux commands
5. **Terminal Emulation**: xterm.js provides full terminal emulation

### Backward Compatibility

- Keep tmux adapter as fallback option
- Allow configuration toggle between tmux and xterm.js
- Migrate existing tmux sessions on startup

## Future Enhancements

1. **Terminal Tabs**: Add tab interface for multiple terminals
2. **Split Panes**: Support split terminal views
3. **Session Persistence**: Save/restore terminal sessions
4. **Theme Customization**: User-configurable terminal themes
5. **Advanced Search**: Regex search, search highlighting
6. **Terminal Recording**: Record and replay terminal sessions
7. **Collaborative Terminals**: Share terminal sessions between users

## Conclusion

This plan provides a complete migration path from tmux-based AI runners to an integrated xterm.js terminal solution. The implementation follows our established patterns:

- **Hexagonal Architecture**: Clean port/adapter separation
- **Effect-TS Patterns**: Type-safe service composition
- **IPC Contracts**: Schema-validated communication
- **React Best Practices**: Memoization, proper hooks usage
- **Domain-Driven Design**: Clear domain boundaries

The new terminal system will provide better integration, improved UX, and native performance while maintaining the flexibility to add new terminal providers in the future.
