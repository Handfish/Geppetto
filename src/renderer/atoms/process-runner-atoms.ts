import { Atom } from '@effect-atom/atom-react'
import { Effect, Duration } from 'effect'
import type { ProcessRunnerConfig } from '../../shared/schemas/process-runners'
import { ProcessRunnerClient } from '../lib/ipc-client'

/**
 * Process Runner Atoms - Reactive state management for process runner monitoring
 *
 * Provides atoms for:
 * - Listing all runners
 * - Getting individual runner details
 * - Fetching runner logs
 * - Listing tmux sessions
 * - Creating and managing runners (action atoms)
 */

const processRunnerRuntime = Atom.runtime(ProcessRunnerClient.Default)

/**
 * List all process runners
 * Polling controlled by RunnersPanel (every 2 seconds)
 * No auto-refresh TTL - manual refresh ensures fresh data
 */
export const processRunnersAtom = processRunnerRuntime
  .atom(
    Effect.gen(function* () {
      const client = yield* ProcessRunnerClient
      return yield* client.listRunners()
    })
  )
  .pipe(
    Atom.withReactivity(['process-runners:list'])
    // No TTL - RunnersPanel polls every 2s via useAtomRefresh
  )

// Backwards compatibility alias
export const aiWatchersAtom = processRunnersAtom

/**
 * Get individual runner by ID
 * Refreshes every 30 seconds (reduced from 2s to minimize IPC spam)
 * Most runner data is already in processRunnersAtom - use that when possible
 */
export const processRunnerAtom = Atom.family((runnerId: string) =>
  processRunnerRuntime
    .atom(
      Effect.gen(function* () {
        const client = yield* ProcessRunnerClient
        return yield* client.getRunner(runnerId)
      })
    )
    .pipe(
      Atom.withReactivity(['process-runners:runner', runnerId]),
      Atom.setIdleTTL(Duration.seconds(30))
    )
)

// Backwards compatibility alias
export const aiWatcherAtom = processRunnerAtom

/**
 * Get logs for a specific runner
 * Manual refresh only - no auto-refresh TTL
 * Components control refresh timing via useAtomRefresh
 */
export const processRunnerLogsAtom = Atom.family(
  (params: { runnerId: string; limit?: number }) => {
    console.log(`[processRunnerLogsAtom] Creating atom for runnerId=${params.runnerId}, limit=${params.limit}`)

    return processRunnerRuntime
      .atom(
        Effect.gen(function* () {
          console.log(`[processRunnerLogsAtom] Effect running for runnerId=${params.runnerId}`)
          const client = yield* ProcessRunnerClient
          const result = yield* client.getRunnerLogs(params.runnerId, params.limit)
          console.log(`[processRunnerLogsAtom] Got ${result.length} logs for runnerId=${params.runnerId}`)
          return result
        })
      )
      .pipe(
        Atom.withReactivity(['process-runners:logs', params.runnerId])
        // No TTL - manual refresh controlled by components
      )
  }
)

// Backwards compatibility alias
export const aiWatcherLogsAtom = processRunnerLogsAtom

/**
 * List all tmux sessions
 * Refreshes every 10 seconds
 */
export const tmuxSessionsAtom = processRunnerRuntime
  .atom(
    Effect.gen(function* () {
      const client = yield* ProcessRunnerClient
      return yield* client.listTmuxSessions()
    })
  )
  .pipe(
    Atom.withReactivity(['process-runners:tmux-sessions']),
    Atom.setIdleTTL(Duration.seconds(10))
  )

/**
 * Create a new process runner
 * Invalidates runner list on success
 */
export const createRunnerAtom = processRunnerRuntime.fn(
  (config: ProcessRunnerConfig) =>
    Effect.gen(function* () {
      const client = yield* ProcessRunnerClient
      return yield* client.createRunner(config)
    }),
  {
    reactivityKeys: ['process-runners:list'],
  }
)

// Backwards compatibility alias
export const createWatcherAtom = createRunnerAtom

/**
 * Attach to an existing tmux session
 * Invalidates runner list on success
 */
export const attachToTmuxSessionAtom = processRunnerRuntime.fn(
  (sessionName: string) =>
    Effect.gen(function* () {
      const client = yield* ProcessRunnerClient
      return yield* client.attachToTmuxSession(sessionName)
    }),
  {
    reactivityKeys: ['process-runners:list', 'process-runners:tmux-sessions'],
  }
)

/**
 * Stop a running runner
 * Invalidates runner list and specific runner
 */
export const stopRunnerAtom = processRunnerRuntime.fn(
  (runnerId: string) =>
    Effect.gen(function* () {
      const client = yield* ProcessRunnerClient
      yield* client.stopRunner(runnerId)
    }),
  {
    reactivityKeys: ['process-runners:list', 'process-runners:runner'],
  }
)

// Backwards compatibility alias
export const stopWatcherAtom = stopRunnerAtom

/**
 * Start a stopped runner
 * Invalidates runner list and specific runner
 */
export const startRunnerAtom = processRunnerRuntime.fn(
  (runnerId: string) =>
    Effect.gen(function* () {
      const client = yield* ProcessRunnerClient
      yield* client.startRunner(runnerId)
    }),
  {
    reactivityKeys: ['process-runners:list', 'process-runners:runner'],
  }
)

// Backwards compatibility alias
export const startWatcherAtom = startRunnerAtom

/**
 * Switch to a tmux session
 * No reactivity keys - this is a terminal UI action
 */
export const switchToTmuxSessionAtom = processRunnerRuntime.fn(
  (sessionName: string) =>
    Effect.gen(function* () {
      console.log('[switchToTmuxSessionAtom] Starting switch for session:', sessionName)
      const client = yield* ProcessRunnerClient
      console.log('[switchToTmuxSessionAtom] Got client, calling switchToTmuxSession...')
      yield* client.switchToTmuxSession(sessionName)
      console.log('[switchToTmuxSessionAtom] Switch completed successfully')
    }),
  {
    reactivityKeys: [], // No data changes, just switches terminal view
  }
)
