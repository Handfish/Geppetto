import * as Effect from 'effect/Effect'
import * as Stream from 'effect/Stream'
import type * as Fiber from 'effect/Fiber'
import * as Ref from 'effect/Ref'
import * as Queue from 'effect/Queue'
import * as Scope from 'effect/Scope'
import * as Exit from 'effect/Exit'
import { pipe } from 'effect/Function'
import { randomUUID } from 'node:crypto'
import type { AiWatcherPort } from './ports'
import type { AiWatcherStatus } from './schemas'
import { AiWatcher, AiWatcherConfig, ProcessEvent, ProcessHandle, LogEntry } from './schemas'
import {
  AiWatcherCreateError,
  AiWatcherStartError,
  AiWatcherStopError,
  WatcherNotFoundError,
} from './errors'
import { NodeProcessMonitorAdapter } from './adapters/node-process-monitor-adapter'
import { TmuxSessionManagerAdapter } from './adapters/tmux-session-manager-adapter'

/**
 * Internal watcher state tracked by the service
 */
interface WatcherState {
  watcher: AiWatcher
  scope: Scope.CloseableScope // Scope for the watcher's lifecycle
  fiber: Fiber.RuntimeFiber<void, never> // Monitoring fiber (scoped to the watcher's scope)
  logs: LogEntry[]
  logQueue: Queue.Queue<LogEntry>
  statusRef: Ref.Ref<AiWatcherStatus>
  lastActivityRef: Ref.Ref<Date>
}

/**
 * Maximum log entries to keep in memory per watcher
 */
const MAX_LOG_ENTRIES = 1000

/**
 * Get the command and args to run for a specific AI agent type
 */
const getAiAgentCommand = (
  config: AiWatcherConfig
): { command: string; args?: string[] } => {
  // If custom command provided, use it
  if (config.command) {
    return {
      command: config.command,
      args: config.args ? [...config.args] : undefined, // Convert readonly to mutable
    }
  }

  // Default commands for known AI agent types
  switch (config.type) {
    case 'claude-code':
      return { command: 'claude' } // ✅ FIXED: bash process is 'claude', not 'claude-code'
    case 'codex':
      return { command: 'codex' }
    case 'cursor':
      return { command: 'cursor' }
    case 'custom':
      return { command: 'bash' }
    default:
      return { command: 'bash' }
  }
}

/**
 * Convert ProcessEvent to LogEntry
 */
const processEventToLogEntry = (
  event: ProcessEvent,
  watcherId: string
): LogEntry => {
  let level: LogEntry['level'] = 'info'
  let message = ''

  switch (event.type) {
    case 'stdout':
      level = 'stdout'
      message = event.data ?? ''
      break
    case 'stderr':
      level = 'stderr'
      message = event.data ?? ''
      break
    case 'error':
      level = 'error'
      message = event.data ?? 'Process error'
      break
    case 'exit':
      level = 'info'
      message = `Process exited: ${event.data ?? 'unknown'}`
      break
    case 'silence':
      level = 'debug'
      message = 'Process idle (4s silence detected)'
      break
  }

  return {
    timestamp: event.timestamp,
    level,
    message,
    watcherId,
  }
}

/**
 * AiWatcherService - implements AiWatcherPort
 *
 * Provides high-level AI agent management:
 * - Creating and configuring AI watchers
 * - Starting and stopping watchers
 * - Status tracking
 * - Log streaming with batching
 * - Integration with TmuxSessionManager and ProcessMonitorService
 */
export class AiWatcherService extends Effect.Service<AiWatcherService>()(
  'AiWatcherService',
  {
    dependencies: [TmuxSessionManagerAdapter.Default, NodeProcessMonitorAdapter.Default],
    effect: Effect.gen(function* () {
      const tmuxManager = yield* TmuxSessionManagerAdapter
      const processMonitor = yield* NodeProcessMonitorAdapter

      // Map of watcher ID to watcher state
      const watchers = new Map<string, WatcherState>()

      /**
       * Update watcher status
       */
      const updateWatcherStatus = (
        watcherId: string,
        status: AiWatcherStatus
      ): Effect.Effect<void> =>
        Effect.gen(function* () {
          const state = watchers.get(watcherId)
          if (!state) {
            return yield* Effect.void
          }
          yield* Ref.set(state.statusRef, status)
          state.watcher = new AiWatcher({
            ...state.watcher,
            status,
          })
        })

      /**
       * Update watcher last activity time
       */
      const updateLastActivity = (watcherId: string): Effect.Effect<void> =>
        Effect.gen(function* () {
          const state = watchers.get(watcherId)
          if (!state) {
            return yield* Effect.void
          }
          const now = new Date()
          yield* Ref.set(state.lastActivityRef, now)
          state.watcher = new AiWatcher({
            ...state.watcher,
            lastActivityAt: now,
          })
        })

      /**
       * Add a log entry to a watcher
       */
      const addLogEntry = (
        watcherId: string,
        logEntry: LogEntry
      ): Effect.Effect<void> =>
        Effect.gen(function* () {
          const state = watchers.get(watcherId)
          if (!state) {
            return yield* Effect.void
          }

          // Add to log buffer (with max size limit)
          state.logs.push(logEntry)
          if (state.logs.length > MAX_LOG_ENTRIES) {
            state.logs.shift() // Remove oldest entry
          }

          // Offer to log queue for streaming
          yield* Queue.offer(state.logQueue, logEntry).pipe(
            Effect.catchAll(() => Effect.void) // Ignore if queue is full/closed
          )
        })

      /**
       * Handle process events and update watcher state
       */
      const handleProcessEvent = (
        watcherId: string,
        event: ProcessEvent
      ): Effect.Effect<void> =>
        Effect.gen(function* () {
          // Convert to log entry
          const logEntry = processEventToLogEntry(event, watcherId)
          yield* addLogEntry(watcherId, logEntry)

          // Update status based on event type
          switch (event.type) {
            case 'stdout':
            case 'stderr':
              yield* updateWatcherStatus(watcherId, 'running')
              yield* updateLastActivity(watcherId)
              break

            case 'silence':
              yield* updateWatcherStatus(watcherId, 'idle')
              break

            case 'error':
              yield* updateWatcherStatus(watcherId, 'errored')
              break

            case 'exit':
              yield* updateWatcherStatus(watcherId, 'stopped')
              break
          }
        })

      /**
       * Start monitoring a process for a watcher within the watcher's scope
       * This ensures the monitoring fiber is properly cleaned up when the watcher stops
       */
      const startMonitoring = (
        watcherId: string,
        watcher: AiWatcher,
        scope: Scope.Scope
      ): Effect.Effect<Fiber.RuntimeFiber<void, never>> =>
        pipe(
          processMonitor.monitor(watcher.processHandle),
          Stream.tap((event) => handleProcessEvent(watcherId, event)),
          Stream.runDrain,
          Effect.catchAll(() => Effect.void), // Catch and ignore all errors from monitoring
          Effect.forkIn(scope) // Fork into the watcher's specific scope
        )

      const implementation: AiWatcherPort = {
        create: (config: AiWatcherConfig) =>
          Effect.gen(function* () {
            // Normalize config into the local schema to avoid constructor parse errors
            const baseConfig =
              config instanceof AiWatcherConfig ? config : new AiWatcherConfig(config)

            const watcherId = yield* Effect.sync(() => randomUUID())

            let processHandle: ProcessHandle | undefined = baseConfig.processHandle

            // Create a dedicated scope for this watcher's lifecycle
            // This scope will live until the watcher is explicitly stopped
            const watcherScope = yield* Scope.make()

            // If no process handle provided, create a new tmux session
            if (!processHandle) {
              const sessionName = `ai-${baseConfig.type}-${watcherId.slice(0, 8)}`
              const { command, args } = getAiAgentCommand(baseConfig)

              // Extend the createSession scope into the watcher's scope
              // This ensures tmux lifecycle is bound to watcher lifecycle
              processHandle = yield* Scope.extend(
                tmuxManager.createSession(
                  sessionName,
                  command,
                  args,
                  baseConfig.workingDirectory
                ).pipe(
                  Effect.mapError((error: unknown) =>
                    new AiWatcherCreateError({
                      message: `Failed to create tmux session: ${error instanceof Error ? error.message : String(error)}`,
                      config: {
                        type: baseConfig.type,
                        name: baseConfig.name,
                      },
                      cause: error,
                    })
                  )
                ),
                watcherScope
              )
            }

            // At this point, processHandle must be defined
            if (!processHandle) {
              return yield* Effect.fail(
                new AiWatcherCreateError({
                  message: 'Failed to create or obtain process handle',
                  config: {
                    type: baseConfig.type,
                    name: baseConfig.name,
                  },
                  cause: new Error('processHandle is undefined'),
                })
              )
            }

            const watcherConfig =
              baseConfig.processHandle === processHandle
                ? baseConfig
                : new AiWatcherConfig({
                    ...baseConfig,
                    processHandle,
                  })

            const watcher = new AiWatcher({
              id: watcherId,
              name: watcherConfig.name ?? `${watcherConfig.type}-watcher`,
              type: watcherConfig.type,
              processHandle,
              status: 'starting',
              config: watcherConfig,
              createdAt: new Date(),
              lastActivityAt: new Date(),
            })

            // Create log queue and refs
            const logQueue = yield* Queue.unbounded<LogEntry>()
            const statusRef = yield* Ref.make<AiWatcherStatus>('starting')
            const lastActivityRef = yield* Ref.make(new Date())

            // Start monitoring in the watcher's scope
            const fiber = yield* startMonitoring(watcherId, watcher, watcherScope)

            // Store watcher state
            const state: WatcherState = {
              watcher,
              scope: watcherScope,
              fiber,
              logs: [],
              logQueue,
              statusRef,
              lastActivityRef,
            }
            watchers.set(watcherId, state)

            // Transition to running after a short delay (using forkIn to scope to watcher)
            yield* Effect.forkIn(
              Effect.gen(function* () {
                yield* Effect.sleep(1000) // 1 second
                const currentStatus = yield* Ref.get(statusRef)
                if (currentStatus === 'starting') {
                  yield* updateWatcherStatus(watcherId, 'running')
                }
              }),
              watcherScope
            )

            return watcher
          }),

        start: (watcher: AiWatcher) =>
          Effect.gen(function* () {
            const state = watchers.get(watcher.id)
            if (!state) {
              return yield* Effect.fail(
                new AiWatcherStartError({
                  message: `Watcher ${watcher.id} not found`,
                  watcherId: watcher.id,
                  cause: new WatcherNotFoundError({
                    message: `Watcher ${watcher.id} not found`,
                    watcherId: watcher.id,
                  }),
                })
              )
            }

            // If already running, do nothing
            const currentStatus = yield* Ref.get(state.statusRef)
            if (currentStatus === 'running' || currentStatus === 'starting') {
              return
            }

            // Restart monitoring in the watcher's scope
            const fiber = yield* startMonitoring(watcher.id, watcher, state.scope)
            state.fiber = fiber

            yield* updateWatcherStatus(watcher.id, 'running')
          }),

        stop: (watcher: AiWatcher) =>
          Effect.gen(function* () {
            const state = watchers.get(watcher.id)
            if (!state) {
              return yield* Effect.fail(
                new AiWatcherStopError({
                  message: `Watcher ${watcher.id} not found`,
                  watcherId: watcher.id,
                  cause: new WatcherNotFoundError({
                    message: `Watcher ${watcher.id} not found`,
                    watcherId: watcher.id,
                  }),
                })
              )
            }

            // Close the watcher's scope - this will interrupt all fibers in that scope
            // including the monitoring fiber and any other background tasks
            yield* Scope.close(state.scope, Exit.void)

            // Kill the process
            yield* processMonitor.kill(watcher.processHandle).pipe(
              Effect.catchAll(() => Effect.void) // Ignore errors if already dead
            )

            // Update status
            yield* updateWatcherStatus(watcher.id, 'stopped')

            // Clean up queue
            yield* Queue.shutdown(state.logQueue)

            // Remove from watchers map
            watchers.delete(watcher.id)
          }),

        getStatus: (watcher: AiWatcher) =>
          Effect.gen(function* () {
            const state = watchers.get(watcher.id)
            if (!state) {
              return 'stopped' as AiWatcherStatus
            }

            return yield* Ref.get(state.statusRef)
          }),

        get: (watcherId: string) =>
          Effect.gen(function* () {
            const state = watchers.get(watcherId)
            if (!state) {
              return yield* Effect.fail(
                new WatcherNotFoundError({
                  message: `Watcher ${watcherId} not found`,
                  watcherId,
                })
              )
            }

            return state.watcher
          }),

        listAll: () =>
          Effect.gen(function* () {
            return Array.from(watchers.values()).map((state) => state.watcher)
          }),

        getLogs: (watcherId: string, limit?: number) =>
          Effect.gen(function* () {
            const state = watchers.get(watcherId)
            if (!state) {
              return yield* Effect.fail(
                new WatcherNotFoundError({
                  message: `Watcher ${watcherId} not found`,
                  watcherId,
                })
              )
            }

            const logs = state.logs
            if (limit && limit > 0) {
              // Return last N logs
              return logs.slice(-limit)
            }

            return logs
          }),

        streamLogs: (watcher: AiWatcher) =>
          Stream.unwrap(
            Effect.sync(() => {
              const state = watchers.get(watcher.id)
              if (!state) {
                // Return empty stream if watcher not found
                return Stream.empty as Stream.Stream<LogEntry, never, never>
              }

              // Create a stream that emits existing logs, then new logs from the queue
              const existingLogs = Stream.fromIterable(state.logs)
              const newLogs = Stream.fromQueue(state.logQueue)

              return Stream.concat(existingLogs, newLogs)
            })
          ),
      }

      return implementation
    }),
  }
) {}
