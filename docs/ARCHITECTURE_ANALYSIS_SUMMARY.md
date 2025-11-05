# Geppetto Architecture Analysis: Tmux AI Watchers & Process Monitoring

## Overview

This analysis synthesizes three critical documents to provide a complete architectural blueprint for integrating tmux-based session management with AI agent watchers, process monitoring, and multi-provider support into Geppetto:

1. **TmuxPrompts Design** (docs/TmuxPrompts/*)
2. **Error-Refactor-Plan** (docs/error-refactor-plan.md)
3. **Geppetto's Current Architecture** (CLAUDE.md)

**Result:** A comprehensive, type-safe, hexagonal architecture for long-running AI operations with graceful error handling.

---

## 1. Architectural Foundation

### Current State: Three-Layer Hexagonal Model

Geppetto already implements hexagonal architecture:

```
Port Layer        ProviderPort, AiProviderPort, GitCommandRunnerPort
      ↓
Service Layer     VcsProviderService, AiProviderService, GitCommandService
      ↓
Adapter Layer     GitHubProviderAdapter, OpenAiBrowserAdapter, NodeGitCommandRunner
```

**Key insight:** We can follow this proven pattern for AI Watchers.

### New Ports for AI Watchers

```
ProcessMonitorPort      ← Manage tmux sessions and process I/O
AiWatcherPort          ← Orchestrate multi-provider watchers
```

---

## 2. TmuxPrompts Integration

### Core Patterns to Adopt

From TmuxPrompts (docs/TmuxPrompts/ULTIMATE_GUIDE.md):

1. **Structured Concurrency**
   - Use `Effect.scoped` for lifetime management
   - Use `Effect.forkScoped` for background fibers (NOT `forkDaemon`)
   - Automatic cleanup when scope closes
   - **Key benefit:** No resource leaks, predictable lifetime

2. **Streaming I/O with Backpressure**
   - `Stream.fromQueue` for producer-consumer pattern
   - Handles output overflow gracefully
   - **Key benefit:** Won't crash with large output volumes

3. **Activity Tracking**
   - `Ref` for thread-safe state
   - Detect idle vs active based on output
   - **Key benefit:** Know when tasks are stuck

4. **Rolling Logs**
   - Auto-rotate at 100MB (configurable)
   - Preserve history without disk explosion
   - **Key benefit:** Complete audit trail

### Why Tmux Specifically?

Compared to alternatives:
- **PTY**: Needs node-pty (complex native binding)
- **Stdio**: Can't detach/reattach
- **Tmux**: Simple shell commands, full control, industry standard

---

## 3. Error Handling Strategy

From error-refactor-plan.md (docs/error-refactor-plan.md):

### Error Classification Decision Tree

```
Is error from external system/provider?
  YES → TYPED ERROR (NetworkError, ProcessOperationError)
Is error from tier/feature limit?
  YES → TYPED ERROR (TierLimitError, AiFeatureUnavailableError)
Is error from schema validation?
  YES → TYPED ERROR (ValidationError)
Is error a programming bug?
  YES → DEFECT (ConsoleErrorBoundary catches, logs, auto-recovers)
```

**Goal:** <5% defect rate. Everything else is typed.

### New Error Types for AI Watchers

Domain errors (main process):
```typescript
ProcessMonitorError     // Tmux/shell execution failed
AiWatcherError         // Watcher orchestration failed
TmuxSessionError       // Tmux session management failed
```

IPC errors (cross-process):
```typescript
ProcessOperationError      // For renderer
AiProviderOperationError   // For renderer
```

### Error Mapping Flow

```
Domain Error (ProcessMonitorError)
    ↓
mapDomainErrorToIpcError()
    ↓
IPC Error (ProcessOperationError)
    ↓
Renderer Component (Result<T, IpcError>)
    ↓
Result.builder() with exhaustive .onErrorTag()
    ↓
UI: Toast/Inline/Silent
```

---

## 4. Multi-Provider Architecture

### Provider Hierarchy

```
ProviderAdapter (VCS: GitHub, GitLab, Bitbucket)
AiProviderAdapter (AI: OpenAI, Claude, Cursor)
        ↓
ProcessMonitorPort (Tmux session management)
        ↓
AiWatcherPort (Multi-watcher coordination)
```

### Provider-Specific Adapters

Each provider can customize watcher behavior:

```
OpenAiBrowserProviderAdapter
    → OpenAiWatcherAdapter (custom metrics)
    → TokenTracker, CostCalculator, etc.

ClaudeBrowserProviderAdapter
    → ClaudeWatcherAdapter (custom metrics)
    → MessageCounter, etc.
```

**Key benefit:** Extensible to new providers without core changes.

---

## 5. Service Composition Pattern

### Existing Layer Composition (src/main/index.ts)

```typescript
const MainLayer = Layer.mergeAll(
  GitHubHttpService.Default,
  GitHubAuthService.Default,
  AiProviderService.Default,
  GitCommandService.Default,
  // ... 10+ more services
)
```

### New Services to Add

```typescript
// Infrastructure (low-level)
TmuxSessionManagerService
ProcessMonitorService

// Domain services (high-level)
AiWatcherService
AiWatcherRegistry
```

### IPC Handler Setup

Parallel to existing handlers:
- `setupAccountIpcHandlers`
- `setupProviderIpcHandlers`
- `setupAiProviderIpcHandlers`
- `setupWorkspaceIpcHandlers`
- **NEW:** `setupAiWatcherIpcHandlers`

---

## 6. Type-Safe IPC Contracts

### IPC Contract Pattern

From CLAUDE.md (Critical Type Safety Section):

```typescript
const AiWatcherIpcContracts = {
  startWatcher: {
    channel: 'ai-watcher:start' as const,
    input: StartWatcherSchema,
    output: WatcherSessionSchema,
    errors: S.Union(AiWatcherError, ProcessMonitorError, TierLimitError),
  },
  // ... more contracts
} as const

// Handler setup (MUST preserve types!)
type InputSchema = S.Schema<
  ContractInput<K>,
  S.Schema.Encoded<typeof AiWatcherIpcContracts[K]['input']>
>
const validatedInput = yield* S.decodeUnknown(
  contract.input as unknown as InputSchema
)(input)
```

**Why this pattern?** Prevents type erasure across IPC boundary.

---

## 7. Renderer Integration

### Atom Pattern (Using @effect-atom/atom-react)

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
```

### Component Pattern (Using Result.builder)

```typescript
Result.builder(metricsResult)
  .onInitial(() => <LoadingSpinner />)
  .onErrorTag('ProcessOperationError', (error) => (
    <ErrorAlert error={error} action={<Button onClick={retry}>Retry</Button>} />
  ))
  .onErrorTag('AiProviderOperationError', (error) => (
    <ErrorAlert error={error} />
  ))
  .onErrorTag('TierLimitError', (error) => (
    <TierLimitAlert requiredTier={error.requiredTier} />
  ))
  .onDefect((defect) => {
    console.error('[Component]', defect)
    return <ErrorAlert message={String(defect)} />
  })
  .onSuccess((data) => <DataView data={data} />)
  .render()
```

---

## 8. Domain-Driven Organization

### File Structure

```
src/main/ai-watchers/
├── ports.ts                      # ProcessMonitorPort, AiWatcherPort
├── errors.ts                     # ProcessMonitorError, AiWatcherError
├── tmux-session-manager.ts       # Tmux lifecycle management
├── process-monitor.ts            # ProcessMonitorPort implementation
├── ai-watcher-service.ts         # High-level watcher service
└── ai-watcher-registry.ts        # Multi-watcher coordination

src/main/ipc/
└── ai-watcher-handlers.ts        # IPC handler setup

src/shared/
├── ipc-contracts.ts              # AiWatcherIpcContracts
└── schemas/errors.ts             # ProcessOperationError, etc.

src/renderer/
├── atoms/ai-watcher-atoms.ts     # Atom definitions
└── components/
    └── AiWatcherMonitor.tsx      # React components
```

This mirrors existing domain structure (github/, gitlab/, ai/, etc.)

---

## 9. Key Technical Decisions

### 1. Why ProcessMonitorPort is Separate from AiWatcherPort

- ProcessMonitor: Low-level abstraction (tmux session, I/O)
- AiWatcher: High-level orchestration (metrics, tier checking, events)

**Benefit:** Can reuse ProcessMonitor for other long-running tasks (builds, tests)

### 2. Why Effect.forkScoped, Not forkDaemon

From STRUCTURED_CONCURRENCY.md:

```
forkDaemon    → Global, detached, resource leaks ❌
forkScoped    → Tied to scope, auto-cleanup ✅
```

Example:
```typescript
Effect.gen(function* () {
  const activityChecker = pipe(
    checkActivity(),
    Effect.repeat(Schedule.spaced("1 second")),
    Effect.forkScoped  // ← Tied to this scope
  )
  yield* activityChecker
  yield* mainWork()
}).pipe(Effect.scoped)
// When scope closes, activityChecker is interrupted
```

### 3. Why Schema-First IPC

- Runtime validation at process boundary
- Type inference from schemas (no manual types)
- "Parse, don't validate" approach
- Errors caught early, not silent

### 4. Why Result.builder in Components

From RESULT_API_AND_ERROR_HANDLING.md:

```
Result.builder() exhaustively handles all states:
  .onInitial()        → Loading
  .onErrorTag()       → Specific errors (with full type info)
  .onDefect()         → Programming bugs
  .onSuccess()        → Happy path
```

**Prevents:** Silent failures, lockups, unhandled errors

---

## 10. Error Scenarios & Handling

### Scenario 1: User Tries to Start Watcher, Tier Limit

```
User clicks "Start Watcher"
        ↓
Renderer: ipcRenderer.invoke('ai-watcher:start', {...})
        ↓
Main: tierService.checkFeatureAvailable('ai-watchers')
        ↓
Throws: FeatureNotAvailableError
        ↓
Mapper: → TierLimitError
        ↓
Renderer: Result.builder().onErrorTag('TierLimitError', ...)
        ↓
UI: "Upgrade to Pro" button
```

### Scenario 2: Tmux Session Creation Fails

```
Main: tmux new-session -d -s ...
        ↓
Fails: TmuxSessionError (tmux not installed)
        ↓
Mapper: → ProcessOperationError
        ↓
Renderer: Result.builder().onErrorTag('ProcessOperationError', ...)
        ↓
UI: "Monitoring unavailable, install tmux" alert
```

### Scenario 3: Network Error During Metrics Fetch

```
Renderer: fetch AI provider metrics
        ↓
Fails: Network timeout
        ↓
Mapper: → NetworkError
        ↓
Component: Result.builder().onErrorTag('NetworkError', ...)
        ↓
UI: "Connection lost. Retrying..." with retry button
```

---

## 11. Implementation Checklist

### Phase 1: Foundation (1 week)

- [ ] Read: TmuxPrompts guides + error-refactor-plan.md + CLAUDE.md
- [ ] Create `src/main/ai-watchers/` directory structure
- [ ] Define `ProcessMonitorPort` and `AiWatcherPort` in ports.ts
- [ ] Define domain errors in errors.ts
- [ ] Create TmuxSessionManagerService (copy patterns from tmux-logger.ts)
- [ ] Write unit tests for session manager

### Phase 2: Services (1 week)

- [ ] Implement ProcessMonitorService adapter
- [ ] Implement AiWatcherService
- [ ] Implement AiWatcherRegistry
- [ ] Integrate with tier-service for feature gating
- [ ] Update error-mapper.ts with new domain errors
- [ ] Update MainLayer in src/main/index.ts

### Phase 3: IPC & Frontend (1 week)

- [ ] Create AiWatcherIpcContracts in src/shared/ipc-contracts.ts
- [ ] Implement ai-watcher-handlers.ts with proper type safety
- [ ] Add ProcessOperationError + AiProviderOperationError to shared errors
- [ ] Create ai-watcher-atoms.ts with atom families
- [ ] Build AiWatcherMonitor.tsx component

### Phase 4: Error Handling & Polish (1 week)

- [ ] Implement error presenters (toast, inline, silent)
- [ ] Add ConsoleErrorBoundary integration
- [ ] Write end-to-end error tests
- [ ] Document error handling patterns
- [ ] Performance optimization

---

## 12. Success Criteria

### Technical

- ✅ All errors are typed (no `any` or overly broad `unknown`)
- ✅ Error handling exhaustive in components (Result.builder)
- ✅ Defect rate <5% (most errors are caught and handled)
- ✅ No resource leaks (Effect.scoped cleanup)
- ✅ IPC contracts type-safe (Schema.decodeUnknown validates)

### User Experience

- ✅ Can attach to tmux: `tmux attach -t <session>`
- ✅ Can detach and leave running: Ctrl+B, D
- ✅ All I/O logged to files with rotation
- ✅ Errors show actionable UI (retry, upgrade, etc.)
- ✅ No full-screen lockups (auto-recovery)

### Architecture

- ✅ Follows hexagonal pattern (ports → adapters → services)
- ✅ Extensible to new AI providers
- ✅ Extensible to other long-running processes
- ✅ Compatible with existing Geppetto structure
- ✅ Clear separation of concerns

---

## 13. Key Files Reference

### Must Read

1. **docs/TmuxPrompts/ULTIMATE_GUIDE.md** - Overview of all loggers
2. **docs/TmuxPrompts/TMUX_LOGGER_GUIDE.md** - Detailed tmux integration
3. **docs/TmuxPrompts/STRUCTURED_CONCURRENCY.md** - Why forkScoped
4. **docs/error-refactor-plan.md** - Error handling architecture
5. **CLAUDE.md** - Geppetto's design philosophy

### Reference Code

1. **src/main/providers/ports.ts** - Adapter port pattern
2. **src/main/ai-provider-usage-webscraper/ports.ts** - AiProviderAdapter pattern
3. **src/main/source-control/ports.ts** - Secondary port pattern
4. **src/main/ipc/error-mapper.ts** - Error mapping pattern
5. **docs/TmuxPrompts/tmux-logger.ts** - Tmux implementation

---

## 14. Next Steps

1. **Review Phase**: Team reviews architecture and provides feedback
2. **Design Review**: Validate type signatures and error flows
3. **Prototype Phase**: Implement Phase 1 foundation
4. **Iterate**: Gather feedback, adjust patterns as needed
5. **Scale**: Extend to multi-provider, additional use cases

---

## Conclusion

By combining:
- **TmuxPrompts** structured concurrency patterns
- **Error-Refactor** hexagonal error handling
- **Geppetto's** domain-driven architecture

We create a **type-safe, composable, maintainable system** for monitoring long-running AI operations with:
- Interactive user control (attach/detach tmux)
- Comprehensive logging (rolling files, activity tracking)
- Graceful error handling (no lockups, typed errors)
- Multi-provider extensibility (OpenAI, Claude, Cursor, etc.)

---

## Questions & Decisions

### Decision: Should AiWatcher be monolithic or modular?

**Proposed:** Modular
- ProcessMonitorPort (reusable for other tasks)
- AiWatcherService (AI-specific orchestration)
- Provider-specific adapters (OpenAi, Claude, etc.)

### Decision: Where to check tier limits?

**Proposed:** In AiWatcherRegistry.startWatcher()
- Prevents starting watcher that will fail
- Ties tier check to account context
- Follows existing pattern (TierService)

### Decision: How to handle long-running metrics?

**Proposed:** Via event stream + Ref
- ProcessMonitor emits activity events
- AiWatcher tracks metrics in Ref
- Renderer polls via atom
- Can swap polling for websocket later

