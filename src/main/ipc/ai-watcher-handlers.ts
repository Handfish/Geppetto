/**
 * AI Watcher IPC Handlers
 *
 * Handles IPC communication for AI watcher management using the generic
 * registerIpcHandler pattern for type-safe, boilerplate-free handler registration.
 */

import { Effect } from 'effect'
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

  // Create watcher
  registerIpcHandler(AiWatcherIpcContracts['ai-watcher:create'], (input) =>
    aiWatcherService.create({
      type: input.type,
      name: input.name,
      workingDirectory: input.workingDirectory,
      env: input.env,
      command: input.command,
      args: input.args,
    })
  )

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

  // Get watcher logs
  registerIpcHandler(AiWatcherIpcContracts['ai-watcher:get-logs'], (input) =>
    aiWatcherService.getLogs(input.watcherId, input.limit)
  )

  // List tmux sessions
  registerIpcHandler(AiWatcherIpcContracts['ai-watcher:list-tmux'], () =>
    tmuxManager.listSessions()
  )
})
