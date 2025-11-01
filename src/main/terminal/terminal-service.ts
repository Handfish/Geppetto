import { Effect, Stream, Ref, HashMap } from 'effect'
import { TerminalRegistry } from './terminal-registry'
import { ProcessConfig, ProcessState, OutputChunk, ProcessEvent, TerminalError, ProcessId } from './terminal-port'
import { AccountContextService } from '../account/account-context-service'
import { TierService } from '../tier/tier-service'

interface WatcherProcessConfig extends ProcessConfig {
  accountId: string
  agentType: string
  prompt: string
}

interface TerminalServiceMethods {
  spawnAiWatcher(config: {
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
  }): Effect.Effect<{ processId: string; state: ProcessState }, TerminalError, never>
  killWatcher(processId: string): Effect.Effect<void, TerminalError, never>
  killAllWatchers(): Effect.Effect<void, never, never>
  restartWatcher(processId: string): Effect.Effect<ProcessState, TerminalError, never>
  writeToWatcher(processId: string, data: string): Effect.Effect<void, TerminalError, never>
  resizeWatcher(processId: string, rows: number, cols: number): Effect.Effect<void, TerminalError, never>
  getWatcherState(processId: string): Effect.Effect<ProcessState, TerminalError, never>
  listActiveWatchers(): Effect.Effect<ReadonlyArray<{ processId: string; accountId: string; agentType: string; prompt: string; state: ProcessState; issueContext?: any }>, never, never>
  subscribeToWatcher(processId: string): Stream.Stream<OutputChunk, TerminalError, never>
  subscribeToWatcherEvents(processId: string): Stream.Stream<ProcessEvent, TerminalError, never>
}

export class TerminalService extends Effect.Service<TerminalService>()(
  'TerminalService',
  {
    effect: Effect.gen(function* () {
      const registry = yield* TerminalRegistry
      const accountService = yield* AccountContextService
      const tierService = yield* TierService

      // Track active watchers
      const activeWatchers = yield* Ref.make(HashMap.empty<string, WatcherProcessConfig>())

      const spawnAiWatcher: TerminalServiceMethods['spawnAiWatcher'] = (config) => Effect.gen(function* () {
        // Check tier limits - map feature error to terminal error
        yield* tierService.checkFeatureAvailable('ai-watchers').pipe(
          Effect.mapError(() => new TerminalError({
            reason: 'PermissionDenied',
            message: 'AI watchers feature not available in current tier'
          }))
        )

        // Get account context (not strictly needed for terminal, but validates account exists)
        const context = yield* accountService.getContext()
        const adapter = yield* registry.getDefaultAdapter()

        // Generate process ID
        const processId = config.issueContext
          ? `watcher-${config.accountId}-issue-${config.issueContext.issueNumber}`
          : `watcher-${config.accountId}-${Date.now()}`

        // Build command based on agent type
        const cwd = config.issueContext?.worktreePath || process.cwd()

        // Map agent types to actual commands
        let command: string
        let args: string[]

        // TEST: Let's first verify PTY works with a simple bash shell
        // Then we can test with AI commands
        switch (config.agentType) {
          case 'claude':
            // For testing: spawn bash first to see if PTY captures output
            command = '/bin/bash'
            args = []
            console.log('[TerminalService] Testing with bash shell first for claude agent')
            break
          case 'codex':
            command = 'codex'
            args = [config.prompt]
            break
          case 'cursor':
            command = 'cursor'
            args = ['agent', config.prompt]
            break
          default:
            // Fallback to interactive shell for unknown agent types
            command = process.platform === 'win32' ? 'powershell.exe' : '/bin/bash'
            args = []
        }

        // Cast to branded ProcessId type
        const processConfig = new ProcessConfig({
          id: processId as ProcessId,
          command,
          args,
          env: {
            // Inherit parent environment and add AI watcher context
            TERM: 'xterm-256color',
            AI_WATCHER_AGENT: config.agentType,
            AI_WATCHER_PROMPT: config.prompt,
            AI_WATCHER_ISSUE: config.issueContext ? String(config.issueContext.issueNumber) : '',
          },
          cwd,
          shell: process.platform === 'win32' ? 'powershell.exe' : '/bin/bash',
          rows: 30,
          cols: 120,
          issueContext: config.issueContext,
        })

        const watcherConfig: WatcherProcessConfig = {
          ...processConfig,
          accountId: config.accountId,
          agentType: config.agentType,
          prompt: config.prompt,
        }

        // Spawn the process
        const state = yield* adapter.spawn(processConfig)

        // Track the watcher
        yield* Ref.update(activeWatchers, HashMap.set(processId, watcherConfig))

        return {
          processId,
          state,
        }
      })

      const killWatcher: TerminalServiceMethods['killWatcher'] = (processId) => Effect.gen(function* () {
        const adapter = yield* registry.getDefaultAdapter()
        yield* adapter.kill(processId)
        yield* Ref.update(activeWatchers, HashMap.remove(processId))
      })

      const killAllWatchers: TerminalServiceMethods['killAllWatchers'] = () => Effect.gen(function* () {
        const watchers = yield* Ref.get(activeWatchers)
        const adapter = yield* registry.getDefaultAdapter()

        yield* Effect.all(
          Array.from(HashMap.keys(watchers)).map((processId) =>
            adapter.kill(processId).pipe(
              Effect.catchAll(() => Effect.void) // Ignore errors
            )
          ),
          { concurrency: 'unbounded' }
        )

        yield* Ref.set(activeWatchers, HashMap.empty())
      })

      const restartWatcher: TerminalServiceMethods['restartWatcher'] = (processId) => Effect.gen(function* () {
        const watchers = yield* Ref.get(activeWatchers)
        const configOption = HashMap.get(watchers, processId)

        if (configOption._tag === 'None') {
          return yield* Effect.fail(new TerminalError({ reason: 'ProcessNotFound', message: `Watcher ${processId} not found` }))
        }

        const adapter = yield* registry.getDefaultAdapter()
        return yield* adapter.restart(processId)
      })

      const writeToWatcher: TerminalServiceMethods['writeToWatcher'] = (processId, data) => Effect.gen(function* () {
        const adapter = yield* registry.getDefaultAdapter()
        yield* adapter.write(processId, data)
      })

      const resizeWatcher: TerminalServiceMethods['resizeWatcher'] = (processId, rows, cols) => Effect.gen(function* () {
        const adapter = yield* registry.getDefaultAdapter()
        yield* adapter.resize(processId, rows, cols)
      })

      const getWatcherState: TerminalServiceMethods['getWatcherState'] = (processId) => Effect.gen(function* () {
        const adapter = yield* registry.getDefaultAdapter()
        return yield* adapter.getState(processId)
      })

      const listActiveWatchers: TerminalServiceMethods['listActiveWatchers'] = () => Effect.gen(function* () {
        const watchers = yield* Ref.get(activeWatchers)
        const adapter = yield* registry.getDefaultAdapter()

        const states = yield* Effect.all(
          Array.from(HashMap.entries(watchers)).map(([processId, config]) =>
            adapter.getState(processId).pipe(
              Effect.map((state) => ({
                processId,
                accountId: config.accountId,
                agentType: config.agentType,
                prompt: config.prompt,
                state,
                issueContext: config.issueContext,
              })),
              Effect.catchAll(() =>
                Effect.succeed({
                  processId,
                  accountId: config.accountId,
                  agentType: config.agentType,
                  prompt: config.prompt,
                  state: new ProcessState({
                    status: 'stopped' as const,
                    lastActivity: new Date(),
                    idleThreshold: 60000,
                  }),
                  issueContext: config.issueContext,
                })
              )
            )
          ),
          { concurrency: 'unbounded' }
        )

        return states
      })

      const subscribeToWatcher: TerminalServiceMethods['subscribeToWatcher'] = (processId) => {
        console.log('[TerminalService] subscribeToWatcher called for:', processId)
        return Stream.flatMap(
          Stream.fromEffect(
            Effect.tap(
              registry.getDefaultAdapter(),
              () => Effect.sync(() => console.log('[TerminalService] Got adapter, calling subscribe'))
            )
          ),
          (adapter) => {
            console.log('[TerminalService] Adapter retrieved, calling adapter.subscribe')
            return adapter.subscribe(processId)
          }
        )
      }

      const subscribeToWatcherEvents: TerminalServiceMethods['subscribeToWatcherEvents'] = (processId) => {
        return Stream.flatMap(
          Stream.fromEffect(registry.getDefaultAdapter()),
          (adapter) => adapter.subscribeToEvents(processId)
        )
      }

      return {
        spawnAiWatcher,
        killWatcher,
        killAllWatchers,
        restartWatcher,
        writeToWatcher,
        resizeWatcher,
        getWatcherState,
        listActiveWatchers,
        subscribeToWatcher,
        subscribeToWatcherEvents,
      } satisfies TerminalServiceMethods
    }),
    dependencies: [TerminalRegistry.Default, AccountContextService.Default, TierService.Default],
  }
) {}
