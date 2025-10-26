/**
 * AI Watcher IPC Handlers
 *
 * Handles IPC communication for AI watcher management using the generic
 * registerIpcHandler pattern for type-safe, boilerplate-free handler registration.
 */

import { Effect, Duration, Cache } from 'effect'
import { AiWatcherIpcContracts } from '../../shared/ipc-contracts'
import { AiWatcherService } from '../ai-watchers/ai-watcher-service'
import { TmuxSessionManager } from '../ai-watchers/tmux-session-manager'
import { registerIpcHandler } from './ipc-handler-setup'

/**
 * Setup AI Watcher IPC handlers
 */
export const setupAiWatcherIpcHandlers = Effect.gen(function* () {
  const aiWatcherService = yield* AiWatcherService
  const tmuxManager = yield* TmuxSessionManager

  /**
   * Create a cache for log requests with 1-second TTL
   * This throttles log fetching to at most once per second per watcher
   * Cache key format: "watcherId:limit" (e.g., "abc123:50")
   */
  const logsCache = yield* Cache.make({
    capacity: 100,
    timeToLive: Duration.seconds(1),
    lookup: (key: string) => {
      const [watcherId, limitStr] = key.split(':')
      const limit = limitStr ? parseInt(limitStr, 10) : undefined
      return aiWatcherService.getLogs(watcherId, limit)
    },
  })

  // Create watcher
  registerIpcHandler(AiWatcherIpcContracts['ai-watcher:create'], (input) => {
    // Build config only with defined fields to work with Effect Schema optional fields
    type ConfigInput = Parameters<typeof aiWatcherService.create>[0]
    const config: ConfigInput = {
      type: input.type,
      workingDirectory: input.workingDirectory,
      ...(input.name !== undefined && { name: input.name }),
      ...(input.command !== undefined && { command: input.command }),
      ...(input.args !== undefined && { args: input.args }),
      ...(input.env !== undefined && { env: input.env }),
    } as ConfigInput

    return aiWatcherService.create(config)
  })

  // Attach to tmux session
  registerIpcHandler(AiWatcherIpcContracts['ai-watcher:attach-tmux'], (input) =>
    Effect.gen(function* () {
      const handle = yield* tmuxManager.attachToSession(input.sessionName)
      return yield* aiWatcherService.create({
        type: 'custom',
        name: `tmux:${input.sessionName}`,
        workingDirectory: '/tmp',
        processHandle: handle,
      })
    })
  )

  // List all watchers
  registerIpcHandler(AiWatcherIpcContracts['ai-watcher:list'], () =>
    aiWatcherService.listAll()
  )

  // Get watcher by ID
  registerIpcHandler(AiWatcherIpcContracts['ai-watcher:get'], (input) =>
    aiWatcherService.get(input.watcherId)
  )

  // Stop watcher
  registerIpcHandler(AiWatcherIpcContracts['ai-watcher:stop'], (input) =>
    Effect.gen(function* () {
      const watcher = yield* aiWatcherService.get(input.watcherId)
      return yield* aiWatcherService.stop(watcher)
    })
  )

  // Start watcher
  registerIpcHandler(AiWatcherIpcContracts['ai-watcher:start'], (input) =>
    Effect.gen(function* () {
      const watcher = yield* aiWatcherService.get(input.watcherId)
      return yield* aiWatcherService.start(watcher)
    })
  )

  // Get watcher logs (throttled via cache - max once per second per watcher)
  registerIpcHandler(AiWatcherIpcContracts['ai-watcher:get-logs'], (input) => {
    const cacheKey = `${input.watcherId}:${input.limit ?? ''}`
    return logsCache.get(cacheKey)
  })

  // List tmux sessions
  registerIpcHandler(AiWatcherIpcContracts['ai-watcher:list-tmux'], () =>
    tmuxManager.listSessions()
  )
})
