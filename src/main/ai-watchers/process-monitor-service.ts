import * as Effect from 'effect/Effect'
import * as Stream from 'effect/Stream'
import * as Queue from 'effect/Queue'
import * as Ref from 'effect/Ref'
import * as Schedule from 'effect/Schedule'
import * as Duration from 'effect/Duration'
import * as Scope from 'effect/Scope'
import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import type { ProcessMonitorPort, ProcessConfig } from './ports'
import { ProcessHandle, ProcessEvent } from './schemas'
import {
  ProcessSpawnError,
  ProcessAttachError,
  ProcessMonitorError,
  ProcessKillError,
  ProcessNotFoundError,
} from './errors'

/**
 * Internal process information tracked by the monitor
 */
interface ProcessInfo {
  handle: ProcessHandle
  child?: ChildProcess
  queue: Queue.Queue<ProcessEvent>
  lastActivityRef: Ref.Ref<number>
  isAttached: boolean
}

/**
 * Silence detection threshold - 30 seconds of no activity
 */
const SILENCE_THRESHOLD_MS = 30_000

/**
 * Activity check interval - check every 5 seconds
 */
const ACTIVITY_CHECK_INTERVAL = Duration.seconds(5)

/**
 * ProcessMonitorService - implements ProcessMonitorPort
 *
 * Provides low-level process lifecycle management:
 * - Spawning new processes
 * - Attaching to existing processes (limited - only tracks metadata)
 * - Event streaming (stdout, stderr, exit, error, silence detection)
 * - Process termination
 * - Activity tracking with automatic silence detection
 */
export class ProcessMonitorService extends Effect.Service<ProcessMonitorService>()(
  'ProcessMonitorService',
  {
    effect: Effect.gen(function* () {
      // Map of process ID to process information
      const processes = new Map<string, ProcessInfo>()

      /**
       * Mark activity for a process
       */
      const markActivity = (processId: string): Effect.Effect<void> =>
        Effect.gen(function* () {
          const info = processes.get(processId)
          if (!info) {
            return yield* Effect.void
          }
          yield* Ref.set(info.lastActivityRef, Date.now())
        })

      /**
       * Emit an event to a process's queue
       */
      const emitEvent = (
        processId: string,
        event: ProcessEvent
      ): Effect.Effect<void> =>
        Effect.gen(function* () {
          const info = processes.get(processId)
          if (!info) {
            return yield* Effect.void
          }

          yield* Queue.offer(info.queue, event).pipe(
            Effect.catchAll((error) =>
              Effect.logError(
                `Failed to emit process event for ${processId}: ${String(error)}`
              )
            )
          )
        })

      /**
       * Setup silence detection for a process within a scope
       * This creates a scoped fiber that will be cleaned up when the scope closes
       */
      const setupSilenceDetection = (
        processId: string
      ): Effect.Effect<void, never, Scope.Scope> =>
        Effect.gen(function* () {
          yield* Effect.forkScoped(
            Effect.repeat(
              Effect.gen(function* () {
                const info = processes.get(processId)
                if (!info) {
                  return yield* Effect.void // Process was removed, stop checking
                }

                const lastActivity = yield* Ref.get(info.lastActivityRef)
                const now = Date.now()
                const timeSinceActivity = now - lastActivity

                if (timeSinceActivity > SILENCE_THRESHOLD_MS) {
                  // Emit silence event
                  const silenceEvent = new ProcessEvent({
                    type: 'silence',
                    timestamp: new Date(),
                    processId,
                  })

                  yield* emitEvent(processId, silenceEvent)

                  // Reset activity time to prevent repeated silence events
                  yield* Ref.set(info.lastActivityRef, now)
                }
              }),
              Schedule.fixed(ACTIVITY_CHECK_INTERVAL)
            )
          )
        })

      /**
       * Cleanup process info
       */
      const cleanupProcess = (processId: string): Effect.Effect<void> =>
        Effect.gen(function* () {
          const info = processes.get(processId)
          if (!info) {
            return yield* Effect.void
          }
          yield* Queue.shutdown(info.queue)
          processes.delete(processId)
        })

      const implementation: ProcessMonitorPort = {
        spawn: (config: ProcessConfig) =>
          Effect.gen(function* () {
            // Generate a cryptographically secure random ID
            const processId = yield* Effect.sync(() => randomUUID())

            try {
              const child = spawn(config.command, config.args, {
                cwd: config.cwd,
                env: config.env,
                stdio: ['ignore', 'pipe', 'pipe'], // stdin ignored, stdout/stderr piped
              })

              if (!child.pid) {
                return yield* Effect.fail(
                  new ProcessSpawnError({
                    message: `Failed to spawn process: no PID assigned`,
                    command: config.command,
                    args: config.args,
                  })
                )
              }

              const handle = new ProcessHandle({
                id: processId,
                pid: child.pid,
                type: 'spawned',
                startedAt: new Date(),
              })

              // Create queue for events
              const queue = yield* Queue.unbounded<ProcessEvent>()

              // Create activity ref
              const lastActivityRef = yield* Ref.make(Date.now())

              // Store process info
              const processInfo: ProcessInfo = {
                handle,
                child,
                queue,
                lastActivityRef,
                isAttached: false,
              }
              processes.set(processId, processInfo)

              // Setup event listeners
              if (child.stdout) {
                child.stdout.setEncoding('utf8')
                child.stdout.on('data', (chunk: string) => {
                  Effect.runFork(
                    Effect.gen(function* () {
                      yield* markActivity(processId)
                      const event = new ProcessEvent({
                        type: 'stdout',
                        data: chunk,
                        timestamp: new Date(),
                        processId,
                      })
                      yield* emitEvent(processId, event)
                    })
                  )
                })
              }

              if (child.stderr) {
                child.stderr.setEncoding('utf8')
                child.stderr.on('data', (chunk: string) => {
                  Effect.runFork(
                    Effect.gen(function* () {
                      yield* markActivity(processId)
                      const event = new ProcessEvent({
                        type: 'stderr',
                        data: chunk,
                        timestamp: new Date(),
                        processId,
                      })
                      yield* emitEvent(processId, event)
                    })
                  )
                })
              }

              child.on('error', (error: Error) => {
                Effect.runFork(
                  Effect.gen(function* () {
                    const event = new ProcessEvent({
                      type: 'error',
                      data: error.message,
                      timestamp: new Date(),
                      processId,
                    })
                    yield* emitEvent(processId, event)
                    yield* cleanupProcess(processId)
                  })
                )
              })

              child.on('exit', (code: number | null, signal: string | null) => {
                Effect.runFork(
                  Effect.gen(function* () {
                    const exitData = `code=${code ?? 'null'} signal=${signal ?? 'none'}`
                    const event = new ProcessEvent({
                      type: 'exit',
                      data: exitData,
                      timestamp: new Date(),
                      processId,
                    })
                    yield* emitEvent(processId, event)
                    yield* cleanupProcess(processId)
                  })
                )
              })

              // Silence detection will be started when monitor() is called
              // It will be scoped to the monitoring stream

              return handle
            } catch (error) {
              return yield* Effect.fail(
                new ProcessSpawnError({
                  message: `Failed to spawn process: ${error instanceof Error ? error.message : String(error)}`,
                  command: config.command,
                  args: config.args,
                  cause: error,
                })
              )
            }
          }),

        attach: (pid: number) =>
          Effect.gen(function* () {
            // Generate a cryptographically secure random ID
            const processId = yield* Effect.sync(() => randomUUID())

            // Note: We can't truly "attach" to an existing process's stdout/stderr
            // This creates a handle for tracking, but won't receive live output
            // For tmux sessions, we'll rely on tmux's capture-pane instead

            const handle = new ProcessHandle({
              id: processId,
              pid,
              type: 'attached',
              startedAt: new Date(),
            })

            // Create queue for events (though it won't receive much)
            const queue = yield* Queue.unbounded<ProcessEvent>()
            const lastActivityRef = yield* Ref.make(Date.now())

            const processInfo: ProcessInfo = {
              handle,
              queue,
              lastActivityRef,
              isAttached: true,
            }
            processes.set(processId, processInfo)

            // Silence detection will be started when monitor() is called
            return handle
          }),

        monitor: (handle: ProcessHandle) =>
          Stream.unwrapScoped(
            Effect.gen(function* () {
              const info = processes.get(handle.id)
              if (!info) {
                return yield* Effect.fail(
                  new ProcessMonitorError({
                    message: `Process ${handle.id} not found`,
                    processId: handle.id,
                    cause: new ProcessNotFoundError({
                      message: `Process ${handle.id} not found`,
                      processId: handle.id,
                    }),
                  })
                )
              }

              // Start silence detection as a scoped fiber
              // It will be automatically interrupted when the stream scope closes
              yield* setupSilenceDetection(handle.id)

              return Stream.fromQueue(info.queue)
            })
          ),

        kill: (handle: ProcessHandle) =>
          Effect.gen(function* () {
            const info = processes.get(handle.id)
            if (!info) {
              return yield* Effect.fail(
                new ProcessKillError({
                  message: `Process ${handle.id} not found`,
                  processId: handle.id,
                  pid: handle.pid,
                  cause: new ProcessNotFoundError({
                    message: `Process ${handle.id} not found`,
                    processId: handle.id,
                  }),
                })
              )
            }

            if (info.child && !info.child.killed) {
              // Try graceful termination first
              info.child.kill('SIGTERM')

              // Wait a bit, then force kill if needed
              yield* Effect.sleep(Duration.seconds(5))

              if (info.child && !info.child.killed) {
                info.child.kill('SIGKILL')
              }
            } else if (info.isAttached) {
              // For attached processes, use kill command
              yield* Effect.tryPromise({
                try: async () => {
                  const { exec } = await import('node:child_process')
                  const { promisify } = await import('node:util')
                  const execAsync = promisify(exec)
                  await execAsync(`kill -TERM ${handle.pid}`)
                },
                catch: (error) =>
                  new ProcessKillError({
                    message: `Failed to kill attached process: ${error instanceof Error ? error.message : String(error)}`,
                    processId: handle.id,
                    pid: handle.pid,
                    cause: error,
                  }),
              })
            }

            yield* cleanupProcess(handle.id)
          }),
      }

      return implementation
    }),
  }
) {}
