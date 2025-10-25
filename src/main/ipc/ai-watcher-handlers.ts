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
  registerIpcHandler(AiWatcherIpcContracts.createWatcher, (input) =>
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
  registerIpcHandler(AiWatcherIpcContracts.attachToTmuxSession, (input) =>
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
  registerIpcHandler(AiWatcherIpcContracts.listWatchers, () =>
    aiWatcherService.listAll()
  )

  // Get watcher by ID
  registerIpcHandler(AiWatcherIpcContracts.getWatcher, (input) =>
    aiWatcherService.get(input.watcherId)
  )

  // Stop watcher
  registerIpcHandler(AiWatcherIpcContracts.stopWatcher, (input) =>
    Effect.gen(function* () {
      const watcher = yield* aiWatcherService.get(input.watcherId)
      return yield* aiWatcherService.stop(watcher)
    })
  )

  // Start watcher
  registerIpcHandler(AiWatcherIpcContracts.startWatcher, (input) =>
    Effect.gen(function* () {
      const watcher = yield* aiWatcherService.get(input.watcherId)
      return yield* aiWatcherService.start(watcher)
    })
  )

  // Get watcher logs
  registerIpcHandler(AiWatcherIpcContracts.getWatcherLogs, (input) =>
    aiWatcherService.getLogs(input.watcherId, input.limit)
  )

  // List tmux sessions
  registerIpcHandler(AiWatcherIpcContracts.listTmuxSessions, () =>
    tmuxManager.listSessions()
  )
})
