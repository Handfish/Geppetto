/**
 * Process Runner IPC Handlers
 *
 * Handles IPC communication for process runner management using the generic
 * registerIpcHandler pattern for type-safe, boilerplate-free handler registration.
 */

import { Effect, Duration, Cache } from 'effect'
import { ProcessRunnerIpcContracts } from '../../shared/ipc-contracts'
import { ProcessRunnerService, TmuxSessionManagerAdapter } from '../process-runners'
import { registerIpcHandler } from './ipc-handler-setup'

/**
 * Setup Process Runner IPC handlers
 */
export const setupProcessRunnerIpcHandlers = Effect.gen(function* () {
  const processRunnerService = yield* ProcessRunnerService
  const tmuxManager = yield* TmuxSessionManagerAdapter

  /**
   * Create a cache for log requests with 1-second TTL
   * This throttles log fetching to at most once per second per runner
   * Cache key format: "runnerId:limit" (e.g., "abc123:50")
   */
  const logsCache = yield* Cache.make({
    capacity: 100,
    timeToLive: Duration.seconds(1),
    lookup: (key: string) => {
      const [runnerId, limitStr] = key.split(':')
      const limit = limitStr ? parseInt(limitStr, 10) : undefined
      return processRunnerService.getLogs(runnerId, limit)
    },
  })

  // Create runner
  registerIpcHandler(ProcessRunnerIpcContracts['process-runner:create'], (input) => {
    // Build config only with defined fields to work with Effect Schema optional fields
    type ConfigInput = Parameters<typeof processRunnerService.create>[0]
    const config: ConfigInput = {
      type: input.type,
      workingDirectory: input.workingDirectory,
      ...(input.name !== undefined && { name: input.name }),
      ...(input.command !== undefined && { command: input.command }),
      ...(input.args !== undefined && { args: input.args }),
      ...(input.env !== undefined && { env: input.env }),
    } as ConfigInput

    return processRunnerService.create(config)
  })

  // Attach to tmux session
  registerIpcHandler(ProcessRunnerIpcContracts['process-runner:attach-tmux'], (input) =>
    Effect.gen(function* () {
      const handle = yield* tmuxManager.attachToSession(input.sessionName)
      return yield* processRunnerService.create({
        type: 'custom',
        name: `tmux:${input.sessionName}`,
        workingDirectory: '/tmp',
        processHandle: handle,
      })
    })
  )

  // List all runners
  registerIpcHandler(ProcessRunnerIpcContracts['process-runner:list'], () =>
    processRunnerService.listAll()
  )

  // Get runner by ID
  registerIpcHandler(ProcessRunnerIpcContracts['process-runner:get'], (input) =>
    processRunnerService.get(input.runnerId)
  )

  // Stop runner
  registerIpcHandler(ProcessRunnerIpcContracts['process-runner:stop'], (input) =>
    Effect.gen(function* () {
      const runner = yield* processRunnerService.get(input.runnerId)
      return yield* processRunnerService.stop(runner)
    })
  )

  // Start runner
  registerIpcHandler(ProcessRunnerIpcContracts['process-runner:start'], (input) =>
    Effect.gen(function* () {
      const runner = yield* processRunnerService.get(input.runnerId)
      return yield* processRunnerService.start(runner)
    })
  )

  // Get runner logs (throttled via cache - max once per second per runner)
  registerIpcHandler(ProcessRunnerIpcContracts['process-runner:get-logs'], (input) => {
    const cacheKey = `${input.runnerId}:${input.limit ?? ''}`
    return logsCache.get(cacheKey)
  })

  // List tmux sessions
  registerIpcHandler(ProcessRunnerIpcContracts['process-runner:list-tmux'], () =>
    tmuxManager.listSessions()
  )

  // Switch to tmux session
  registerIpcHandler(ProcessRunnerIpcContracts['process-runner:switch-tmux'], (input) =>
    tmuxManager.switchToSession(input.sessionName)
  )
})

// Backwards compatibility alias
export const setupAiWatcherIpcHandlers = setupProcessRunnerIpcHandlers
