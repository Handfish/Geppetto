# Geppetto: Tmux AI Watchers & Process Monitoring Architecture

## Executive Summary

This document provides a comprehensive architectural analysis for integrating tmux-based session management with AI agent watchers, process monitoring, and multi-provider support into Geppetto using hexagonal architecture principles.

The integration leverages:
1. **TmuxPrompts Design**: Structured concurrency, scoped fibers, rolling logs, activity tracking
2. **Error-Refactor-Plan**: Hexagonal ports, typed errors, gradient degradation  
3. **Geppetto's Current Architecture**: Provider adapters, domain-driven organization, Effect services

---

## Part 1: Current Architecture Analysis

### 1.1 Geppetto's Three-Layer Hexagonal Model

Geppetto already implements hexagonal architecture across multiple concerns:

```
┌─────────────────────────────────────┐
│   Domain Layer (Adapters)           │
├─────────────────────────────────────┤
│ ProviderAdapter ←→ ProviderPort     │
│ AiProviderAdapter ←→ AiProviderPort │
│ GitCommandRunnerPort                │
└─────────────────────────────────────┘
          ↓         ↓         ↓
┌─────────────────────────────────────┐
│   Service Layer (Implementations)   │
├─────────────────────────────────────┤
│ VcsProviderService                  │
│ AiProviderService                   │
│ GitCommandService                   │
│ WorkspaceService                    │
└─────────────────────────────────────┘
          ↓         ↓         ↓
┌─────────────────────────────────────┐
│   Infrastructure (Runners)          │
├─────────────────────────────────────┤
│ NodeGitCommandRunner (spawns child) │
│ BrowserAuthService (Electron)       │
│ ElectronSessionService (browser API)│
└─────────────────────────────────────┘
```

**Key Files:**
- `src/main/providers/ports.ts` - ProviderAdapter interface (primary port)
- `src/main/ai/ports.ts` - AiProviderAdapter interface (primary port)
- `src/main/source-control/ports.ts` - GitCommandRunnerPort (secondary port)
- `src/main/*/index.ts` - Service implementations
- `src/main/index.ts` - Layer composition

### 1.2 Domain-Driven Organization

Geppetto uses domain-per-folder organization:

```
src/main/
├── github/              # GitHub provider domain
├── gitlab/              # GitLab provider domain
├── bitbucket/           # Bitbucket provider domain
├── ai/                  # AI providers domain (openai, claude, cursor)
├── source-control/      # Git execution domain
├── ipc/                 # IPC handlers (cross-process)
├── workspace/           # Workspace management
└── ai-watchers/         # NEW: AI agent watchers
```

### 1.3 Error Handling Strategy (From error-refactor-plan)

**Defect vs Typed Error Decision:**
- External system errors → TYPED ERROR
- Authentication/authorization → TYPED ERROR
- Resource not found → TYPED ERROR
- Tier/feature limits → TYPED ERROR (TierLimitError)
- Schema validation → TYPED ERROR (ValidationError)
- Git operations → TYPED ERROR (GitOperationError)
- Programming bugs → DEFECT (<5%)

---

## Part 2: TmuxPrompts Design Integration

### 2.1 TmuxPrompts Core Concepts

The TmuxPrompts design provides:

1. **Detached Sessions**: Process runs in tmux, user can attach/detach
2. **Streaming I/O**: Capture stdout/stderr with backpressure handling
3. **Rolling Logs**: 100MB files with automatic rotation
4. **Activity Tracking**: Idle/active detection based on output
5. **Structured Concurrency**: `Effect.forkScoped` with automatic cleanup
6. **Multiple Interactive Modes**: TTY, PTY, tmux, basic

Key patterns:
- `Effect.scoped` creates scope for lifetime management
- `Effect.forkScoped` ties background fibers to scope
- `Ref` for thread-safe state (activity tracking)
- `Deferred` for process exit synchronization
- `Queue` for backpressure-aware streaming
- `Stream` for composable I/O processing

---

## Part 3: Integration Architecture

### 3.1 New Port: ProcessMonitorPort

**File:** `src/main/ai-watchers/ports.ts`

Port for monitoring long-running processes (builds, tests, AI executions):

```typescript
export type ProcessEvent =
  | { _tag: "output"; source: "stdout" | "stderr"; data: string; timestamp: number }
  | { _tag: "activity"; state: "idle" | "active"; timestamp: number }
  | { _tag: "exit"; exitCode: number; timestamp: number }
  | { _tag: "error"; error: ProcessMonitorError; timestamp: number }

export interface ProcessMonitorHandle {
  readonly processId: string
  readonly sessionInfo: TmuxSessionInfo
  readonly events: Stream.Stream<ProcessEvent, never, never>
  readonly getActivityState: Effect.Effect<"idle" | "active">
  readonly terminate: Effect.Effect<void, ProcessMonitorError>
}

export interface ProcessMonitorPort {
  spawn(
    command: string,
    args: readonly string[],
    options: ProcessMonitorOptions
  ): Effect.Effect<ProcessMonitorHandle, ProcessMonitorError, Scope.Scope>

  monitorExisting(
    sessionName: string,
    options: ProcessMonitorOptions
  ): Effect.Effect<ProcessMonitorHandle, ProcessMonitorError, Scope.Scope>
}
```

### 3.2 New Port: AiWatcherPort

**File:** `src/main/ai-watchers/ports.ts`

```typescript
export type AiWatcherStatus = "idle" | "running" | "paused" | "completed" | "failed"

export interface AiWatcherConfig {
  readonly watcherId: string
  readonly provider: AiProviderType
  readonly operation: string
  readonly sessionName: string
  readonly accountId: AiAccountId
  readonly maxDuration?: Duration
  readonly outputDir?: string
}

export interface AiWatcherHandle {
  readonly watcherId: string
  readonly status: Effect.Effect<AiWatcherStatus>
  readonly events: Stream.Stream<AiWatcherEvent, never, never>
  readonly metrics: Effect.Effect<AiWatcherMetrics>
  readonly attachToSession: Effect.Effect<void>
  readonly pauseWatcher: Effect.Effect<void>
  readonly resumeWatcher: Effect.Effect<void>
  readonly terminateWatcher: Effect.Effect<void>
  readonly waitForCompletion: Effect.Effect<AiWatcherResult>
}

export interface AiWatcherPort {
  startWatcher(config: AiWatcherConfig): 
    Effect.Effect<AiWatcherHandle, AiWatcherError, Scope.Scope>
  getWatcher(watcherId: string): 
    Effect.Effect<AiWatcherHandle, AiWatcherError>
  listWatchers(): 
    Effect.Effect<ReadonlyArray<{ watcherId: string; status: AiWatcherStatus }>>
}
```

### 3.3 Domain Errors

**File:** `src/main/ai-watchers/errors.ts`

```typescript
export class ProcessMonitorError extends S.TaggedError<ProcessMonitorError>(
  'ProcessMonitorError'
)('ProcessMonitorError', {
  processId: S.String,
  message: S.String,
  cause: S.optional(S.String),
}) {}

export class AiWatcherError extends S.TaggedError<AiWatcherError>(
  'AiWatcherError'
)('AiWatcherError', {
  watcherId: S.String,
  provider: S.String,
  operation: S.optional(S.String),
  message: S.String,
}) {}

export class TmuxSessionError extends S.TaggedError<TmuxSessionError>(
  'TmuxSessionError'
)('TmuxSessionError', {
  sessionName: S.String,
  message: S.String,
  cause: S.optional(S.String),
}) {}

export type AiWatcherDomainError =
  | ProcessMonitorError
  | AiWatcherError
  | TmuxSessionError
```

### 3.4 Service Layer

**File:** `src/main/ai-watchers/tmux-session-manager.ts`

```typescript
export const TmuxSessionManagerService = Effect.Service.make<TmuxSessionManagerPort>(
  "TmuxSessionManager"
)(
  Effect.gen(function* () {
    const fileManager = makeFileManager(defaultConfig)
    const activityTracker = yield* makeActivityTracker(defaultConfig)

    const createSession = (config: TmuxSessionConfig) =>
      Effect.gen(function* () {
        // Using tmux-logger patterns
        yield* fileManager.ensureDirectory
        
        // Create tmux session
        const sessionHandle = yield* spawnTmuxSession(config)
        
        // Setup pipe-pane for logging
        yield* setupPipePane(sessionHandle, fileManager)
        
        // Return session info
        return { sessionName: config.sessionName, attachCommand: ... }
      })

    return { createSession }
  })
)
```

### 3.5 Service Composition

**Update:** `src/main/index.ts`

```typescript
import { TmuxSessionManagerService } from './ai-watchers/tmux-session-manager'
import { ProcessMonitorService } from './ai-watchers/process-monitor'
import { AiWatcherRegistry } from './ai-watchers/ai-watcher-registry'

const MainLayer = Layer.mergeAll(
  // Existing services
  GitHubHttpService.Default,
  AiProviderService.Default,
  GitCommandService.Default,

  // New AI Watchers
  TmuxSessionManagerService.Default,
  ProcessMonitorService.Default,
  AiWatcherRegistry.Default,
)
```

---

## Part 4: Error Handling

### 4.1 Error Mapping

**Update:** `src/main/ipc/error-mapper.ts`

```typescript
import {
  ProcessMonitorError,
  AiWatcherError,
  TmuxSessionError,
} from '../ai-watchers/errors'

export const mapDomainErrorToIpcError = (error: unknown) => {
  if (error instanceof ProcessMonitorError) {
    return Effect.succeed({
      _tag: 'Error' as const,
      error: new ProcessOperationError({
        message: error.message,
        processId: error.processId,
      }),
    })
  }

  if (error instanceof AiWatcherError) {
    return Effect.succeed({
      _tag: 'Error' as const,
      error: new AiProviderOperationError({
        provider: error.provider as AiProviderType,
        message: error.message,
        operation: error.operation,
      }),
    })
  }

  // ... existing mappings ...
}
```

### 4.2 Shared Error Types

**Update:** `src/shared/schemas/errors.ts`

```typescript
export class ProcessOperationError extends S.TaggedError<ProcessOperationError>(
  'ProcessOperationError'
)('ProcessOperationError', {
  processId: S.optional(S.String),
  message: S.String,
}) {}

export class AiProviderOperationError extends S.TaggedError<AiProviderOperationError>(
  'AiProviderOperationError'
)('AiProviderOperationError', {
  provider: ProviderType,
  operation: S.optional(S.String),
  message: S.String,
}) {}

export type IpcError =
  | AuthenticationError
  | NetworkError
  | NotFoundError
  | TierLimitError
  | GitOperationError
  | ValidationError
  | ProcessOperationError           // NEW
  | AiProviderOperationError        // NEW
  | /* ... existing ... */
```

---

## Part 5: IPC Integration

### 5.1 IPC Contracts

**File:** `src/shared/ipc-contracts.ts`

```typescript
export const AiWatcherIpcContracts = {
  startWatcher: {
    channel: 'ai-watcher:start' as const,
    input: S.Struct({
      watcherId: S.String,
      provider: AiProviderType,
      operation: S.String,
      sessionName: S.String,
    }),
    output: S.Struct({
      watcherId: S.String,
      sessionName: S.String,
      attachCommand: S.String,
    }),
    errors: S.Union(
      AiWatcherError,
      ProcessMonitorError,
      TierLimitError,
      AuthenticationError
    ),
  },

  stopWatcher: {
    channel: 'ai-watcher:stop' as const,
    input: S.Struct({ watcherId: S.String }),
    output: S.Struct({ success: S.Boolean }),
    errors: S.Union(AiWatcherError, ProcessMonitorError),
  },

  listWatchers: {
    channel: 'ai-watcher:list' as const,
    input: S.Void,
    output: S.Array(S.Struct({
      watcherId: S.String,
      provider: AiProviderType,
      status: AiWatcherStatus,
    })),
    errors: S.Union(AiWatcherError),
  },
} as const
```

### 5.2 IPC Handlers

**File:** `src/main/ipc/ai-watcher-handlers.ts`

```typescript
export const setupAiWatcherIpcHandlers = Effect.gen(function* () {
  const watcherRegistry = yield* AiWatcherRegistry

  const setupHandler = <K extends keyof typeof AiWatcherIpcContracts, E>(
    key: K,
    handler: (input: ContractInput<K>) => Effect.Effect<ContractOutput<K>, E>
  ) => {
    const contract = AiWatcherIpcContracts[key]

    type InputSchema = S.Schema<
      ContractInput<K>,
      S.Schema.Encoded<typeof AiWatcherIpcContracts[K]['input']>
    >
    type OutputSchema = S.Schema<
      ContractOutput<K>,
      S.Schema.Encoded<typeof AiWatcherIpcContracts[K]['output']>
    >

    ipcMain.handle(contract.channel, async (_event, input: unknown) => {
      const program = Effect.gen(function* () {
        const validatedInput = yield* S.decodeUnknown(
          contract.input as unknown as InputSchema
        )(input)
        const result = yield* handler(validatedInput)
        const encoded = yield* S.encode(
          contract.output as unknown as OutputSchema
        )(result)
        return encoded
      }).pipe(Effect.catchAll(mapDomainErrorToIpcError))

      return await Effect.runPromise(program)
    })
  }

  setupHandler('startWatcher', (input) =>
    watcherRegistry.startWatcher({
      watcherId: input.watcherId,
      provider: input.provider,
      operation: input.operation,
      sessionName: input.sessionName,
      accountId: /* from context */,
    })
  )

  setupHandler('stopWatcher', (input) =>
    watcherRegistry.getWatcher(input.watcherId).pipe(
      Effect.flatMap(watcher => watcher.terminateWatcher)
    )
  )

  setupHandler('listWatchers', () =>
    watcherRegistry.listWatchers()
  )
})
```

**Update:** `src/main/index.ts`

```typescript
app.whenReady().then(async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      yield* setupAccountIpcHandlers
      yield* setupProviderIpcHandlers
      yield* setupAiProviderIpcHandlers
      yield* setupWorkspaceIpcHandlers
      yield* setupAiWatcherIpcHandlers  // NEW
    }).pipe(Effect.provide(MainLayer))
  )
  // ...
})
```

---

## Part 6: Renderer Integration

### 6.1 Atoms

**File:** `src/renderer/atoms/ai-watcher-atoms.ts`

```typescript
export const aiWatchersAtom = Atom.make(
  Effect.gen(function* () {
    const client = yield* AiWatcherClient
    return yield* client.listWatchers()
  }).pipe(
    Atom.withReactivityKeys(['ai-watcher:list']),
    Atom.setIdleTTL(Duration.seconds(5))
  )
)

export const aiWatcherMetricsAtom = Atom.family((watcherId: string) =>
  Atom.make(
    Effect.gen(function* () {
      const client = yield* AiWatcherClient
      return yield* client.getWatcherMetrics(watcherId)
    })
  ).pipe(
    Atom.withReactivityKeys(['ai-watcher:metrics', watcherId]),
    Atom.setIdleTTL(Duration.seconds(5))
  )
)
```

### 6.2 Components

**File:** `src/renderer/components/AiWatcherMonitor.tsx`

```typescript
export function AiWatcherMonitor({ watcherId }: { watcherId: string }) {
  const metricsResult = useAtomValue(aiWatcherMetricsAtom(watcherId))

  return Result.builder(metricsResult)
    .onInitial(() => <LoadingSpinner />)
    .onErrorTag('ProcessOperationError', (error) => (
      <ErrorAlert error={error} />
    ))
    .onErrorTag('AiProviderOperationError', (error) => (
      <ErrorAlert error={error} />
    ))
    .onDefect((defect) => {
      console.error('[AiWatcherMonitor]', defect)
      return <ErrorAlert message={String(defect)} />
    })
    .onSuccess((metrics) => (
      <div className="space-y-4">
        <WatcherStats metrics={metrics} />
        <TmuxSessionInfo watcherId={watcherId} />
      </div>
    ))
    .render()
}
```

---

## Part 7: Benefits & Outcomes

### For Users

1. **Interactive Monitoring**: Attach to running tasks: `tmux attach -t <session>`
2. **Detachable Sessions**: Detach anytime (Ctrl+B, D), continue running
3. **Full Logging**: All I/O captured to rolling log files
4. **Activity Tracking**: See if task is idle or active
5. **No Lockups**: Errors never block the UI

### For Developers

1. **Type Safety**: Typed errors end-to-end
2. **Reusable**: Patterns apply to all multi-provider scenarios
3. **Testable**: Services use Effect DI for easy mocking
4. **Maintainable**: Clear separation of concerns (ports/adapters)
5. **Extensible**: Easy to add new providers or backends

---

## Part 8: Implementation Checklist

### Phase 1: Foundation (Week 1)

- [ ] Create `src/main/ai-watchers/` directory
- [ ] Define ports in `ports.ts`
- [ ] Define errors in `errors.ts`
- [ ] Create `TmuxSessionManagerService`
- [ ] Write unit tests

### Phase 2: Service Implementation (Week 2)

- [ ] Implement `ProcessMonitorService` (tmux-based adapter)
- [ ] Implement `AiWatcherService` (high-level orchestration)
- [ ] Implement `AiWatcherRegistry` (multi-watcher management)
- [ ] Update error mapper
- [ ] Update `MainLayer`

### Phase 3: IPC & Renderer (Week 3)

- [ ] Create IPC contracts
- [ ] Implement IPC handlers
- [ ] Create shared error types
- [ ] Create renderer atoms
- [ ] Create UI components

### Phase 4: Testing & Polish (Week 4)

- [ ] End-to-end error handling tests
- [ ] ConsoleErrorBoundary integration
- [ ] Performance optimization
- [ ] Documentation

---

## Files to Create/Update

### New Files
1. `src/main/ai-watchers/ports.ts`
2. `src/main/ai-watchers/errors.ts`
3. `src/main/ai-watchers/tmux-session-manager.ts`
4. `src/main/ai-watchers/process-monitor.ts`
5. `src/main/ai-watchers/ai-watcher-service.ts`
6. `src/main/ai-watchers/ai-watcher-registry.ts`
7. `src/main/ipc/ai-watcher-handlers.ts`
8. `src/renderer/atoms/ai-watcher-atoms.ts`
9. `src/renderer/components/AiWatcherMonitor.tsx`

### Updated Files
1. `src/main/ipc/error-mapper.ts` - Add AI watcher error mappings
2. `src/shared/schemas/errors.ts` - Add shared error types
3. `src/shared/ipc-contracts.ts` - Add AI watcher contracts
4. `src/main/index.ts` - Add to MainLayer and setup handlers

---

## Key Principles

1. **Hexagonal Architecture**: Clean boundaries via ports
2. **Structured Concurrency**: Proper resource cleanup with `Effect.scoped`
3. **Type Safety**: No `any` types, exhaustive error handling
4. **Multi-Provider Support**: Extensible for any provider
5. **Graceful Error Handling**: Minimal defects, typed errors everywhere

---

## References

- TmuxPrompts: `/home/ken-udovic/Workspace/node/geppetto/docs/TmuxPrompts/`
- Error Refactor: `/home/ken-udovic/Workspace/node/geppetto/docs/error-refactor-plan.md`
- CLAUDE.md: `/home/ken-udovic/Workspace/node/geppetto/CLAUDE.md`

