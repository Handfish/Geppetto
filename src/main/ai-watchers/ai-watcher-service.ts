import * as Effect from 'effect/Effect'
import * as Stream from 'effect/Stream'
import * as Fiber from 'effect/Fiber'
import * as Ref from 'effect/Ref'
import * as Queue from 'effect/Queue'
import { pipe } from 'effect/Function'
import { ulid } from 'ulid'
import type { AiWatcherPort, LogEntry } from './ports'
import { AiWatcher, AiWatcherConfig, ProcessEvent, type AiWatcherStatus } from './schemas'
import {
  AiWatcherCreateError,
  AiWatcherStartError,
  AiWatcherStopError,
  WatcherNotFoundError,
} from './errors'
import { ProcessMonitorService } from './process-monitor-service'
import { TmuxSessionManager } from './tmux-session-manager'

/**
 * Internal watcher state tracked by the service
 */
interface WatcherState {
  watcher: AiWatcher
  fiber: Fiber.RuntimeFiber<void, never> // Monitoring fiber
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
 * Get the command to run for a specific AI agent type
 */
const getAiAgentCommand = (config: AiWatcherConfig): string => {
  // If custom command provided, use it
  if (config.command) {
    const args = config.args?.join(' ') ?? ''
    return args ? `${config.command} ${args}` : config.command
  }

  // Default commands for known AI agent types
  switch (config.type) {
    case 'claude-code':
      return 'claude-code'
    case 'codex':
      return 'codex'
    case 'cursor':
      return 'cursor'
    case 'custom':
      return config.command ?? 'bash'
    default:
      return 'bash'
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
      message = 'Process idle (30s silence detected)'
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
    effect: Effect.gen(function* () {
      const tmuxManager = yield* TmuxSessionManager
      const processMonitor = yield* ProcessMonitorService

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
          if (state) {
            yield* Ref.set(state.statusRef, status)
            state.watcher = new AiWatcher({
              ...state.watcher,
              status,
            })
          }
        })

      /**
       * Update watcher last activity time
       */
      const updateLastActivity = (watcherId: string): Effect.Effect<void> =>
        Effect.gen(function* () {
          const state = watchers.get(watcherId)
          if (state) {
            const now = new Date()
            yield* Ref.set(state.lastActivityRef, now)
            state.watcher = new AiWatcher({
              ...state.watcher,
              lastActivityAt: now,
            })
          }
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
            return
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
       * Start monitoring a process for a watcher
       */
      const startMonitoring = (
        watcherId: string,
        watcher: AiWatcher
      ): Effect.Effect<Fiber.RuntimeFiber<void, never>, never, never> =>
        pipe(
          processMonitor.monitor(watcher.processHandle),
          Stream.tap((event) => handleProcessEvent(watcherId, event)),
          Stream.runDrain,
          Effect.forkDaemon // Use forkDaemon for long-running monitoring
        )

      const implementation: AiWatcherPort = {
        create: (config: AiWatcherConfig) =>
          Effect.gen(function* () {
            const watcherId = ulid()

            try {
              let processHandle = config.processHandle

              // If no process handle provided, create a new tmux session
              if (!processHandle) {
                const sessionName = `ai-${config.type}-${watcherId.slice(0, 8)}`
                const command = getAiAgentCommand(config)

                processHandle = yield* tmuxManager.createSession(
                  sessionName,
                  command,
                  config.workingDirectory
                )
              }

              const watcher = new AiWatcher({
                id: watcherId,
                name: config.name ?? `${config.type}-watcher`,
                type: config.type,
                processHandle,
                status: 'starting',
                config,
                createdAt: new Date(),
                lastActivityAt: new Date(),
              })

              // Create log queue and refs
              const logQueue = yield* Queue.unbounded<LogEntry>()
              const statusRef = yield* Ref.make<AiWatcherStatus>('starting')
              const lastActivityRef = yield* Ref.make(new Date())

              // Start monitoring in background
              const fiber = yield* startMonitoring(watcherId, watcher)

              // Store watcher state
              const state: WatcherState = {
                watcher,
                fiber,
                logs: [],
                logQueue,
                statusRef,
                lastActivityRef,
              }
              watchers.set(watcherId, state)

              // Transition to running after a short delay
              yield* Effect.forkDaemon(
                Effect.gen(function* () {
                  yield* Effect.sleep(1000) // 1 second
                  const currentStatus = yield* Ref.get(statusRef)
                  if (currentStatus === 'starting') {
                    yield* updateWatcherStatus(watcherId, 'running')
                  }
                })
              )

              return watcher
            } catch (error) {
              return yield* Effect.fail(
                new AiWatcherCreateError({
                  message: `Failed to create watcher: ${error instanceof Error ? error.message : String(error)}`,
                  config: {
                    type: config.type,
                    name: config.name,
                  },
                  cause: error,
                })
              )
            }
          }),

        start: (watcher: AiWatcher) =>
          Effect.gen(function* () {
            const state = watchers.get(watcher.id)
            if (!state) {
              return yield* Effect.fail(
                new WatcherNotFoundError({
                  message: `Watcher ${watcher.id} not found`,
                  watcherId: watcher.id,
                })
              )
            }

            // If already running, do nothing
            const currentStatus = yield* Ref.get(state.statusRef)
            if (currentStatus === 'running' || currentStatus === 'starting') {
              return
            }

            // Restart monitoring
            const fiber = yield* startMonitoring(watcher.id, watcher)
            state.fiber = fiber

            yield* updateWatcherStatus(watcher.id, 'running')
          }),

        stop: (watcher: AiWatcher) =>
          Effect.gen(function* () {
            const state = watchers.get(watcher.id)
            if (!state) {
              return yield* Effect.fail(
                new WatcherNotFoundError({
                  message: `Watcher ${watcher.id} not found`,
                  watcherId: watcher.id,
                })
              )
            }

            // Interrupt monitoring fiber
            yield* Fiber.interrupt(state.fiber)

            // Kill the process
            yield* processMonitor.kill(watcher.processHandle).pipe(
              Effect.catchAll(() => Effect.void) // Ignore errors if already dead
            )

            // Update status
            yield* updateWatcherStatus(watcher.id, 'stopped')

            // Clean up queue
            yield* Queue.shutdown(state.logQueue)
          }),

        getStatus: (watcher: AiWatcher) =>
          Effect.gen(function* () {
            const state = watchers.get(watcher.id)
            if (!state) {
              return 'stopped' as AiWatcherStatus
            }

            return yield* Ref.get(state.statusRef)
          }),

        streamLogs: (watcher: AiWatcher) =>
          Stream.fromEffect(
            Effect.gen(function* () {
              const state = watchers.get(watcher.id)
              if (!state) {
                // Return empty stream if watcher not found
                return Stream.empty
              }

              // Create a stream that emits existing logs, then new logs from the queue
              const existingLogs = Stream.fromIterable(state.logs)
              const newLogs = Stream.fromQueue(state.logQueue)

              return Stream.concat(existingLogs, newLogs)
            })
          ).pipe(Stream.flatten),
      }

      return implementation
    }),
    dependencies: [TmuxSessionManager, ProcessMonitorService],
  }
) {}
