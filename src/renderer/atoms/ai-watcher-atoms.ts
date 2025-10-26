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
 * Refreshes every 30 seconds (reduced from 5s to minimize IPC spam)
 * Use manual refresh via button or after actions for immediate updates
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
    Atom.setIdleTTL(Duration.seconds(30))
  )

/**
 * Get individual watcher by ID
 * Refreshes every 30 seconds (reduced from 2s to minimize IPC spam)
 * Most watcher data is already in aiWatchersAtom - use that when possible
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
      Atom.setIdleTTL(Duration.seconds(30))
    )
)

/**
 * Get logs for a specific watcher
 * Manual refresh only - no auto-refresh TTL
 * Components control refresh timing via useAtomRefresh
 */
export const aiWatcherLogsAtom = Atom.family(
  (params: { watcherId: string; limit?: number }) => {
    console.log(`[aiWatcherLogsAtom] Creating atom for watcherId=${params.watcherId}, limit=${params.limit}`)

    return aiWatcherRuntime
      .atom(
        Effect.gen(function* () {
          console.log(`[aiWatcherLogsAtom] Effect running for watcherId=${params.watcherId}`)
          const client = yield* AiWatcherClient
          const result = yield* client.getWatcherLogs(params.watcherId, params.limit)
          console.log(`[aiWatcherLogsAtom] Got ${result.length} logs for watcherId=${params.watcherId}`)
          return result
        })
      )
      .pipe(
        Atom.withReactivity(['ai-watchers:logs', params.watcherId])
        // No TTL - manual refresh controlled by components
      )
  }
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
