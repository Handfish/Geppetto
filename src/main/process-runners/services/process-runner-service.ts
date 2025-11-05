import * as Effect from 'effect/Effect'
import * as Stream from 'effect/Stream'
import type * as Fiber from 'effect/Fiber'
import * as Ref from 'effect/Ref'
import * as Queue from 'effect/Queue'
import * as Scope from 'effect/Scope'
import * as Exit from 'effect/Exit'
import { pipe } from 'effect/Function'
import { randomUUID } from 'node:crypto'
import type { ProcessRunnerPort } from '../ports'
import type { ProcessRunnerStatus } from '../schemas'
import { ProcessRunner, ProcessRunnerConfig, ProcessEvent, ProcessHandle, LogEntry } from '../schemas'
import {
  ProcessRunnerCreateError,
  ProcessRunnerStartError,
  ProcessRunnerStopError,
  RunnerNotFoundError,
} from '../errors'
import { NodeProcessMonitorAdapter } from '../adapters/process-monitor'
import { TmuxSessionManagerAdapter } from '../adapters/tmux-session-manager'

/**
 * Internal runner state tracked by the service
 */
interface RunnerState {
  runner: ProcessRunner
  scope: Scope.CloseableScope // Scope for the runner's lifecycle
  fiber: Fiber.RuntimeFiber<void, never> // Monitoring fiber (scoped to the runner's scope)
  logs: LogEntry[]
  logQueue: Queue.Queue<LogEntry>
  statusRef: Ref.Ref<ProcessRunnerStatus>
  lastActivityRef: Ref.Ref<Date>
}

/**
 * Maximum log entries to keep in memory per watcher
 */
const MAX_LOG_ENTRIES = 1000

/**
 * Get the command and args to run for a specific process runner type
 */
const getRunnerCommand = (
  config: ProcessRunnerConfig
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
      return { command: 'cursor-agent' } // ✅ FIXED: cursor CLI is 'cursor-agent', not 'cursor'
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
  runnerId: string
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
    runnerId,
  }
}

/**
 * ProcessRunnerService - implements ProcessRunnerPort
 *
 * Provides high-level process runner management:
 * - Creating and configuring process runners
 * - Starting and stopping runners
 * - Status tracking
 * - Log streaming with batching
 * - Integration with TmuxSessionManager and ProcessMonitor
 */
export class ProcessRunnerService extends Effect.Service<ProcessRunnerService>()(
  'ProcessRunnerService',
  {
    dependencies: [TmuxSessionManagerAdapter.Default, NodeProcessMonitorAdapter.Default],
    effect: Effect.gen(function* () {
      const tmuxManager = yield* TmuxSessionManagerAdapter
      const processMonitor = yield* NodeProcessMonitorAdapter

      // Map of runner ID to runner state
      const runners = new Map<string, RunnerState>()

      /**
       * Update runner status
       */
      const updateRunnerStatus = (
        runnerId: string,
        status: ProcessRunnerStatus
      ): Effect.Effect<void> =>
        Effect.gen(function* () {
          const state = runners.get(runnerId)
          if (!state) {
            return yield* Effect.void
          }
          yield* Ref.set(state.statusRef, status)
          state.runner = new ProcessRunner({
            ...state.runner,
            status,
          })
        })

      /**
       * Update runner last activity time
       */
      const updateLastActivity = (runnerId: string): Effect.Effect<void> =>
        Effect.gen(function* () {
          const state = runners.get(runnerId)
          if (!state) {
            return yield* Effect.void
          }
          const now = new Date()
          yield* Ref.set(state.lastActivityRef, now)
          state.runner = new ProcessRunner({
            ...state.runner,
            lastActivityAt: now,
          })
        })

      /**
       * Add a log entry to a runner
       */
      const addLogEntry = (
        runnerId: string,
        logEntry: LogEntry
      ): Effect.Effect<void> =>
        Effect.gen(function* () {
          const state = runners.get(runnerId)
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
       * Handle process events and update runner state
       */
      const handleProcessEvent = (
        runnerId: string,
        event: ProcessEvent
      ): Effect.Effect<void> =>
        Effect.gen(function* () {
          // Convert to log entry
          const logEntry = processEventToLogEntry(event, runnerId)
          yield* addLogEntry(runnerId, logEntry)

          // Update status based on event type
          switch (event.type) {
            case 'stdout':
            case 'stderr':
              yield* updateRunnerStatus(runnerId, 'running')
              yield* updateLastActivity(runnerId)
              break

            case 'silence':
              yield* updateRunnerStatus(runnerId, 'idle')
              break

            case 'error':
              yield* updateRunnerStatus(runnerId, 'errored')
              break

            case 'exit':
              yield* updateRunnerStatus(runnerId, 'stopped')
              break
          }
        })

      /**
       * Start monitoring a process for a runner within the runner's scope
       * This ensures the monitoring fiber is properly cleaned up when the runner stops
       */
      const startMonitoring = (
        runnerId: string,
        runner: ProcessRunner,
        scope: Scope.Scope
      ): Effect.Effect<Fiber.RuntimeFiber<void, never>> =>
        pipe(
          processMonitor.monitor(runner.processHandle),
          Stream.tap((event) => handleProcessEvent(runnerId, event)),
          Stream.runDrain,
          Effect.catchAll(() => Effect.void), // Catch and ignore all errors from monitoring
          Effect.forkIn(scope) // Fork into the runner's specific scope
        )

      const implementation: ProcessRunnerPort = {
        create: (config: ProcessRunnerConfig) =>
          Effect.gen(function* () {
            console.log(`[ProcessRunnerService] create() called with config:`, { type: config.type, name: config.name })

            // Normalize config into the local schema to avoid constructor parse errors
            const baseConfig =
              config instanceof ProcessRunnerConfig ? config : new ProcessRunnerConfig(config)

            const runnerId = yield* Effect.sync(() => randomUUID())
            console.log(`[ProcessRunnerService] Generated runner ID: ${runnerId}`)

            let processHandle: ProcessHandle | undefined = baseConfig.processHandle

            // Create a dedicated scope for this runner's lifecycle
            // This scope will live until the runner is explicitly stopped
            const runnerScope = yield* Scope.make()
            console.log(`[ProcessRunnerService] Created runner scope`)

            // If no process handle provided, create a new tmux session
            if (!processHandle) {
              const sessionName = `runner-${baseConfig.type}-${runnerId.slice(0, 8)}`
              const { command, args } = getRunnerCommand(baseConfig)

              console.log(`[ProcessRunnerService] Creating tmux session: ${sessionName}`)
              console.log(`[ProcessRunnerService] Command: ${command}, Args: ${JSON.stringify(args)}`)

              // Extend the createSession scope into the runner's scope
              // This ensures tmux lifecycle is bound to runner lifecycle
              processHandle = yield* Scope.extend(
                tmuxManager.createSession(
                  sessionName,
                  command,
                  args,
                  baseConfig.workingDirectory
                ).pipe(
                  Effect.mapError((error: unknown) => {
                    console.error(`[ProcessRunnerService] Failed to create tmux session:`, error)
                    return new ProcessRunnerCreateError({
                      message: `Failed to create tmux session: ${error instanceof Error ? error.message : String(error)}`,
                      config: {
                        type: baseConfig.type,
                        name: baseConfig.name,
                      },
                      cause: error,
                    })
                  })
                ),
                runnerScope
              )
              console.log(`[ProcessRunnerService] Tmux session created and scope extended`)
            }

            // At this point, processHandle must be defined
            if (!processHandle) {
              return yield* Effect.fail(
                new ProcessRunnerCreateError({
                  message: 'Failed to create or obtain process handle',
                  config: {
                    type: baseConfig.type,
                    name: baseConfig.name,
                  },
                  cause: new Error('processHandle is undefined'),
                })
              )
            }

            const runnerConfig =
              baseConfig.processHandle === processHandle
                ? baseConfig
                : new ProcessRunnerConfig({
                    ...baseConfig,
                    processHandle,
                  })

            const runner = new ProcessRunner({
              id: runnerId,
              name: runnerConfig.name ?? `${runnerConfig.type}-runner`,
              type: runnerConfig.type,
              processHandle,
              status: 'starting',
              config: runnerConfig,
              createdAt: new Date(),
              lastActivityAt: new Date(),
            })

            // Create log queue and refs
            const logQueue = yield* Queue.unbounded<LogEntry>()
            const statusRef = yield* Ref.make<ProcessRunnerStatus>('starting')
            const lastActivityRef = yield* Ref.make(new Date())

            // Start monitoring in the runner's scope
            const fiber = yield* startMonitoring(runnerId, runner, runnerScope)

            // Store runner state
            const state: RunnerState = {
              runner,
              scope: runnerScope,
              fiber,
              logs: [],
              logQueue,
              statusRef,
              lastActivityRef,
            }
            runners.set(runnerId, state)

            // Transition to running after a short delay (using forkIn to scope to runner)
            yield* Effect.forkIn(
              Effect.gen(function* () {
                yield* Effect.sleep(1000) // 1 second
                const currentStatus = yield* Ref.get(statusRef)
                if (currentStatus === 'starting') {
                  yield* updateRunnerStatus(runnerId, 'running')
                }
              }),
              runnerScope
            )

            return runner
          }),

        start: (runner: ProcessRunner) =>
          Effect.gen(function* () {
            const state = runners.get(runner.id)
            if (!state) {
              return yield* Effect.fail(
                new ProcessRunnerStartError({
                  message: `Runner ${runner.id} not found`,
                  runnerId: runner.id,
                  cause: new RunnerNotFoundError({
                    message: `Runner ${runner.id} not found`,
                    runnerId: runner.id,
                  }),
                })
              )
            }

            // If already running, do nothing
            const currentStatus = yield* Ref.get(state.statusRef)
            if (currentStatus === 'running' || currentStatus === 'starting') {
              return
            }

            // Restart monitoring in the runner's scope
            const fiber = yield* startMonitoring(runner.id, runner, state.scope)
            state.fiber = fiber

            yield* updateRunnerStatus(runner.id, 'running')
          }),

        stop: (runner: ProcessRunner) =>
          Effect.gen(function* () {
            const state = runners.get(runner.id)
            if (!state) {
              return yield* Effect.fail(
                new ProcessRunnerStopError({
                  message: `Runner ${runner.id} not found`,
                  runnerId: runner.id,
                  cause: new RunnerNotFoundError({
                    message: `Runner ${runner.id} not found`,
                    runnerId: runner.id,
                  }),
                })
              )
            }

            // Close the runner's scope - this will interrupt all fibers in that scope
            // including the monitoring fiber and any other background tasks
            yield* Scope.close(state.scope, Exit.void)

            // Kill the process
            yield* processMonitor.kill(runner.processHandle).pipe(
              Effect.catchAll(() => Effect.void) // Ignore errors if already dead
            )

            // Update status
            yield* updateRunnerStatus(runner.id, 'stopped')

            // Clean up queue
            yield* Queue.shutdown(state.logQueue)

            // Remove from runners map
            runners.delete(runner.id)
          }),

        getStatus: (runner: ProcessRunner) =>
          Effect.gen(function* () {
            const state = runners.get(runner.id)
            if (!state) {
              return 'stopped' as ProcessRunnerStatus
            }

            return yield* Ref.get(state.statusRef)
          }),

        get: (runnerId: string) =>
          Effect.gen(function* () {
            const state = runners.get(runnerId)
            if (!state) {
              return yield* Effect.fail(
                new RunnerNotFoundError({
                  message: `Runner ${runnerId} not found`,
                  runnerId,
                })
              )
            }

            return state.runner
          }),

        listAll: () =>
          Effect.gen(function* () {
            return Array.from(runners.values()).map((state) => state.runner)
          }),

        getLogs: (runnerId: string, limit?: number) =>
          Effect.gen(function* () {
            const state = runners.get(runnerId)
            if (!state) {
              return yield* Effect.fail(
                new RunnerNotFoundError({
                  message: `Runner ${runnerId} not found`,
                  runnerId,
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

        streamLogs: (runner: ProcessRunner) =>
          Stream.unwrap(
            Effect.sync(() => {
              const state = runners.get(runner.id)
              if (!state) {
                // Return empty stream if runner not found
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
