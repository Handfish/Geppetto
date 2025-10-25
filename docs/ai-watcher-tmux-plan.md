# AI Watcher Tmux Integration Plan

## Executive Summary

This plan outlines the integration of AI agent watchers with tmux sessions in Geppetto, enabling process monitoring, logging, and interactive control of Claude Code, Codex, and other AI agents. The implementation follows hexagonal architecture principles with Effect-TS best practices.

## Phase 1: Foundation Architecture (Days 1-2)

### 1.1 Create Core Ports and Domain Types

**Files to create:**
```
src/main/ai-watchers/
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

// AI watcher port - orchestrates AI agent lifecycle
export interface AiWatcherPort {
  create(config: AiWatcherConfig): Effect.Effect<AiWatcher, AiWatcherCreateError>
  start(watcher: AiWatcher): Effect.Effect<void, AiWatcherStartError>
  stop(watcher: AiWatcher): Effect.Effect<void, AiWatcherStopError>
  getStatus(watcher: AiWatcher): Effect.Effect<AiWatcherStatus, never>
  streamLogs(watcher: AiWatcher): Stream.Stream<LogEntry, never>
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

export class AiWatcher extends S.Class<AiWatcher>('AiWatcher')({
  id: S.String,
  name: S.String,
  type: S.Literal('claude-code', 'codex', 'cursor', 'custom'),
  processHandle: ProcessHandle,
  status: S.Literal('starting', 'running', 'idle', 'stopped', 'errored'),
  config: AiWatcherConfig,
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

**File: src/main/ai-watchers/tmux-session-manager.ts**

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

**File: src/main/ai-watchers/process-monitor-service.ts**

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

### 2.2 AI Watcher Service

**File: src/main/ai-watchers/ai-watcher-service.ts**

```typescript
export class AiWatcherService extends Effect.Service<AiWatcherService>()('AiWatcherService', {
  effect: Effect.gen(function* () {
    const tmuxManager = yield* TmuxSessionManager
    const processMonitor = yield* ProcessMonitorPort
    const watchers = new Map<string, WatcherState>()

    const implementation: AiWatcherPort = {
      create: (config) =>
        Effect.gen(function* () {
          // Create tmux session with AI agent
          const sessionName = `ai-${config.type}-${ulid()}`
          const command = getAiAgentCommand(config)

          const handle = yield* tmuxManager.createSession(sessionName, command)

          const watcher = new AiWatcher({
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
            Stream.tap(event => updateWatcherState(watcher.id, event)),
            Stream.runDrain,
            Effect.forkScoped,
          )

          watchers.set(watcher.id, { watcher, fiber, logs: [] })
          return watcher
        }),

      streamLogs: (watcher) =>
        Stream.async<LogEntry>((emit) => {
          const state = watchers.get(watcher.id)
          if (!state) {
            emit.end()
            return
          }

          // Emit existing logs
          state.logs.forEach(log => emit.single(log))

          // Set up live streaming
          const unsubscribe = subscribeToLogs(watcher.id, (log) => {
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
export const AiWatcherIpcContracts = {
  createWatcher: {
    channel: 'ai-watcher:create' as const,
    input: S.Struct({
      type: S.Literal('claude-code', 'codex', 'cursor', 'custom'),
      name: S.optional(S.String),
      workingDirectory: S.String,
      env: S.optional(S.Record(S.String, S.String)),
    }),
    output: AiWatcher,
    errors: S.Union(AiWatcherCreateError, ProcessSpawnError),
  },

  attachToTmuxSession: {
    channel: 'ai-watcher:attach-tmux' as const,
    input: S.Struct({ sessionName: S.String }),
    output: AiWatcher,
    errors: S.Union(TmuxSessionNotFoundError, ProcessAttachError),
  },

  listWatchers: {
    channel: 'ai-watcher:list' as const,
    input: S.Void,
    output: S.Array(AiWatcher),
    errors: S.Never,
  },

  streamWatcherLogs: {
    channel: 'ai-watcher:stream-logs' as const,
    input: S.Struct({ watcherId: S.String }),
    output: S.Array(LogEntry), // Returns batches
    errors: S.Union(WatcherNotFoundError),
  },

  stopWatcher: {
    channel: 'ai-watcher:stop' as const,
    input: S.Struct({ watcherId: S.String }),
    output: S.Void,
    errors: S.Union(WatcherNotFoundError, ProcessKillError),
  },
} as const
```

### 3.2 IPC Handlers

**File: src/main/ipc/ai-watcher-handlers.ts**

```typescript
export const setupAiWatcherIpcHandlers = Effect.gen(function* () {
  const aiWatcherService = yield* AiWatcherService

  // Use the CRITICAL type-safe pattern from CLAUDE.md
  type ContractInput<K extends keyof typeof AiWatcherIpcContracts> =
    S.Schema.Type<typeof AiWatcherIpcContracts[K]['input']>
  type ContractOutput<K extends keyof typeof AiWatcherIpcContracts> =
    S.Schema.Type<typeof AiWatcherIpcContracts[K]['output']>

  const setupHandler = <K extends keyof typeof AiWatcherIpcContracts, E>(
    key: K,
    handler: (input: ContractInput<K>) => Effect.Effect<ContractOutput<K>, E>
  ) => {
    const contract = AiWatcherIpcContracts[key]

    type InputSchema = S.Schema<ContractInput<K>, S.Schema.Encoded<typeof AiWatcherIpcContracts[K]['input']>>
    type OutputSchema = S.Schema<ContractOutput<K>, S.Schema.Encoded<typeof AiWatcherIpcContracts[K]['output']>>

    ipcMain.handle(contract.channel, async (_event, input: unknown) => {
      const program = Effect.gen(function* () {
        const validatedInput = yield* S.decodeUnknown(contract.input as unknown as InputSchema)(input)
        const result = yield* handler(validatedInput)
        const encoded = yield* S.encode(contract.output as unknown as OutputSchema)(result)
        return encoded
      }).pipe(Effect.catchAll(mapDomainErrorToIpcError))

      return await Effect.runPromise(program)
    })
  }

  setupHandler('createWatcher', (input) =>
    aiWatcherService.create({
      type: input.type,
      name: input.name,
      workingDirectory: input.workingDirectory,
      env: input.env,
    }))

  setupHandler('attachToTmuxSession', (input) =>
    Effect.gen(function* () {
      const tmuxManager = yield* TmuxSessionManager
      const handle = yield* tmuxManager.attachToSession(input.sessionName)

      return yield* aiWatcherService.create({
        type: 'custom',
        name: `tmux:${input.sessionName}`,
        processHandle: handle,
      })
    }))

  setupHandler('listWatchers', () =>
    aiWatcherService.listAll())

  // Stream handler needs special treatment for continuous updates
  ipcMain.handle(AiWatcherIpcContracts.streamWatcherLogs.channel, async (event, input: unknown) => {
    // Set up SSE-like streaming over IPC
    const program = Effect.gen(function* () {
      const validatedInput = yield* S.decodeUnknown(AiWatcherIpcContracts.streamWatcherLogs.input)(input)

      yield* pipe(
        aiWatcherService.streamLogs({ id: validatedInput.watcherId }),
        Stream.grouped(10), // Batch logs
        Stream.tap(logs =>
          Effect.sync(() => {
            event.sender.send(`ai-watcher:logs:${validatedInput.watcherId}`, logs)
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

**File: src/renderer/atoms/ai-watcher-atoms.ts**

```typescript
import { Atom } from '@effect-atom/atom-react'
import * as Effect from 'effect/Effect'
import * as Duration from 'effect/Duration'

// List of all watchers
export const aiWatchersAtom = Atom.make(
  Effect.gen(function* () {
    const client = yield* ElectronIpcClient
    return yield* client.listWatchers()
  })
)
  .pipe(Atom.setIdleTTL(Duration.seconds(5)))
  .pipe(Atom.withReactivityKeys([['ai-watchers:list']]))

// Individual watcher status
export const aiWatcherAtom = Atom.family((watcherId: string) =>
  Atom.make(
    Effect.gen(function* () {
      const client = yield* ElectronIpcClient
      const watchers = yield* client.listWatchers()
      return watchers.find(w => w.id === watcherId)
    })
  )
    .pipe(Atom.setIdleTTL(Duration.seconds(2)))
    .pipe(Atom.withReactivityKeys([['ai-watchers:watcher', watcherId]]))
)

// Watcher logs stream
export const aiWatcherLogsAtom = Atom.family((watcherId: string) =>
  Atom.make(
    Effect.gen(function* () {
      const client = yield* ElectronIpcClient

      // Set up log streaming subscription
      const logs = yield* Effect.async<LogEntry[]>((resume) => {
        const channel = `ai-watcher:logs:${watcherId}`

        const handler = (_event: unknown, logs: LogEntry[]) => {
          resume(Effect.succeed(logs))
        }

        ipcRenderer.on(channel, handler)

        // Start streaming
        client.streamWatcherLogs({ watcherId })

        return Effect.sync(() => {
          ipcRenderer.removeListener(channel, handler)
        })
      })

      return logs
    })
  )
    .pipe(Atom.withReactivityKeys([['ai-watchers:logs', watcherId]]))
)
```

### 4.2 Create UI Components

**File: src/renderer/components/AiWatcherMonitor.tsx**

```typescript
export function AiWatcherMonitor() {
  const { watchersResult } = useAiWatchers()

  return Result.builder(watchersResult)
    .onInitial(() => <LoadingSpinner />)
    .onErrorTag('ProcessSpawnError', (error) => (
      <ErrorAlert title="Failed to spawn process" message={error.message} />
    ))
    .onErrorTag('TmuxSessionNotFoundError', (error) => (
      <ErrorAlert title="Tmux session not found" message={error.message} />
    ))
    .onDefect((defect) => <UnexpectedError defect={defect} />)
    .onSuccess((watchers) => (
      <div className="ai-watcher-grid">
        {watchers.map(watcher => (
          <AiWatcherCard key={watcher.id} watcher={watcher} />
        ))}
        <AddWatcherCard />
      </div>
    ))
    .render()
}

function AiWatcherCard({ watcher }: { watcher: AiWatcher }) {
  const { logsResult } = useWatcherLogs(watcher.id)
  const [expanded, setExpanded] = useState(false)

  const statusColor = {
    running: 'green',
    idle: 'yellow',
    stopped: 'gray',
    errored: 'red',
    starting: 'blue',
  }[watcher.status]

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between">
          <h3>{watcher.name}</h3>
          <Badge color={statusColor}>{watcher.status}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-sm text-gray-500">
          Type: {watcher.type}
          PID: {watcher.processHandle.pid}
          Last Activity: {formatRelativeTime(watcher.lastActivityAt)}
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
        <Button variant="destructive" onClick={() => stopWatcher(watcher.id)}>
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
    const aiWatcherService = yield* AiWatcherService

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
                const watcher = yield* aiWatcherService.attachToTmuxSession(command.sessionName)
                socket.write(JSON.stringify({ success: true, watcher }))
                break
              }
              case 'list-watchers': {
                const watchers = yield* aiWatcherService.listAll()
                socket.write(JSON.stringify({ success: true, watchers }))
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
  dependencies: [AiWatcherService],
}) {}
```

### 5.2 CLI Client Script

**File: scripts/geppetto-cli.sh**

```bash
#!/bin/bash

# Geppetto CLI - Add current tmux session to Geppetto watcher pool

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

list_watchers() {
    echo "{\"type\":\"list-watchers\"}" | nc -U "$PIPE_PATH"
}

case "$1" in
    attach)
        attach_current_tmux
        ;;
    list)
        list_watchers
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

  // AI Watcher services
  ProcessMonitorService.Default,
  TmuxSessionManager.Default,
  AiWatcherService.Default,
  AiWatcherRegistry.Default,

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
- [ ] Create `src/main/ai-watchers/` directory structure
- [ ] Define ports and domain types
- [ ] Implement TmuxSessionManager
- [ ] Set up basic error types
- [ ] Create domain schemas

### Week 2: Services
- [ ] Implement ProcessMonitorService with silence detection
- [ ] Implement AiWatcherService with proper scoping
- [ ] Create AiWatcherRegistry for provider management
- [ ] Update error mapper
- [ ] Add services to MainLayer

### Week 3: IPC & Frontend
- [ ] Define IPC contracts for ai-watchers
- [ ] Implement IPC handlers with type-safe pattern
- [ ] Create renderer atoms
- [ ] Build AiWatcherMonitor component
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
- Cache watcher status for 2 seconds

## References

- Effect-TS Docs: https://effect.website
- Hexagonal Architecture: https://alistair.cockburn.us/hexagonal-architecture/
- Domain-Driven Design: https://martinfowler.com/bliki/DomainDrivenDesign.html
- Tmux Control Mode: https://man7.org/linux/man-pages/man1/tmux.1.html

## Next Steps After Implementation

1. **Add AI Provider Plugins**: OpenAI, Anthropic, Cohere adapters
2. **Enhanced Monitoring**: CPU/Memory usage per watcher
3. **Collaborative Features**: Share watcher sessions with team
4. **Automation**: Trigger watchers based on git events
5. **Analytics**: Track AI usage and costs across providers
