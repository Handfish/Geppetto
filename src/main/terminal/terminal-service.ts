import { Effect, Stream, Ref, HashMap } from 'effect'
import { TerminalRegistry } from './terminal-registry'
import { ProcessConfig, ProcessState, OutputChunk, ProcessEvent, TerminalError } from './terminal-port'
import { AccountContextService } from '../account/account-context-service'
import { TierService } from '../tier/tier-service'

interface WatcherProcessConfig extends ProcessConfig {
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

      // Track active watchers
      const activeWatchers = yield* Ref.make(HashMap.empty<string, WatcherProcessConfig>())

      const spawnAiWatcher = (config: {
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
        yield* tierService.checkFeatureAvailable('ai-watchers')

        const account = yield* accountService.getAccountContext(config.accountId)
        const adapter = yield* registry.getDefaultAdapter()

        // Generate process ID
        const processId = config.issueContext
          ? `watcher-${config.accountId}-issue-${config.issueContext.issueNumber}`
          : `watcher-${config.accountId}-${Date.now()}`

        // Build command based on agent type
        const command = config.agentType === 'claude' ? 'claude' : 'cursor'
        const cwd = config.issueContext?.worktreePath || process.cwd()

        const processConfig: WatcherProcessConfig = {
          id: processId as ProcessConfig['id'],
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

        // Track the watcher
        yield* Ref.update(activeWatchers, HashMap.set(processId, processConfig))

        return {
          processId,
          state,
        }
      })

      const killWatcher = (processId: string) => Effect.gen(function* () {
        const adapter = yield* registry.getDefaultAdapter()
        yield* adapter.kill(processId)
        yield* Ref.update(activeWatchers, HashMap.remove(processId))
      })

      const killAllWatchers = () => Effect.gen(function* () {
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

      const restartWatcher = (processId: string) => Effect.gen(function* () {
        const watchers = yield* Ref.get(activeWatchers)
        const configOption = HashMap.get(watchers, processId)

        if (configOption._tag === 'None') {
          return yield* Effect.fail(new TerminalError({ reason: 'ProcessNotFound', message: `Watcher ${processId} not found` }))
        }

        const adapter = yield* registry.getDefaultAdapter()
        return yield* adapter.restart(processId)
      })

      const writeToWatcher = (processId: string, data: string) => Effect.gen(function* () {
        const adapter = yield* registry.getDefaultAdapter()
        yield* adapter.write(processId, data)
      })

      const resizeWatcher = (processId: string, rows: number, cols: number) => Effect.gen(function* () {
        const adapter = yield* registry.getDefaultAdapter()
        yield* adapter.resize(processId, rows, cols)
      })

      const getWatcherState = (processId: string) => Effect.gen(function* () {
        const adapter = yield* registry.getDefaultAdapter()
        return yield* adapter.getState(processId)
      })

      const listActiveWatchers = () => Effect.gen(function* () {
        const watchers = yield* Ref.get(activeWatchers)
        const adapter = yield* registry.getDefaultAdapter()

        const states = yield* Effect.all(
          Array.from(HashMap.entries(watchers)).map(([processId, config]) =>
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

      const subscribeToWatcher = (processId: string): Stream.Stream<OutputChunk, TerminalError> => {
        return Stream.fromEffect(registry.getDefaultAdapter()).pipe(
          Stream.flatMap((adapter) => adapter.subscribe(processId))
        )
      }

      const subscribeToWatcherEvents = (processId: string): Stream.Stream<ProcessEvent, TerminalError> => {
        return Stream.fromEffect(registry.getDefaultAdapter()).pipe(
          Stream.flatMap((adapter) => adapter.subscribeToEvents(processId))
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
      }
    }),
    dependencies: [TerminalRegistry, AccountContextService, TierService],
  }
) {}
