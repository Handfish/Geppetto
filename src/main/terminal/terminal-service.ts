import { Effect, Ref, HashMap } from 'effect'
import { TerminalRegistry } from './terminal-registry'
import { ProcessConfig, ProcessState, OutputChunk, ProcessEvent, TerminalError, ProcessId } from './terminal-port'
import { AccountContextService } from '../account/account-context-service'
import { TierService } from '../tier/tier-service'

interface RunnerProcessConfig extends ProcessConfig {
  accountId: string
  agentType: string
  prompt: string
}

interface TerminalServiceMethods {
  spawnAiRunner(config: {
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
  killRunner(processId: string): Effect.Effect<void, TerminalError, never>
  killAllRunners(): Effect.Effect<void, never, never>
  restartRunner(processId: string): Effect.Effect<ProcessState, TerminalError, never>
  writeToRunner(processId: string, data: string): Effect.Effect<void, TerminalError, never>
  resizeRunner(processId: string, rows: number, cols: number): Effect.Effect<void, TerminalError, never>
  getRunnerState(processId: string): Effect.Effect<ProcessState, TerminalError, never>
  listActiveRunners(): Effect.Effect<ReadonlyArray<{ processId: string; accountId: string; agentType: string; prompt: string; state: ProcessState; issueContext?: any }>, never, never>
  subscribeToRunner(processId: string, onOutput: (chunk: OutputChunk) => void): Effect.Effect<() => void, TerminalError, never>
  subscribeToRunnerEvents(processId: string, onEvent: (event: ProcessEvent) => void): Effect.Effect<() => void, TerminalError, never>
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

      const spawnAiRunner: TerminalServiceMethods['spawnAiRunner'] = (config) => Effect.gen(function* () {
        // Check tier limits - map feature error to terminal error
        yield* tierService.checkFeatureAvailable('ai-runners').pipe(
          Effect.mapError(() => new TerminalError({
            reason: 'PermissionDenied',
            message: 'AI runners feature not available in current tier'
          }))
        )

        // Get account context (not strictly needed for terminal, but validates account exists)
        const context = yield* accountService.getContext()
        const adapter = yield* registry.getDefaultAdapter()

        // Generate process ID
        const processId = config.issueContext
          ? `runner-${config.accountId}-issue-${config.issueContext.issueNumber}`
          : `runner-${config.accountId}-${Date.now()}`

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
            // Inherit parent environment and add AI runner context
            TERM: 'xterm-256color',
            AI_RUNNER_AGENT: config.agentType,
            AI_RUNNER_PROMPT: config.prompt,
            AI_RUNNER_ISSUE: config.issueContext ? String(config.issueContext.issueNumber) : '',
          },
          cwd,
          shell: process.platform === 'win32' ? 'powershell.exe' : '/bin/bash',
          rows: 30,
          cols: 120,
          issueContext: config.issueContext,
        })

        const runnerConfig: RunnerProcessConfig = {
          ...processConfig,
          accountId: config.accountId,
          agentType: config.agentType,
          prompt: config.prompt,
        }

        // Spawn the process
        const state = yield* adapter.spawn(processConfig)

        // Track the runner
        yield* Ref.update(activeRunners, HashMap.set(processId, runnerConfig))

        return {
          processId,
          state,
        }
      })

      const killRunner: TerminalServiceMethods['killRunner'] = (processId) => Effect.gen(function* () {
        const adapter = yield* registry.getDefaultAdapter()
        yield* adapter.kill(processId)
        yield* Ref.update(activeRunners, HashMap.remove(processId))
      })

      const killAllRunners: TerminalServiceMethods['killAllRunners'] = () => Effect.gen(function* () {
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

      const restartRunner: TerminalServiceMethods['restartRunner'] = (processId) => Effect.gen(function* () {
        const runners = yield* Ref.get(activeRunners)
        const configOption = HashMap.get(runners, processId)

        if (configOption._tag === 'None') {
          return yield* Effect.fail(new TerminalError({ reason: 'ProcessNotFound', message: `Runner ${processId} not found` }))
        }

        const adapter = yield* registry.getDefaultAdapter()
        return yield* adapter.restart(processId)
      })

      const writeToRunner: TerminalServiceMethods['writeToRunner'] = (processId, data) => Effect.gen(function* () {
        const adapter = yield* registry.getDefaultAdapter()
        yield* adapter.write(processId, data)
      })

      const resizeRunner: TerminalServiceMethods['resizeRunner'] = (processId, rows, cols) => Effect.gen(function* () {
        const adapter = yield* registry.getDefaultAdapter()
        yield* adapter.resize(processId, rows, cols)
      })

      const getRunnerState: TerminalServiceMethods['getRunnerState'] = (processId) => Effect.gen(function* () {
        const adapter = yield* registry.getDefaultAdapter()
        return yield* adapter.getState(processId)
      })

      const listActiveRunners: TerminalServiceMethods['listActiveRunners'] = () => Effect.gen(function* () {
        const runners = yield* Ref.get(activeRunners)
        const adapter = yield* registry.getDefaultAdapter()

        const states = yield* Effect.all(
          Array.from(HashMap.entries(runners)).map(([processId, config]) =>
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

      const subscribeToRunner: TerminalServiceMethods['subscribeToRunner'] = (processId, onOutput) => {
        console.log('[TerminalService] subscribeToRunner called for:', processId)
        return Effect.gen(function* () {
          const adapter = yield* registry.getDefaultAdapter()
          console.log('[TerminalService] Got adapter, calling subscribe')
          return yield* adapter.subscribe(processId, onOutput)
        })
      }

      const subscribeToRunnerEvents: TerminalServiceMethods['subscribeToRunnerEvents'] = (processId, onEvent) => {
        return Effect.gen(function* () {
          const adapter = yield* registry.getDefaultAdapter()
          return yield* adapter.subscribeToEvents(processId, onEvent)
        })
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
      } satisfies TerminalServiceMethods
    }),
    dependencies: [TerminalRegistry.Default, AccountContextService.Default, TierService.Default],
  }
) {}
