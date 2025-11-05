# Geppetto: Tmux AI Runners & Process Monitoring Architecture

## Executive Summary

This document provides a comprehensive architectural analysis for integrating tmux-based session management with AI agent runners, process monitoring, and multi-provider support into Geppetto using hexagonal architecture principles.

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
- `src/main/ai-provider-usage-webscraper/ports.ts` - AiProviderAdapter interface (primary port)
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
└── ai-runners/         # NEW: AI agent runners
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

**File:** `src/main/ai-runners/ports.ts`

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

### 3.2 New Port: AiRunnerPort

**File:** `src/main/ai-runners/ports.ts`

```typescript
export type AiRunnerStatus = "idle" | "running" | "paused" | "completed" | "failed"

export interface AiRunnerConfig {
  readonly runnerId: string
  readonly provider: AiProviderType
  readonly operation: string
  readonly sessionName: string
  readonly accountId: AiAccountId
  readonly maxDuration?: Duration
  readonly outputDir?: string
}

export interface AiRunnerHandle {
  readonly runnerId: string
  readonly status: Effect.Effect<AiRunnerStatus>
  readonly events: Stream.Stream<AiRunnerEvent, never, never>
  readonly metrics: Effect.Effect<AiRunnerMetrics>
  readonly attachToSession: Effect.Effect<void>
  readonly pauseRunner: Effect.Effect<void>
  readonly resumeRunner: Effect.Effect<void>
  readonly terminateRunner: Effect.Effect<void>
  readonly waitForCompletion: Effect.Effect<AiRunnerResult>
}

export interface AiRunnerPort {
  startRunner(config: AiRunnerConfig): 
    Effect.Effect<AiRunnerHandle, AiRunnerError, Scope.Scope>
  getRunner(runnerId: string): 
    Effect.Effect<AiRunnerHandle, AiRunnerError>
  listRunners(): 
    Effect.Effect<ReadonlyArray<{ runnerId: string; status: AiRunnerStatus }>>
}
```

### 3.3 Domain Errors

**File:** `src/main/ai-runners/errors.ts`

```typescript
export class ProcessMonitorError extends S.TaggedError<ProcessMonitorError>(
  'ProcessMonitorError'
)('ProcessMonitorError', {
  processId: S.String,
  message: S.String,
  cause: S.optional(S.String),
}) {}

export class AiRunnerError extends S.TaggedError<AiRunnerError>(
  'AiRunnerError'
)('AiRunnerError', {
  runnerId: S.String,
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

export type AiRunnerDomainError =
  | ProcessMonitorError
  | AiRunnerError
  | TmuxSessionError
```

### 3.4 Service Layer

**File:** `src/main/ai-runners/tmux-session-manager.ts`

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
import { TmuxSessionManagerService } from './ai-runners/tmux-session-manager'
import { ProcessMonitorService } from './ai-runners/process-monitor'
import { AiRunnerRegistry } from './ai-runners/ai-runner-registry'

const MainLayer = Layer.mergeAll(
  // Existing services
  GitHubHttpService.Default,
  AiProviderService.Default,
  GitCommandService.Default,

  // New AI Runners
  TmuxSessionManagerService.Default,
  ProcessMonitorService.Default,
  AiRunnerRegistry.Default,
)
```

---

## Part 4: Error Handling

### 4.1 Error Mapping

**Update:** `src/main/ipc/error-mapper.ts`

```typescript
import {
  ProcessMonitorError,
  AiRunnerError,
  TmuxSessionError,
} from '../ai-runners/errors'

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

  if (error instanceof AiRunnerError) {
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
export const AiRunnerIpcContracts = {
  startRunner: {
    channel: 'ai-runner:start' as const,
    input: S.Struct({
      runnerId: S.String,
      provider: AiProviderType,
      operation: S.String,
      sessionName: S.String,
    }),
    output: S.Struct({
      runnerId: S.String,
      sessionName: S.String,
      attachCommand: S.String,
    }),
    errors: S.Union(
      AiRunnerError,
      ProcessMonitorError,
      TierLimitError,
      AuthenticationError
    ),
  },

  stopRunner: {
    channel: 'ai-runner:stop' as const,
    input: S.Struct({ runnerId: S.String }),
    output: S.Struct({ success: S.Boolean }),
    errors: S.Union(AiRunnerError, ProcessMonitorError),
  },

  listRunners: {
    channel: 'ai-runner:list' as const,
    input: S.Void,
    output: S.Array(S.Struct({
      runnerId: S.String,
      provider: AiProviderType,
      status: AiRunnerStatus,
    })),
    errors: S.Union(AiRunnerError),
  },
} as const
```

### 5.2 IPC Handlers

**File:** `src/main/ipc/ai-runner-handlers.ts`

```typescript
import { registerIpcHandler } from './ipc-handler-setup'
import { AiRunnerIpcContracts } from '../../shared/ipc-contracts'

export const setupAiRunnerIpcHandlers = Effect.gen(function* () {
  const runnerRegistry = yield* AiRunnerRegistry

  // Use the centralized registerIpcHandler utility
  registerIpcHandler(
    AiRunnerIpcContracts.startRunner,
    (input) => runnerRegistry.startRunner({
      runnerId: input.runnerId,
      provider: input.provider,
      operation: input.operation,
      sessionName: input.sessionName,
      accountId: /* from context */,
    })
  )

  registerIpcHandler(
    AiRunnerIpcContracts.stopRunner,
    (input) => runnerRegistry.getRunner(input.runnerId).pipe(
      Effect.flatMap(runner => runner.terminateRunner)
    )
  )

  registerIpcHandler(
    AiRunnerIpcContracts.listRunners,
    () => runnerRegistry.listRunners()
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
      yield* setupAiRunnerIpcHandlers  // NEW
    }).pipe(Effect.provide(MainLayer))
  )
  // ...
})
```

---

## Part 6: Renderer Integration

### 6.1 Atoms

**File:** `src/renderer/atoms/ai-runner-atoms.ts`

```typescript
export const aiRunnersAtom = Atom.make(
  Effect.gen(function* () {
    const client = yield* AiRunnerClient
    return yield* client.listRunners()
  }).pipe(
    Atom.withReactivityKeys(['ai-runner:list']),
    Atom.setIdleTTL(Duration.seconds(5))
  )
)

export const aiRunnerMetricsAtom = Atom.family((runnerId: string) =>
  Atom.make(
    Effect.gen(function* () {
      const client = yield* AiRunnerClient
      return yield* client.getRunnerMetrics(runnerId)
    })
  ).pipe(
    Atom.withReactivityKeys(['ai-runner:metrics', runnerId]),
    Atom.setIdleTTL(Duration.seconds(5))
  )
)
```

### 6.2 Components

**File:** `src/renderer/components/AiRunnerMonitor.tsx`

```typescript
export function AiRunnerMonitor({ runnerId }: { runnerId: string }) {
  const metricsResult = useAtomValue(aiRunnerMetricsAtom(runnerId))

  return Result.builder(metricsResult)
    .onInitial(() => <LoadingSpinner />)
    .onErrorTag('ProcessOperationError', (error) => (
      <ErrorAlert error={error} />
    ))
    .onErrorTag('AiProviderOperationError', (error) => (
      <ErrorAlert error={error} />
    ))
    .onDefect((defect) => {
      console.error('[AiRunnerMonitor]', defect)
      return <ErrorAlert message={String(defect)} />
    })
    .onSuccess((metrics) => (
      <div className="space-y-4">
        <RunnerStats metrics={metrics} />
        <TmuxSessionInfo runnerId={runnerId} />
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

- [ ] Create `src/main/ai-runners/` directory
- [ ] Define ports in `ports.ts`
- [ ] Define errors in `errors.ts`
- [ ] Create `TmuxSessionManagerService`
- [ ] Write unit tests

### Phase 2: Service Implementation (Week 2)

- [ ] Implement `ProcessMonitorService` (tmux-based adapter)
- [ ] Implement `AiRunnerService` (high-level orchestration)
- [ ] Implement `AiRunnerRegistry` (multi-runner management)
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
1. `src/main/ai-runners/ports.ts`
2. `src/main/ai-runners/errors.ts`
3. `src/main/ai-runners/tmux-session-manager.ts`
4. `src/main/ai-runners/process-monitor.ts`
5. `src/main/ai-runners/ai-runner-service.ts`
6. `src/main/ai-runners/ai-runner-registry.ts`
7. `src/main/ipc/ai-runner-handlers.ts`
8. `src/renderer/atoms/ai-runner-atoms.ts`
9. `src/renderer/components/AiRunnerMonitor.tsx`

### Updated Files
1. `src/main/ipc/error-mapper.ts` - Add AI runner error mappings
2. `src/shared/schemas/errors.ts` - Add shared error types
3. `src/shared/ipc-contracts.ts` - Add AI runner contracts
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

