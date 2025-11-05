# AI Runner Tmux Integration Plan

## Executive Summary

This plan outlines the integration of AI agent runners with tmux sessions in Geppetto, enabling process monitoring, logging, and interactive control of Claude Code, Codex, and other AI agents. The implementation follows hexagonal architecture principles with Effect-TS best practices.

## Phase 1: Foundation Architecture (Days 1-2)

### 1.1 Create Core Ports and Domain Types

**Files to create:**
```
src/main/ai-runners/
├── ports.ts              # Port interfaces
├── errors.ts             # Domain errors
└── schemas.ts            # Domain schemas
```

**Port definitions (ports.ts):**
```typescript
// Process monitoring port - abstracts process interaction
export interface ProcessMonitorPort {
  spawn(config: ProcessConfig): Effect.Effect<ProcessHandle, ProcessSpawnError>
  attach(pid: number): Effect.Effect<ProcessHandle, ProcessAttachError>
  monitor(handle: ProcessHandle): Stream.Stream<ProcessEvent, ProcessMonitorError>
  kill(handle: ProcessHandle): Effect.Effect<void, ProcessKillError>
}

// AI runner port - orchestrates AI agent lifecycle
export interface AiRunnerPort {
  create(config: AiRunnerConfig): Effect.Effect<AiRunner, AiRunnerCreateError>
  start(runner: AiRunner): Effect.Effect<void, AiRunnerStartError>
  stop(runner: AiRunner): Effect.Effect<void, AiRunnerStopError>
  getStatus(runner: AiRunner): Effect.Effect<AiRunnerStatus, never>
  streamLogs(runner: AiRunner): Stream.Stream<LogEntry, never>
}
```

**Domain schemas (schemas.ts):**
```typescript
import * as S from '@effect/schema/Schema'

export class ProcessHandle extends S.Class<ProcessHandle>('ProcessHandle')({
  id: S.String,
  pid: S.Number,
  type: S.Literal('spawned', 'attached'),
  startedAt: S.Date,
}) {}

export class AiRunner extends S.Class<AiRunner>('AiRunner')({
  id: S.String,
  name: S.String,
  type: S.Literal('claude-code', 'codex', 'cursor', 'custom'),
  processHandle: ProcessHandle,
  status: S.Literal('starting', 'running', 'idle', 'stopped', 'errored'),
  config: AiRunnerConfig,
  createdAt: S.Date,
  lastActivityAt: S.Date,
}) {}

export class ProcessEvent extends S.Class<ProcessEvent>('ProcessEvent')({
  type: S.Literal('stdout', 'stderr', 'exit', 'error', 'silence'),
  data: S.optional(S.String),
  timestamp: S.Date,
}) {}
```

### 1.2 Implement Tmux Session Manager

**File: src/main/ai-runners/tmux-session-manager.ts**

```typescript
export class TmuxSessionManager extends Effect.Service<TmuxSessionManager>()('TmuxSessionManager', {
  effect: Effect.gen(function* () {
    const processMonitor = yield* ProcessMonitorPort

    return {
      createSession: (name: string, command: string) =>
        Effect.gen(function* () {
          const config: ProcessConfig = {
            command: 'tmux',
            args: ['new-session', '-d', '-s', name, command],
            env: process.env,
          }
          return yield* processMonitor.spawn(config)
        }),

      attachToSession: (sessionName: string) =>
        Effect.gen(function* () {
          // Get tmux session info
          const info = yield* Bash.execute(`tmux list-sessions -F "#{session_name}:#{session_id}" | grep "^${sessionName}:"`)
          const [, sessionId] = info.split(':')

          // Get PID of the main pane
          const pid = yield* Bash.execute(`tmux list-panes -t ${sessionId} -F "#{pane_pid}"`)

          return yield* processMonitor.attach(Number(pid))
        }),

      listSessions: () =>
        Effect.gen(function* () {
          const output = yield* Bash.execute('tmux list-sessions -F "#{session_name}:#{session_attached}:#{session_created}"')
          return output.split('\n').filter(Boolean).map(line => {
            const [name, attached, created] = line.split(':')
            return { name, attached: attached === '1', created: new Date(Number(created) * 1000) }
          })
        }),
    }
  }),
  dependencies: [ProcessMonitorPort],
}) {}
```

## Phase 2: Service Implementation (Days 3-4)

### 2.1 Process Monitor Service

**File: src/main/ai-runners/process-monitor-service.ts**

```typescript
export class ProcessMonitorService extends Effect.Service<ProcessMonitorService>()('ProcessMonitorService', {
  effect: Effect.gen(function* () {
    const processes = new Map<string, ProcessInfo>()

    const implementation: ProcessMonitorPort = {
      spawn: (config) =>
        Effect.gen(function* () {
          const child = spawn(config.command, config.args, {
            env: config.env,
            detached: true,
          })

          const handle = new ProcessHandle({
            id: ulid(),
            pid: child.pid!,
            type: 'spawned',
            startedAt: new Date(),
          })

          processes.set(handle.id, { child, handle, buffer: [] })
          return handle
        }),

      monitor: (handle) =>
        Stream.async<ProcessEvent>((emit) => {
          const info = processes.get(handle.id)
          if (!info) {
            emit.fail(new ProcessNotFoundError({ handle }))
            return
          }

          // Set up activity detection with 30-second timeout
          const activityRef = Ref.unsafeMake({ lastActivity: Date.now(), isIdle: false })

          const checkActivity = Effect.repeat(
            Effect.gen(function* () {
              const state = yield* Ref.get(activityRef)
              const now = Date.now()
              const timeSinceActivity = now - state.lastActivity

              if (timeSinceActivity > 30000 && !state.isIdle) {
                yield* Ref.update(activityRef, s => ({ ...s, isIdle: true }))
                emit.single(new ProcessEvent({
                  type: 'silence',
                  timestamp: new Date(),
                }))
              }
            }),
            Schedule.fixed(Duration.seconds(5))
          )

          info.child.stdout?.on('data', (data) => {
            Ref.unsafeUpdate(activityRef, s => ({ lastActivity: Date.now(), isIdle: false }))
            emit.single(new ProcessEvent({ type: 'stdout', data: data.toString(), timestamp: new Date() }))
          })

          info.child.stderr?.on('data', (data) => {
            Ref.unsafeUpdate(activityRef, s => ({ lastActivity: Date.now(), isIdle: false }))
            emit.single(new ProcessEvent({ type: 'stderr', data: data.toString(), timestamp: new Date() }))
          })

          info.child.on('exit', (code) => {
            emit.single(new ProcessEvent({ type: 'exit', data: String(code), timestamp: new Date() }))
            emit.end()
          })

          // Run activity checker
          Effect.runFork(checkActivity)
        }),
    }

    return implementation
  }),
}) {}
```

### 2.2 AI Runner Service

**File: src/main/ai-runners/ai-runner-service.ts**

```typescript
export class AiRunnerService extends Effect.Service<AiRunnerService>()('AiRunnerService', {
  effect: Effect.gen(function* () {
    const tmuxManager = yield* TmuxSessionManager
    const processMonitor = yield* ProcessMonitorPort
    const runners = new Map<string, RunnerState>()

    const implementation: AiRunnerPort = {
      create: (config) =>
        Effect.gen(function* () {
          // Create tmux session with AI agent
          const sessionName = `ai-${config.type}-${ulid()}`
          const command = getAiAgentCommand(config)

          const handle = yield* tmuxManager.createSession(sessionName, command)

          const runner = new AiRunner({
            id: ulid(),
            name: config.name || sessionName,
            type: config.type,
            processHandle: handle,
            status: 'starting',
            config,
            createdAt: new Date(),
            lastActivityAt: new Date(),
          })

          // Start monitoring in background
          const fiber = yield* pipe(
            processMonitor.monitor(handle),
            Stream.tap(event => updateRunnerState(runner.id, event)),
            Stream.runDrain,
            Effect.forkScoped,
          )

          runners.set(runner.id, { runner, fiber, logs: [] })
          return runner
        }),

      streamLogs: (runner) =>
        Stream.async<LogEntry>((emit) => {
          const state = runners.get(runner.id)
          if (!state) {
            emit.end()
            return
          }

          // Emit existing logs
          state.logs.forEach(log => emit.single(log))

          // Set up live streaming
          const unsubscribe = subscribeToLogs(runner.id, (log) => {
            emit.single(log)
          })

          return Effect.sync(() => unsubscribe())
        }),
    }

    return implementation
  }),
  dependencies: [TmuxSessionManager, ProcessMonitorPort],
}) {}
```

## Phase 3: IPC Integration (Days 5-6)

### 3.1 Define IPC Contracts

**Update: src/shared/ipc-contracts.ts**

```typescript
export const AiRunnerIpcContracts = {
  createRunner: {
    channel: 'ai-runner:create' as const,
    input: S.Struct({
      type: S.Literal('claude-code', 'codex', 'cursor', 'custom'),
      name: S.optional(S.String),
      workingDirectory: S.String,
      env: S.optional(S.Record(S.String, S.String)),
    }),
    output: AiRunner,
    errors: S.Union(AiRunnerCreateError, ProcessSpawnError),
  },

  attachToTmuxSession: {
    channel: 'ai-runner:attach-tmux' as const,
    input: S.Struct({ sessionName: S.String }),
    output: AiRunner,
    errors: S.Union(TmuxSessionNotFoundError, ProcessAttachError),
  },

  listRunners: {
    channel: 'ai-runner:list' as const,
    input: S.Void,
    output: S.Array(AiRunner),
    errors: S.Never,
  },

  streamRunnerLogs: {
    channel: 'ai-runner:stream-logs' as const,
    input: S.Struct({ runnerId: S.String }),
    output: S.Array(LogEntry), // Returns batches
    errors: S.Union(RunnerNotFoundError),
  },

  stopRunner: {
    channel: 'ai-runner:stop' as const,
    input: S.Struct({ runnerId: S.String }),
    output: S.Void,
    errors: S.Union(RunnerNotFoundError, ProcessKillError),
  },
} as const
```

### 3.2 IPC Handlers

**File: src/main/ipc/ai-runner-handlers.ts**

```typescript
import { registerIpcHandler } from './ipc-handler-setup'
import { AiRunnerIpcContracts } from '../../shared/ipc-contracts'

export const setupAiRunnerIpcHandlers = Effect.gen(function* () {
  const aiRunnerService = yield* AiRunnerService
  const tmuxManager = yield* TmuxSessionManager

  // Use the centralized registerIpcHandler utility
  registerIpcHandler(
    AiRunnerIpcContracts.createRunner,
    (input) => aiRunnerService.create({
      type: input.type,
      name: input.name,
      workingDirectory: input.workingDirectory,
      env: input.env,
    })
  )

  registerIpcHandler(
    AiRunnerIpcContracts.attachToTmuxSession,
    (input) => Effect.gen(function* () {
      const handle = yield* tmuxManager.attachToSession(input.sessionName)

      return yield* aiRunnerService.create({
        type: 'custom',
        name: `tmux:${input.sessionName}`,
        processHandle: handle,
      })
    })
  )

  registerIpcHandler(
    AiRunnerIpcContracts.listRunners,
    () => aiRunnerService.listAll()
  )

  // Stream handler needs special treatment for continuous updates
  ipcMain.handle(AiRunnerIpcContracts.streamRunnerLogs.channel, async (event, input: unknown) => {
    // Set up SSE-like streaming over IPC
    const program = Effect.gen(function* () {
      const validatedInput = yield* S.decodeUnknown(AiRunnerIpcContracts.streamRunnerLogs.input)(input)

      yield* pipe(
        aiRunnerService.streamLogs({ id: validatedInput.runnerId }),
        Stream.grouped(10), // Batch logs
        Stream.tap(logs =>
          Effect.sync(() => {
            event.sender.send(`ai-runner:logs:${validatedInput.runnerId}`, logs)
          })),
        Stream.runDrain,
      )
    }).pipe(Effect.catchAll(mapDomainErrorToIpcError))

    return await Effect.runPromise(program)
  })
})
```

## Phase 4: Renderer Integration (Days 7-8)

### 4.1 Create Atoms

**File: src/renderer/atoms/ai-runner-atoms.ts**

```typescript
import { Atom } from '@effect-atom/atom-react'
import * as Effect from 'effect/Effect'
import * as Duration from 'effect/Duration'

// List of all runners
export const aiRunnersAtom = Atom.make(
  Effect.gen(function* () {
    const client = yield* ElectronIpcClient
    return yield* client.listRunners()
  })
)
  .pipe(Atom.setIdleTTL(Duration.seconds(5)))
  .pipe(Atom.withReactivityKeys([['ai-runners:list']]))

// Individual runner status
export const aiRunnerAtom = Atom.family((runnerId: string) =>
  Atom.make(
    Effect.gen(function* () {
      const client = yield* ElectronIpcClient
      const runners = yield* client.listRunners()
      return runners.find(w => w.id === runnerId)
    })
  )
    .pipe(Atom.setIdleTTL(Duration.seconds(2)))
    .pipe(Atom.withReactivityKeys([['ai-runners:runner', runnerId]]))
)

// Runner logs stream
export const aiRunnerLogsAtom = Atom.family((runnerId: string) =>
  Atom.make(
    Effect.gen(function* () {
      const client = yield* ElectronIpcClient

      // Set up log streaming subscription
      const logs = yield* Effect.async<LogEntry[]>((resume) => {
        const channel = `ai-runner:logs:${runnerId}`

        const handler = (_event: unknown, logs: LogEntry[]) => {
          resume(Effect.succeed(logs))
        }

        ipcRenderer.on(channel, handler)

        // Start streaming
        client.streamRunnerLogs({ runnerId })

        return Effect.sync(() => {
          ipcRenderer.removeListener(channel, handler)
        })
      })

      return logs
    })
  )
    .pipe(Atom.withReactivityKeys([['ai-runners:logs', runnerId]]))
)
```

### 4.2 Create UI Components

**File: src/renderer/components/AiRunnerMonitor.tsx**

```typescript
export function AiRunnerMonitor() {
  const { runnersResult } = useAiRunners()

  return Result.builder(runnersResult)
    .onInitial(() => <LoadingSpinner />)
    .onErrorTag('ProcessSpawnError', (error) => (
      <ErrorAlert title="Failed to spawn process" message={error.message} />
    ))
    .onErrorTag('TmuxSessionNotFoundError', (error) => (
      <ErrorAlert title="Tmux session not found" message={error.message} />
    ))
    .onDefect((defect) => <UnexpectedError defect={defect} />)
    .onSuccess((runners) => (
      <div className="ai-runner-grid">
        {runners.map(runner => (
          <AiRunnerCard key={runner.id} runner={runner} />
        ))}
        <AddRunnerCard />
      </div>
    ))
    .render()
}

function AiRunnerCard({ runner }: { runner: AiRunner }) {
  const { logsResult } = useRunnerLogs(runner.id)
  const [expanded, setExpanded] = useState(false)

  const statusColor = {
    running: 'green',
    idle: 'yellow',
    stopped: 'gray',
    errored: 'red',
    starting: 'blue',
  }[runner.status]

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between">
          <h3>{runner.name}</h3>
          <Badge color={statusColor}>{runner.status}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-sm text-gray-500">
          Type: {runner.type}
          PID: {runner.processHandle.pid}
          Last Activity: {formatRelativeTime(runner.lastActivityAt)}
        </div>

        {expanded && Result.builder(logsResult)
          .onInitial(() => <div>Loading logs...</div>)
          .onSuccess((logs) => (
            <LogViewer logs={logs} maxHeight={300} />
          ))
          .render()}
      </CardContent>
      <CardFooter>
        <Button onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Hide Logs' : 'Show Logs'}
        </Button>
        <Button variant="destructive" onClick={() => stopRunner(runner.id)}>
          Stop
        </Button>
      </CardFooter>
    </Card>
  )
}
```

## Phase 5: CLI Integration (Days 9-10)

### 5.1 Electron CLI Endpoint

**File: src/main/cli/cli-server.ts**

```typescript
export class CliServer extends Effect.Service<CliServer>()('CliServer', {
  effect: Effect.gen(function* () {
    const aiRunnerService = yield* AiRunnerService

    // Create named pipe for IPC
    const pipePath = process.platform === 'win32'
      ? '\\\\.\\pipe\\geppetto'
      : '/tmp/geppetto.sock'

    const server = net.createServer((socket) => {
      socket.on('data', (data) => {
        const command = JSON.parse(data.toString())

        Effect.runPromise(
          Effect.gen(function* () {
            switch (command.type) {
              case 'attach-tmux': {
                const runner = yield* aiRunnerService.attachToTmuxSession(command.sessionName)
                socket.write(JSON.stringify({ success: true, runner }))
                break
              }
              case 'list-runners': {
                const runners = yield* aiRunnerService.listAll()
                socket.write(JSON.stringify({ success: true, runners }))
                break
              }
              default:
                socket.write(JSON.stringify({ success: false, error: 'Unknown command' }))
            }
          }).pipe(Effect.catchAll(error =>
            Effect.sync(() => {
              socket.write(JSON.stringify({ success: false, error: String(error) }))
            })
          ))
        )
      })
    })

    server.listen(pipePath)

    return {
      stop: () => Effect.sync(() => server.close()),
    }
  }),
  dependencies: [AiRunnerService],
}) {}
```

### 5.2 CLI Client Script

**File: scripts/geppetto-cli.sh**

```bash
#!/bin/bash

# Geppetto CLI - Add current tmux session to Geppetto runner pool

PIPE_PATH="/tmp/geppetto.sock"

if [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]]; then
    PIPE_PATH="\\\\.\\pipe\\geppetto"
fi

attach_current_tmux() {
    if [ -z "$TMUX" ]; then
        echo "Error: Not in a tmux session"
        exit 1
    fi

    SESSION_NAME=$(tmux display-message -p '#S')

    echo "{\"type\":\"attach-tmux\",\"sessionName\":\"$SESSION_NAME\"}" | nc -U "$PIPE_PATH"
}

list_runners() {
    echo "{\"type\":\"list-runners\"}" | nc -U "$PIPE_PATH"
}

case "$1" in
    attach)
        attach_current_tmux
        ;;
    list)
        list_runners
        ;;
    *)
        echo "Usage: geppetto-cli {attach|list}"
        exit 1
        ;;
esac
```

## Phase 6: Multi-Provider Hexagonal Refactor (Days 11-14)

### 6.1 Create Provider Adapter Pattern

**File: src/main/providers/ports.ts**

```typescript
// Generic VCS provider port
export interface VcsProviderPort {
  authenticate(config: AuthConfig): Effect.Effect<AuthResult, AuthenticationError>
  getRepositories(account: Account): Effect.Effect<Repository[], ApiError>
  getIssues(repo: Repository): Effect.Effect<Issue[], ApiError>
  getPullRequests(repo: Repository): Effect.Effect<PullRequest[], ApiError>
}

// Provider registry
export class ProviderRegistry extends Effect.Service<ProviderRegistry>()('ProviderRegistry', {
  effect: Effect.gen(function* () {
    const providers = new Map<ProviderType, VcsProviderPort>()

    return {
      register: (type: ProviderType, provider: VcsProviderPort) =>
        Effect.sync(() => {
          providers.set(type, provider)
        }),

      get: (type: ProviderType) =>
        Effect.gen(function* () {
          const provider = providers.get(type)
          if (!provider) {
            return yield* Effect.fail(new ProviderNotRegisteredError({ type }))
          }
          return provider
        }),

      listTypes: () =>
        Effect.sync(() => Array.from(providers.keys())),
    }
  }),
}) {}
```

### 6.2 Implement Provider Adapters

**File: src/main/providers/github-adapter.ts**

```typescript
export class GitHubAdapter extends Effect.Service<GitHubAdapter>()('GitHubAdapter', {
  effect: Effect.gen(function* () {
    const httpService = yield* GitHubHttpService
    const authService = yield* GitHubAuthService

    const adapter: VcsProviderPort = {
      authenticate: (config) =>
        Effect.gen(function* () {
          const result = yield* authService.startAuthFlow()
          return {
            token: result.token,
            user: result.user,
            provider: 'github',
          }
        }),

      getRepositories: (account) =>
        Effect.gen(function* () {
          const token = yield* SecureStoreService.getToken(account.id)
          const repos = yield* httpService.makeAuthenticatedRequest(
            '/user/repos',
            token,
            S.Array(GitHubRepository)
          )

          // Transform to generic Repository type
          return repos.map(repo => ({
            id: `github:${repo.id}`,
            name: repo.name,
            fullName: repo.full_name,
            description: repo.description,
            url: repo.html_url,
            provider: 'github',
            // ... map other fields
          }))
        }),

      // ... implement other methods
    }

    // Auto-register with registry
    yield* ProviderRegistry.register('github', adapter)

    return adapter
  }),
  dependencies: [GitHubHttpService, GitHubAuthService, SecureStoreService, ProviderRegistry],
}) {}
```

**Similar adapters for GitLab, Bitbucket, Gitea:**
- `src/main/providers/gitlab-adapter.ts`
- `src/main/providers/bitbucket-adapter.ts`
- `src/main/providers/gitea-adapter.ts`

### 6.3 Update Main Layer

**File: src/main/index.ts**

```typescript
const MainLayer = Layer.mergeAll(
  // Core services
  TierService.Default,
  AccountContextService.Default,
  SecureStoreService.Default,

  // Provider registry and adapters
  ProviderRegistry.Default,
  GitHubAdapter.Default,
  GitLabAdapter.Default,
  BitbucketAdapter.Default,
  GiteaAdapter.Default,

  // AI Runner services
  ProcessMonitorService.Default,
  TmuxSessionManager.Default,
  AiRunnerService.Default,
  AiRunnerRegistry.Default,

  // CLI server
  CliServer.Default,
)
```

## Phase 7: Testing Strategy (Days 15-16)

### 7.1 Unit Tests

```typescript
// Test process monitor with mock processes
describe('ProcessMonitorService', () => {
  it('should detect silence after 30 seconds', async () => {
    const TestLayer = Layer.succeed(
      ProcessMonitorPort,
      createMockProcessMonitor()
    )

    const program = Effect.gen(function* () {
      const monitor = yield* ProcessMonitorPort
      const handle = yield* monitor.spawn({ command: 'echo', args: ['test'] })

      const events = yield* pipe(
        monitor.monitor(handle),
        Stream.take(3),
        Stream.runCollect,
      )

      expect(events).toContainEqual(
        expect.objectContaining({ type: 'silence' })
      )
    })

    await Effect.runPromise(program.pipe(Effect.provide(TestLayer)))
  })
})
```

### 7.2 Integration Tests

```typescript
// Test tmux integration
describe('TmuxSessionManager', () => {
  it('should create and attach to tmux session', async () => {
    const program = Effect.gen(function* () {
      const manager = yield* TmuxSessionManager

      const handle = yield* manager.createSession('test-session', 'echo "test"')
      expect(handle.type).toBe('spawned')

      const attached = yield* manager.attachToSession('test-session')
      expect(attached.type).toBe('attached')
    })

    await Effect.runPromise(program.pipe(Effect.provide(MainLayer)))
  })
})
```

## Implementation Checklist

### Week 1: Foundation
- [ ] Create `src/main/ai-runners/` directory structure
- [ ] Define ports and domain types
- [ ] Implement TmuxSessionManager
- [ ] Set up basic error types
- [ ] Create domain schemas

### Week 2: Services
- [ ] Implement ProcessMonitorService with silence detection
- [ ] Implement AiRunnerService with proper scoping
- [ ] Create AiRunnerRegistry for provider management
- [ ] Update error mapper
- [ ] Add services to MainLayer

### Week 3: IPC & Frontend
- [ ] Define IPC contracts for ai-runners
- [ ] Implement IPC handlers with type-safe pattern
- [ ] Create renderer atoms
- [ ] Build AiRunnerMonitor component
- [ ] Implement log streaming

### Week 4: Integration & Polish
- [ ] Implement CLI server
- [ ] Create geppetto-cli script
- [ ] Add provider adapters (GitHub, GitLab, Bitbucket, Gitea)
- [ ] Write comprehensive tests
- [ ] Performance optimization
- [ ] Documentation

## Success Criteria

1. **Process Monitoring**: Successfully detect idle state after 30 seconds of silence
2. **Tmux Integration**: Can attach to existing tmux sessions and spawn new ones
3. **Multi-Provider**: All 4 VCS providers (GitHub, GitLab, Bitbucket, Gitea) working
4. **Error Handling**: <5% defect rate, all errors typed and handled gracefully
5. **Performance**: Log streaming handles 1000+ lines/second without UI lag
6. **CLI Integration**: Can add current tmux session from terminal
7. **Type Safety**: No `any` types, proper Effect patterns throughout

## Key Implementation Notes

### Structured Concurrency
- Use `Effect.scoped` for resource lifetime management
- Use `Effect.forkScoped` NOT `Effect.forkDaemon` for background tasks
- All resources cleaned up automatically when scope ends

### Error Handling
- Domain errors → IPC errors → Result types in renderer
- Use `Result.builder()` pattern for exhaustive error handling in UI
- Never use `try/catch`, always Effect error channels

### State Management
- Use `Ref` for mutable state within services
- Use atoms for renderer state with proper reactivity keys
- Stream logs via IPC channels for real-time updates

### Performance
- Batch log updates in groups of 10-50
- Use rolling logs with 100MB limit
- Implement virtual scrolling for log viewer
- Cache runner status for 2 seconds

## References

- Effect-TS Docs: https://effect.website
- Hexagonal Architecture: https://alistair.cockburn.us/hexagonal-architecture/
- Domain-Driven Design: https://martinfowler.com/bliki/DomainDrivenDesign.html
- Tmux Control Mode: https://man7.org/linux/man-pages/man1/tmux.1.html

## Next Steps After Implementation

1. **Add AI Provider Plugins**: OpenAI, Anthropic, Cohere adapters
2. **Enhanced Monitoring**: CPU/Memory usage per runner
3. **Collaborative Features**: Share runner sessions with team
4. **Automation**: Trigger runners based on git events
5. **Analytics**: Track AI usage and costs across providers
