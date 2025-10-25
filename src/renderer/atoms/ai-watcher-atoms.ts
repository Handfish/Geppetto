import { Atom } from '@effect-atom/atom-react'
import { Effect, Duration } from 'effect'
import type { AiWatcherConfig } from '../../shared/schemas/ai-watchers'
import { AiWatcherClient } from '../lib/ipc-client'

/**
 * AI Watcher Atoms - Reactive state management for AI agent monitoring
 *
 * Provides atoms for:
 * - Listing all watchers
 * - Getting individual watcher details
 * - Fetching watcher logs
 * - Listing tmux sessions
 * - Creating and managing watchers (action atoms)
 */

const aiWatcherRuntime = Atom.runtime(AiWatcherClient.Default)

/**
 * List all AI watchers
 * Refreshes every 5 seconds
 */
export const aiWatchersAtom = aiWatcherRuntime
  .atom(
    Effect.gen(function* () {
      const client = yield* AiWatcherClient
      return yield* client.listWatchers()
    })
  )
  .pipe(
    Atom.withReactivity(['ai-watchers:list']),
    Atom.setIdleTTL(Duration.seconds(5))
  )

/**
 * Get individual watcher by ID
 * Refreshes every 2 seconds
 */
export const aiWatcherAtom = Atom.family((watcherId: string) =>
  aiWatcherRuntime
    .atom(
      Effect.gen(function* () {
        const client = yield* AiWatcherClient
        return yield* client.getWatcher(watcherId)
      })
    )
    .pipe(
      Atom.withReactivity(['ai-watchers:watcher', watcherId]),
      Atom.setIdleTTL(Duration.seconds(2))
    )
)

/**
 * Get logs for a specific watcher
 * Refreshes every 3 seconds
 */
export const aiWatcherLogsAtom = Atom.family(
  (params: { watcherId: string; limit?: number }) =>
    aiWatcherRuntime
      .atom(
        Effect.gen(function* () {
          const client = yield* AiWatcherClient
          return yield* client.getWatcherLogs(params.watcherId, params.limit)
        })
      )
      .pipe(
        Atom.withReactivity(['ai-watchers:logs', params.watcherId]),
        Atom.setIdleTTL(Duration.seconds(3))
      )
)

/**
 * List all tmux sessions
 * Refreshes every 10 seconds
 */
export const tmuxSessionsAtom = aiWatcherRuntime
  .atom(
    Effect.gen(function* () {
      const client = yield* AiWatcherClient
      return yield* client.listTmuxSessions()
    })
  )
  .pipe(
    Atom.withReactivity(['ai-watchers:tmux-sessions']),
    Atom.setIdleTTL(Duration.seconds(10))
  )

/**
 * Create a new AI watcher
 * Invalidates watcher list on success
 */
export const createWatcherAtom = aiWatcherRuntime.fn(
  (config: AiWatcherConfig) =>
    Effect.gen(function* () {
      const client = yield* AiWatcherClient
      return yield* client.createWatcher(config)
    }),
  {
    reactivityKeys: ['ai-watchers:list'],
  }
)

/**
 * Attach to an existing tmux session
 * Invalidates watcher list on success
 */
export const attachToTmuxSessionAtom = aiWatcherRuntime.fn(
  (sessionName: string) =>
    Effect.gen(function* () {
      const client = yield* AiWatcherClient
      return yield* client.attachToTmuxSession(sessionName)
    }),
  {
    reactivityKeys: ['ai-watchers:list', 'ai-watchers:tmux-sessions'],
  }
)

/**
 * Stop a running watcher
 * Invalidates watcher list and specific watcher
 */
export const stopWatcherAtom = aiWatcherRuntime.fn(
  (watcherId: string) =>
    Effect.gen(function* () {
      const client = yield* AiWatcherClient
      yield* client.stopWatcher(watcherId)
    }),
  {
    reactivityKeys: ['ai-watchers:list', 'ai-watchers:watcher'],
  }
)

/**
 * Start a stopped watcher
 * Invalidates watcher list and specific watcher
 */
export const startWatcherAtom = aiWatcherRuntime.fn(
  (watcherId: string) =>
    Effect.gen(function* () {
      const client = yield* AiWatcherClient
      yield* client.startWatcher(watcherId)
    }),
  {
    reactivityKeys: ['ai-watchers:list', 'ai-watchers:watcher'],
  }
)
