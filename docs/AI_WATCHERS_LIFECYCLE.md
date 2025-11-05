# AI Runners Lifecycle & Hexagonal Architecture

**Date:** 2025-10-26
**Purpose:** Document the AI Runners hexagonal architecture and explain how it differs from AI/VCS providers

---

## Overview

AI Runners implements hexagonal (ports & adapters) architecture for process monitoring and AI agent lifecycle management. Unlike AI/VCS providers which have **multiple implementations per port**, AI Runners has **single implementations per port**, simplifying the architecture.

---

## Key Architectural Difference

### AI/VCS Providers Pattern (Multiple Implementations)

```
Port (Contract)              Adapters (Multiple Implementations)
───────────────             ────────────────────────────────────
AiProviderPort        ←──   OpenAiBrowserProviderAdapter
                      ←──   ClaudeBrowserProviderAdapter
                      ←──   CursorBrowserProviderAdapter

VcsProviderPort       ←──   GitHubBrowserProviderAdapter
                      ←──   GitLabBrowserProviderAdapter
                      ←──   BitbucketBrowserProviderAdapter
```

**Needs Registry:** Yes - to dynamically select which implementation to use at runtime.

### AI Runners Pattern (Single Implementation)

```
Port (Contract)              Adapter (Single Implementation)
───────────────             ────────────────────────────────
ProcessMonitorPort    ←──   NodeProcessMonitorAdapter
SessionManagerPort    ←──   TmuxSessionManagerAdapter
AiRunnerPort         ←──   AiRunnerService
```

**Needs Registry:** No - only one implementation exists, injected directly via dependencies.

---

## Step-by-Step Architecture

### Step 1: Port Definitions - The Contracts

**File:** `src/main/ai-runners/ports.ts`

```typescript
/**
 * Process monitoring port - abstracts process interaction
 * Enables swapping: Node.js → Docker → SSH remote processes
 */
export interface ProcessMonitorPort {
  spawn(config: ProcessConfig): Effect.Effect<ProcessHandle, ProcessSpawnError>
  attach(pid: number): Effect.Effect<ProcessHandle, ProcessAttachError>
  monitor(handle: ProcessHandle): Stream.Stream<ProcessEvent, ProcessMonitorError>
  kill(handle: ProcessHandle): Effect.Effect<void, ProcessKillError>
  pipeTmuxSession(handle: ProcessHandle, targetPane: string): Effect.Effect<void, ProcessMonitorError>
}

/**
 * Session manager port - abstracts terminal multiplexer operations
 * Enables swapping: Tmux → Screen → Docker → Kubernetes
 */
export interface SessionManagerPort {
  createSession(name: string, command: string, args?: string[], cwd?: string): Effect.Effect<ProcessHandle, TmuxSessionNotFoundError>
  attachToSession(sessionName: string): Effect.Effect<ProcessHandle, TmuxSessionNotFoundError>
  listSessions(): Effect.Effect<TmuxSession[], never>
  killSession(sessionName: string): Effect.Effect<void, TmuxCommandError>
  sessionExists(sessionName: string): Effect.Effect<boolean, never>
}

/**
 * AI runner port - orchestrates AI agent lifecycle
 */
export interface AiRunnerPort {
  create(config: AiRunnerConfig): Effect.Effect<AiRunner, AiRunnerCreateError>
  start(runner: AiRunner): Effect.Effect<void, AiRunnerStartError>
  stop(runner: AiRunner): Effect.Effect<void, AiRunnerStopError>
  getStatus(runner: AiRunner): Effect.Effect<AiRunnerStatus, never>
  get(runnerId: string): Effect.Effect<AiRunner, RunnerNotFoundError>
  listAll(): Effect.Effect<AiRunner[], never>
  getLogs(runnerId: string, limit?: number): Effect.Effect<LogEntry[], RunnerNotFoundError>
  streamLogs(runner: AiRunner): Stream.Stream<LogEntry, never>
}
```

**What happens:**
1. Define port interfaces - the contracts
2. **No tag registry** needed (unlike AI/VCS providers)
3. Adapters will be directly referenced in dependencies

---

### Step 2: Adapter Implementations

**File:** `src/main/ai-runners/adapters/node-process-monitor-adapter.ts`

```typescript
/**
 * NodeProcessMonitorAdapter - Node.js implementation of ProcessMonitorPort
 *
 * HEXAGONAL ARCHITECTURE: This is an ADAPTER implementing ProcessMonitorPort.
 * It can be replaced with other implementations:
 * - DockerProcessMonitorAdapter (monitor Docker containers)
 * - SshProcessMonitorAdapter (monitor remote SSH processes)
 * - MockProcessMonitorAdapter (for testing)
 */
export class NodeProcessMonitorAdapter extends Effect.Service<NodeProcessMonitorAdapter>()(
  'NodeProcessMonitorAdapter',
  {
    effect: Effect.gen(function* () {
      // Implementation using Node.js child_process
      const processes = new Map<string, ProcessInfo>()

      const implementation: ProcessMonitorPort = {
        spawn: (config) => { /* Node.js child_process.spawn */ },
        attach: (pid) => { /* Track existing process */ },
        monitor: (handle) => { /* Stream stdout/stderr events */ },
        kill: (handle) => { /* Terminate process */ },
        pipeTmuxSession: (handle, pane) => { /* Pipe tmux output */ },
      }

      return implementation
    })
  }
) {}
```

**File:** `src/main/ai-runners/adapters/tmux-session-manager-adapter.ts`

```typescript
/**
 * TmuxSessionManagerAdapter - Tmux implementation of SessionManagerPort
 *
 * HEXAGONAL ARCHITECTURE: This is an ADAPTER implementing SessionManagerPort.
 * It can be replaced with other implementations:
 * - ScreenSessionManagerAdapter (use GNU Screen instead)
 * - DockerSessionManagerAdapter (sessions as Docker containers)
 * - KubernetesSessionManagerAdapter (sessions as pods)
 * - MockSessionManagerAdapter (for testing)
 */
export class TmuxSessionManagerAdapter extends Effect.Service<TmuxSessionManagerAdapter>()(
  'TmuxSessionManagerAdapter',
  {
    dependencies: [NodeProcessMonitorAdapter.Default],
    effect: Effect.gen(function* () {
      const processMonitor = yield* NodeProcessMonitorAdapter

      const implementation: SessionManagerPort = {
        createSession: (name, command, args, cwd) => { /* tmux new-session */ },
        attachToSession: (sessionName) => { /* tmux attach */ },
        listSessions: () => { /* tmux list-sessions */ },
        killSession: (sessionName) => { /* tmux kill-session */ },
        sessionExists: (sessionName) => { /* tmux has-session */ },
      }

      return implementation
    })
  }
) {}
```

**What happens:**
1. Adapters implement port contracts
2. Use `Effect.Service` pattern (same as AI/VCS)
3. **Direct service dependencies** (no tag-based lookup needed)
4. Each adapter can be swapped independently

---

### Step 3: Adapters Layer Composition

**File:** `src/main/ai-runners/adapters-layer.ts`

```typescript
import { Layer } from 'effect'
import { NodeProcessMonitorAdapter } from './adapters/node-process-monitor-adapter'
import { TmuxSessionManagerAdapter } from './adapters/tmux-session-manager-adapter'

/**
 * AI Runners Adapters Layer
 *
 * Unlike AI/VCS providers, we don't need a registry because there's only
 * ONE implementation per port. Adapters are directly injected via dependencies.
 *
 * Benefits:
 * - Hot-swappable for testing (replace with mocks)
 * - Platform-agnostic (swap Node.js with Docker/SSH)
 * - Multiplexer-agnostic (swap Tmux with Screen/K8s)
 */
export const RunnerAdaptersLayer = Layer.mergeAll(
  NodeProcessMonitorAdapter.Default,
  TmuxSessionManagerAdapter.Default
)
```

**What happens:**
1. Merge all adapters into single layer
2. **No registry service** (key difference from AI/VCS)
3. Adapters are module-level constants for memoization

---

### Step 4: Application Service

**File:** `src/main/ai-runners/ai-runner-service.ts`

```typescript
/**
 * AiRunnerService - Application service orchestrating adapters
 *
 * This service consumes the adapters via the dependencies array,
 * no registry needed.
 */
export class AiRunnerService extends Effect.Service<AiRunnerService>()(
  'AiRunnerService',
  {
    dependencies: [
      TmuxSessionManagerAdapter.Default,    // Direct dependency
      NodeProcessMonitorAdapter.Default,    // Direct dependency
    ],
    effect: Effect.gen(function* () {
      const tmuxManager = yield* TmuxSessionManagerAdapter
      const processMonitor = yield* NodeProcessMonitorAdapter

      const runners = new Map<string, RunnerState>()

      return {
        create: (config) => { /* Create runner */ },
        start: (runner) => { /* Start monitoring */ },
        stop: (runner) => { /* Stop and cleanup */ },
        getStatus: (runner) => { /* Get current status */ },
        get: (runnerId) => { /* Retrieve by ID */ },
        listAll: () => { /* List all runners */ },
        getLogs: (runnerId, limit) => { /* Get logs */ },
        streamLogs: (runner) => { /* Stream live logs */ },
      }
    })
  }
) {}
```

**What happens:**
1. Service declares adapter dependencies in array
2. Accesses adapters via `yield*` (not via registry)
3. Orchestrates adapter operations for runner lifecycle

---

### Step 5: MainLayer Composition

**File:** `src/main/ai-runners/index.ts`

```typescript
import { Layer } from 'effect'
import { RunnerAdaptersLayer } from './adapters-layer'
import { AiRunnerService } from './ai-runner-service'

/**
 * Complete AI Runners layer
 *
 * LAYER COMPOSITION: Merges adapters and service at top level.
 * This makes adapters available to:
 * 1. AiRunnerService (via dependencies array)
 * 2. IPC handlers (for adapter-specific operations)
 */
export const AiRunnersLayer = Layer.mergeAll(
  RunnerAdaptersLayer,
  AiRunnerService.Default
)
```

**File:** `src/main/index.ts`

```typescript
const MainLayer = Layer.mergeAll(
  // ... other services

  // AI Runners domain - merged at top level, no Layer.provide needed
  AiRunnersLayer,  // Expands to: RunnerAdaptersLayer + AiRunnerService

  // ... more services
)
```

**What happens:**
1. `AiRunnersLayer` expands to adapters + service
2. **No `Layer.provide` needed** (adapters auto-injected via dependencies)
3. All services memoized by reference

---

## Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Port Definition (ports.ts)                               │
├─────────────────────────────────────────────────────────────┤
│ • ProcessMonitorPort interface                               │
│ • SessionManagerPort interface                               │
│ • AiRunnerPort interface                                    │
│ • NO tag registry (unlike AI/VCS providers)                  │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Adapter Implementation (adapters/)                        │
├─────────────────────────────────────────────────────────────┤
│ • NodeProcessMonitorAdapter (Node.js child_process)          │
│ • TmuxSessionManagerAdapter (tmux commands)                  │
│ • Each adapter is an Effect.Service                          │
│ • Stored as module-level constants                           │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Adapters Layer (adapters-layer.ts)                       │
├─────────────────────────────────────────────────────────────┤
│ RunnerAdaptersLayer = Layer.mergeAll(                       │
│   NodeProcessMonitorAdapter.Default,                         │
│   TmuxSessionManagerAdapter.Default                          │
│ )                                                            │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Application Service (ai-runner-service.ts)              │
├─────────────────────────────────────────────────────────────┤
│ AiRunnerService:                                            │
│   dependencies: [                                            │
│     TmuxSessionManagerAdapter.Default,                       │
│     NodeProcessMonitorAdapter.Default                        │
│   ]                                                          │
│   effect: Effect.gen(function* () {                          │
│     const tmux = yield* TmuxSessionManagerAdapter            │
│     const proc = yield* NodeProcessMonitorAdapter            │
│     // Orchestrate adapters                                  │
│   })                                                         │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. MainLayer (index.ts, ai-runners/index.ts)               │
├─────────────────────────────────────────────────────────────┤
│ AiRunnersLayer = Layer.mergeAll(                            │
│   RunnerAdaptersLayer,    // Adapters at top level          │
│   AiRunnerService.Default // Service uses via dependencies  │
│ )                                                            │
│                                                              │
│ MainLayer = Layer.mergeAll(                                  │
│   ...,                                                       │
│   AiRunnersLayer,  // NO Layer.provide needed               │
│   ...                                                        │
│ )                                                            │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. Runtime Usage                                             │
├─────────────────────────────────────────────────────────────┤
│ IPC Call: ai-runner:create                                  │
│   ↓                                                          │
│ AiRunnerService.create(config)                              │
│   ↓                                                          │
│ Uses TmuxSessionManagerAdapter.createSession()               │
│   ↓                                                          │
│ Uses NodeProcessMonitorAdapter.monitor()                     │
│   ↓                                                          │
│ Returns AiRunner instance                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Comparison: AI Runners vs AI/VCS Providers

| Aspect | AI/VCS Providers | AI Runners |
|--------|------------------|-------------|
| **Port Implementations** | Multiple (OpenAI, Claude, Cursor) | Single (NodeProcessMonitor, TmuxSessionManager) |
| **Tag Registry** | ✅ `AiProviderTags`, `VcsProviderTags` | ❌ No registry needed |
| **Registry Service** | ✅ Construction-time capture | ❌ No registry service |
| **Layer Composition** | `Layer.provide(services, adapters)` | `Layer.mergeAll(adapters, service)` |
| **Adapter Lookup** | Dynamic via registry | Static via dependencies |
| **File Organization** | `ai/{provider}/adapter.ts` | `ai-runners/adapters/{type}-adapter.ts` |
| **Adapters Layer File** | ✅ `adapters-layer.ts` | ✅ `adapters-layer.ts` |
| **Hexagonal Architecture** | ✅ Full hexagonal | ✅ Full hexagonal |
| **Hot-Swappable** | ✅ Yes (for testing/mocking) | ✅ Yes (for testing/mocking) |

**Key Similarity:** Both follow hexagonal architecture - ports define contracts, adapters implement them.

**Key Difference:** Multiple implementations require registry; single implementations use direct dependencies.

---

## File Structure

```
src/main/ai-runners/
├── adapters/                          # Adapter implementations
│   ├── node-process-monitor-adapter.ts # Node.js process adapter
│   └── tmux-session-manager-adapter.ts # Tmux session adapter
├── adapters-layer.ts                  # Adapters composition
├── ai-runner-service.ts              # Application service
├── ports.ts                           # Port definitions (contracts)
├── schemas.ts                         # Domain schemas
├── errors.ts                          # Domain errors
└── index.ts                           # Layer exports
```

---

## Hot-Swapping for Testing

Even without a registry, adapters can be swapped for testing:

```typescript
// Mock process monitor for tests
const MockProcessMonitor = Layer.succeed(
  NodeProcessMonitorAdapter,
  {
    spawn: () => Effect.succeed(mockHandle),
    attach: () => Effect.succeed(mockHandle),
    monitor: () => Stream.empty,
    kill: () => Effect.void,
    pipeTmuxSession: () => Effect.void,
  }
)

// Mock tmux manager for tests
const MockTmuxManager = Layer.succeed(
  TmuxSessionManagerAdapter,
  {
    createSession: () => Effect.succeed(mockHandle),
    attachToSession: () => Effect.succeed(mockHandle),
    listSessions: () => Effect.succeed([]),
    killSession: () => Effect.void,
    sessionExists: () => Effect.succeed(false),
  }
)

// Test layer with mocked adapters
const TestRunnersLayer = Layer.mergeAll(
  MockProcessMonitor,
  MockTmuxManager,
  AiRunnerService.Default
)

// Run tests with mocked layer
Effect.runPromise(
  Effect.gen(function* () {
    const service = yield* AiRunnerService
    const runner = yield* service.create(testConfig)
    // ... test with mocked adapters
  }).pipe(Effect.provide(TestRunnersLayer))
)
```

---

## Benefits of This Architecture

1. **Hexagonal Compliance**: Clear port/adapter boundaries
2. **Simpler than AI/VCS**: No registry overhead for single implementations
3. **Still Hot-Swappable**: Can replace adapters for testing
4. **Type-Safe**: All contracts enforced by port interfaces
5. **Isolated Testing**: Each adapter can be tested independently
6. **Platform Agnostic**: Swap Node.js → Docker → SSH → Kubernetes
7. **Multiplexer Agnostic**: Swap Tmux → Screen → Docker → K8s
8. **Memoized**: Adapters constructed once and shared

---

**Author:** AI Assistant
**Date:** 2025-10-26
**Purpose:** Developer reference for understanding AI Runners hexagonal architecture
