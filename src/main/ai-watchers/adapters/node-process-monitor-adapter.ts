import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import * as Stream from 'effect/Stream'
import * as Queue from 'effect/Queue'
import * as Ref from 'effect/Ref'
import * as Schedule from 'effect/Schedule'
import * as Duration from 'effect/Duration'
import * as Scope from 'effect/Scope'
import * as Exit from 'effect/Exit'
import { Path } from '@effect/platform'
import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { promises as FsPromises } from 'node:fs'
import * as Fs from 'node:fs'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { exec } from 'node:child_process'
import type { ProcessMonitorPort, ProcessConfig } from '../ports'
import { ProcessHandle, ProcessEvent, TmuxPipeConfig } from '../schemas'
import {
  ProcessSpawnError,
  ProcessAttachError,
  ProcessMonitorError,
  ProcessKillError,
  ProcessNotFoundError,
} from '../errors'
import { TmuxControlClient } from './tmux-control-client-adapter'

const execAsync = promisify(exec)

/**
 * Internal process information tracked by the monitor
 */
interface ProcessInfo {
  handle: ProcessHandle
  child?: ChildProcess
  queue: Queue.Queue<ProcessEvent>
  lastActivityRef: Ref.Ref<number>
  isAttached: boolean
  tmuxPipeRef: Ref.Ref<TmuxPipeConfig | null>
  tmuxPipeFiberRef: Ref.Ref<Fiber.RuntimeFiber<void, never> | null>
  tmuxPipeScopeRef: Ref.Ref<Scope.CloseableScope | null>
}

/**
 * Silence detection threshold - 4 seconds of no activity
 */
const SILENCE_THRESHOLD_MS = 4_000

/**
 * Activity check interval - check every 5 seconds
 */
const ACTIVITY_CHECK_INTERVAL = Duration.seconds(5)

/**
 * NodeProcessMonitorAdapter - Node.js implementation of ProcessMonitorPort
 *
 * HEXAGONAL ARCHITECTURE: This is an ADAPTER implementing ProcessMonitorPort.
 * It can be replaced with other implementations (Docker, SSH, etc.) for testing or different environments.
 *
 * Provides low-level process lifecycle management:
 * - Spawning new processes using Node.js child_process
 * - Attaching to existing processes (limited - only tracks metadata)
 * - Event streaming (stdout, stderr, exit, error, silence detection)
 * - Process termination
 * - Activity tracking with automatic silence detection
 */
export class NodeProcessMonitorAdapter extends Effect.Service<NodeProcessMonitorAdapter>()(
  'NodeProcessMonitorAdapter',
  {
    dependencies: [
      Path.layer,
    ],
    effect: Effect.gen(function* () {
      // Inject Path service from @effect/platform
      const path = yield* Path.Path

      // Map of process ID to process information
      const processes = new Map<string, ProcessInfo>()

      // Mutex to serialize FIFO opening (prevents cross-contamination when multiple watchers start)
      // Uses a bounded queue with size 1 as a simple mutex: take() = acquire, offer() = release
      const fifoOpenMutex = yield* Queue.bounded<void>(1)
      yield* Queue.offer(fifoOpenMutex, undefined) // Initialize with one permit

      /**
       * Mark activity for a process
       */
      const markActivity = (processId: string): Effect.Effect<void> =>
        Effect.gen(function* () {
          const info = processes.get(processId)
          if (!info) {
            console.log(`[${processId.slice(0, 8)}] markActivity called but process not found!`)
            return yield* Effect.void
          }
          console.log(`[${processId.slice(0, 8)}] markActivity called`)
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
            console.log(`[${processId.slice(0, 8)}] emitEvent called but process not found!`)
            return yield* Effect.void
          }

          console.log(`[${processId.slice(0, 8)}] emitEvent called, type=${event.type}, dataLength=${event.data?.length ?? 0}`)
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
       * Quote string for safe shell usage
       */
      const quoteForShell = (value: string): string =>
        `'${value.replace(/'/g, `'\\''`)}'`

      /**
       * Execute tmux command (void result)
       * Uses Effect.async for proper structured concurrency
       */
      const runTmuxCommandVoid = (
        args: string[],
        processId: string,
        description: string
      ): Effect.Effect<void, ProcessMonitorError> =>
        Effect.async<void, ProcessMonitorError>((resume) => {
          const child = spawn('tmux', args, {
            stdio: ['ignore', 'ignore', 'pipe'],
          })

          let stderr = ''
          child.stderr?.on('data', (chunk: Buffer) => {
            stderr += chunk.toString()
          })

          child.on('error', (error: Error) => {
            resume(
              Effect.fail(
                new ProcessMonitorError({
                  message: `${description}: ${error.message}`,
                  processId,
                  cause: error,
                })
              )
            )
          })

          child.on('exit', (code: number | null) => {
            if (code === 0 || code === null) {
              resume(Effect.void)
            } else {
              const details = stderr.trim()
              resume(
                Effect.fail(
                  new ProcessMonitorError({
                    message: `${description}: exited with code ${code}${details ? ` (${details})` : ''}`,
                    processId,
                  })
                )
              )
            }
          })

          return Effect.sync(() => {
            if (child.exitCode === null && !child.killed) {
              child.kill('SIGKILL')
            }
          })
        })

      /**
       * Execute tmux command and capture output
       */
      const runTmuxCommandCapture = (
        args: string[],
        processId: string,
        description: string
      ): Effect.Effect<string, ProcessMonitorError> =>
        Effect.async<string, ProcessMonitorError>((resume) => {
          const child = spawn('tmux', args, {
            stdio: ['ignore', 'pipe', 'pipe'],
          })

          let stdout = ''
          let stderr = ''
          child.stdout?.on('data', (chunk: Buffer) => {
            stdout += chunk.toString()
          })
          child.stderr?.on('data', (chunk: Buffer) => {
            stderr += chunk.toString()
          })

          child.on('error', (error: Error) => {
            resume(
              Effect.fail(
                new ProcessMonitorError({
                  message: `${description}: ${error.message}`,
                  processId,
                  cause: error,
                })
              )
            )
          })

          child.on('exit', (code: number | null) => {
            if (code === 0 || code === null) {
              resume(Effect.succeed(stdout))
            } else {
              const details = stderr.trim()
              resume(
                Effect.fail(
                  new ProcessMonitorError({
                    message: `${description}: exited with code ${code}${details ? ` (${details})` : ''}`,
                    processId,
                  })
                )
              )
            }
          })

          return Effect.sync(() => {
            if (child.exitCode === null && !child.killed) {
              child.kill('SIGKILL')
            }
          })
        })

      /**
       * Create a FIFO pipe stream
       * Returns a Stream that emits chunks from the FIFO
       */
      const createFifoStream = (
        fifoPath: string,
        processId: string
      ): Stream.Stream<string, ProcessMonitorError, Scope.Scope> =>
        Stream.asyncScoped<string, ProcessMonitorError>((emit) =>
          Effect.gen(function* () {
            // Open FIFO in blocking mode
            // This will block until a writer connects, which is fine because
            // we call this AFTER the tmux writer has been started
            const readStream = yield* Effect.try({
              try: () =>
                Fs.createReadStream(fifoPath, {
                  encoding: 'utf8',
                  flags: 'r',
                }),
              catch: (error) =>
                new ProcessMonitorError({
                  message: 'Failed to open FIFO for tmux pipe',
                  processId,
                  cause: error,
                }),
            })

            // Register event handlers
            readStream.on('data', (chunk: string | Buffer) => {
              const data = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
              emit.single(data)
            })

            readStream.on('error', (error: Error) => {
              emit.fail(
                new ProcessMonitorError({
                  message: `FIFO read error: ${error.message}`,
                  processId,
                  cause: error,
                })
              )
            })

            readStream.on('end', () => {
              emit.end()
            })

            // Return cleanup effect
            return Effect.sync(() => {
              readStream.removeAllListeners()
              readStream.destroy()
            })
          })
        )

      /**
       * Cleanup tmux pipe resources
       */
      const cleanupTmuxPipe = (
        config: TmuxPipeConfig,
        processId: string
      ): Effect.Effect<void> =>
        Effect.gen(function* () {
          // Stop tmux pipe (best effort)
          yield* runTmuxCommandVoid(
            ['pipe-pane', '-t', config.targetPane],
            processId,
            `Failed to stop tmux pipe for ${config.targetPane}`
          ).pipe(Effect.catchAll(() => Effect.void))

          // Remove temp directory (best effort)
          yield* Effect.tryPromise({
            try: () =>
              FsPromises.rm(config.tempDir, {
                recursive: true,
                force: true,
              }),
            catch: () => undefined,
          }).pipe(Effect.catchAll(() => Effect.void))
        })

      /**
       * Setup tmux pipe streaming in a scoped manner
       * The stream fiber is tied to the current scope and will be cleaned up automatically
       *
       * CRITICAL: Uses mutex to serialize FIFO opening (prevents cross-contamination)
       */
      const setupTmuxPipeStream = (
        handle: ProcessHandle,
        config: TmuxPipeConfig
      ): Effect.Effect<Fiber.RuntimeFiber<void, never>, never, Scope.Scope> =>
        Effect.gen(function* () {
          // Acquire mutex (blocks until permit available)
          yield* Effect.logDebug(
            `[${handle.id.slice(0, 8)}] Waiting to acquire FIFO mutex...`
          )
          yield* Queue.take(fifoOpenMutex)
          yield* Effect.logDebug(
            `[${handle.id.slice(0, 8)}] Acquired FIFO mutex, opening ${config.fifoPath}`
          )

          // Ensure mutex is released even on error
          const result = yield* Effect.gen(function* () {
            // Open the FIFO synchronously BEFORE releasing the mutex
            // Stream.asyncScoped is lazy, so we need to force the open
            const readStream = yield* Effect.try({
              try: () => {
                const stream = Fs.createReadStream(config.fifoPath, {
                  encoding: 'utf8',
                  flags: 'r',
                  highWaterMark: 64, // Small buffer (64 bytes) for more responsive reads
                })
                console.log(`[${handle.id.slice(0, 8)}] FIFO opened: ${config.fifoPath}`)
                return stream
              },
              catch: (error) =>
                new ProcessMonitorError({
                  message: 'Failed to open FIFO for tmux pipe',
                  processId: handle.id,
                  cause: error,
                }),
            })

            // Now create the stream using the already-opened readStream
            const fifoStream = Stream.asyncScoped<string, ProcessMonitorError>((emit) =>
              Effect.sync(() => {
                // Register event handlers
                readStream.on('data', (chunk: string | Buffer) => {
                  const data = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
                  console.log(`[${handle.id.slice(0, 8)}] FIFO data received: ${data.length} bytes`)
                  emit.single(data)
                })

                readStream.on('error', (error: Error) => {
                  console.log(`[${handle.id.slice(0, 8)}] FIFO error: ${error.message}`)
                  emit.fail(
                    new ProcessMonitorError({
                      message: `FIFO read error: ${error.message}`,
                      processId: handle.id,
                      cause: error,
                    })
                  )
                })

                readStream.on('end', () => {
                  console.log(`[${handle.id.slice(0, 8)}] FIFO stream ended`)
                  emit.end()
                })

                console.log(`[${handle.id.slice(0, 8)}] FIFO event handlers registered`)
                // Return cleanup effect
                return Effect.sync(() => {
                  readStream.removeAllListeners()
                  readStream.destroy()
                })
              })
            )

            // Fork scoped fiber to process the stream
            const fiber = yield* Effect.forkScoped(
              fifoStream.pipe(
                Stream.tap((chunk: string) =>
                  Effect.gen(function* () {
                    yield* markActivity(handle.id)
                    const event = new ProcessEvent({
                      type: 'stdout',
                      data: chunk,
                      timestamp: new Date(),
                      processId: handle.id,
                    })
                    yield* emitEvent(handle.id, event)
                  })
                ),
                Stream.runDrain
              )
            )

            yield* Effect.logDebug(
              `[${handle.id.slice(0, 8)}] FIFO stream fiber forked, releasing mutex`
            )
            console.log(`[${handle.id.slice(0, 8)}] Releasing FIFO mutex`)

            return fiber
          }).pipe(
            Effect.ensuring(
              Effect.sync(() => {
                console.log(`[${handle.id.slice(0, 8)}] FIFO mutex released`)
              }).pipe(Effect.zipRight(Queue.offer(fifoOpenMutex, undefined)))
            )
          )

          return result
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

          // Close tmux pipe scope if active (this interrupts all scoped fibers)
          const tmuxPipeScope = yield* Ref.get(info.tmuxPipeScopeRef)
          if (tmuxPipeScope) {
            yield* Scope.close(tmuxPipeScope, Exit.void).pipe(
              Effect.catchAll(() => Effect.void)
            )
            yield* Ref.set(info.tmuxPipeScopeRef, null)
          }

          // Cleanup tmux pipe if active
          const tmuxPipe = yield* Ref.get(info.tmuxPipeRef)
          if (tmuxPipe) {
            yield* cleanupTmuxPipe(tmuxPipe, processId)
            yield* Ref.set(info.tmuxPipeRef, null)
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

              // Create tmux pipe refs
              const tmuxPipeRef = yield* Ref.make<TmuxPipeConfig | null>(null)
              const tmuxPipeFiberRef = yield* Ref.make<Fiber.RuntimeFiber<void, never> | null>(null)
              const tmuxPipeScopeRef = yield* Ref.make<Scope.CloseableScope | null>(null)

              // Store process info
              const processInfo: ProcessInfo = {
                handle,
                child,
                queue,
                lastActivityRef,
                isAttached: false,
                tmuxPipeRef,
                tmuxPipeFiberRef,
                tmuxPipeScopeRef,
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
            const tmuxPipeRef = yield* Ref.make<TmuxPipeConfig | null>(null)
            const tmuxPipeFiberRef = yield* Ref.make<Fiber.RuntimeFiber<void, never> | null>(null)
            const tmuxPipeScopeRef = yield* Ref.make<Scope.CloseableScope | null>(null)

            const processInfo: ProcessInfo = {
              handle,
              queue,
              lastActivityRef,
              isAttached: true,
              tmuxPipeRef,
              tmuxPipeFiberRef,
              tmuxPipeScopeRef,
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
              // Exit event will be emitted by child process listener
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
              }).pipe(
                // Ignore "No such process" errors - process already dead
                Effect.catchAll((error) => {
                  if (error.cause && String(error.cause).includes('No such process')) {
                    return Effect.void
                  }
                  return Effect.fail(error)
                })
              )

              // For attached processes, manually emit exit event
              // (spawned processes emit this via child process listener)
              const exitEvent = new ProcessEvent({
                type: 'exit',
                data: 'killed',
                timestamp: new Date(),
                processId: handle.id,
              })
              yield* emitEvent(handle.id, exitEvent)
            }

            yield* cleanupProcess(handle.id)
          }),

        pipeTmuxSession: (handle: ProcessHandle, targetPane: string) =>
          Effect.gen(function* () {
            console.log(`[NodeProcessMonitorAdapter] pipeTmuxSession called for handle=${handle.id}, targetPane="${targetPane}"`)

            const info = processes.get(handle.id)
            if (!info) {
              console.log(`[NodeProcessMonitorAdapter] Process ${handle.id} not found in registry`)
              return yield* Effect.fail(
                new ProcessMonitorError({
                  message: `Process ${handle.id} not found`,
                  processId: handle.id,
                })
              )
            }

            console.log(`[NodeProcessMonitorAdapter] Found process ${handle.id} in registry, setting up control mode`)

            // Check if already piping this pane
            const currentPipe = yield* Ref.get(info.tmuxPipeRef)
            if (currentPipe && currentPipe.targetPane === targetPane) {
              return yield* Effect.void
            }

            // Interrupt existing fiber if any
            const currentFiber = yield* Ref.get(info.tmuxPipeFiberRef)
            if (currentFiber) {
              yield* Fiber.interrupt(currentFiber).pipe(
                Effect.catchAll(() => Effect.void)
              )
              yield* Ref.set(info.tmuxPipeFiberRef, null)
            }

            // Cleanup existing pipe if any
            if (currentPipe) {
              yield* cleanupTmuxPipe(currentPipe, handle.id)
              yield* Ref.set(info.tmuxPipeRef, null)
            }

            // Extract session name and pane ID from target
            // Format can be "session:paneId" or just "session" (legacy)
            const colonIndex = targetPane.indexOf(':')
            let sessionName: string
            let targetPaneId: string | null = null

            if (colonIndex > -1) {
              sessionName = targetPane.substring(0, colonIndex)
              targetPaneId = targetPane.substring(colonIndex + 1)
            } else {
              sessionName = targetPane
            }

            yield* Effect.logDebug(
              `[${handle.id.slice(0, 8)}] Extracted session="${sessionName}", paneId="${targetPaneId}"`
            )

            // TRY PTY-BASED CONTROL MODE FIRST - provides real-time activity detection
            // Uses node-pty to create proper PTY for tmux -CC
            yield* Effect.logInfo(
              `[${handle.id.slice(0, 8)}] Attempting PTY-based control mode for session: ${sessionName}`
            )

            // Try to spawn control mode with PTY, fall back to pipe-pane if it fails
            const controlModeResult = yield* Effect.either(
              TmuxControlClient.spawnWithPty(sessionName, targetPaneId).pipe(
                Effect.tap((controlClient) =>
                  Effect.sync(() => {
                    console.log(`[${handle.id.slice(0, 8)}] Control mode spawned successfully`)
                  })
                )
              )
            )

            if (controlModeResult._tag === 'Right') {
              const controlClient = controlModeResult.right

              // Create event stream from PTY-based control client
              const eventStream = TmuxControlClient.createEventStream(controlClient)

              // Create a scope for the control mode stream
              const controlScope = yield* Scope.make()
              yield* Ref.set(info.tmuxPipeScopeRef, controlScope)

              // Fork the event stream processor in background
              yield* Effect.logInfo(
                `[${handle.id.slice(0, 8)}] Forking control mode event stream for session: ${sessionName}`
              )
              yield* Effect.forkIn(
                eventStream.pipe(
                  Stream.tap((event) =>
                    Effect.gen(function* () {
                      console.log(
                        `[${handle.id.slice(0, 8)}] Event from control mode: type=${event.type}, paneId=${event.processId}`
                      )
                      yield* Effect.logDebug(
                        `[${handle.id.slice(0, 8)}] Event received: type=${event.type}, paneId=${event.processId}`
                      )

                      // Mark activity immediately on output event
                      if (event.type === 'stdout') {
                        yield* markActivity(handle.id)
                      }

                      // Map the event's processId (pane ID) back to the watcher's handle ID
                      const mappedEvent = event
                      ;(mappedEvent as any).processId = handle.id
                      yield* emitEvent(handle.id, mappedEvent)
                    })
                  ),
                  Stream.runDrain
                ).pipe(
                  Effect.catchAll((error) =>
                    Effect.gen(function* () {
                      console.error(
                        `[${handle.id.slice(0, 8)}] Stream error: ${String(error)}`
                      )
                      yield* Effect.logError(
                        `[${handle.id.slice(0, 8)}] Control mode stream error: ${String(error)}`
                      )
                    })
                  )
                ),
                controlScope
              )

              yield* Effect.logInfo(
                `[${handle.id.slice(0, 8)}] PTY-based control mode ACTIVE for session: ${sessionName}`
              )

              return yield* Effect.void
            } else {
              // Control mode failed - log error
              const error = controlModeResult.left
              console.error(
                `[${handle.id.slice(0, 8)}] Control mode FAILED: ${error.message}`
              )
              yield* Effect.logError(
                `[${handle.id.slice(0, 8)}] PTY-based control mode failed: ${error.message}`
              )
              // For now, treat this as a fatal error rather than falling back
              return yield* Effect.fail(error)
            }

            // FALLBACK: If control mode fails, use pipe-pane + FIFO (legacy method)
            yield* Effect.logInfo(
              `[${handle.id.slice(0, 8)}] Setting up tmux pipe-pane monitoring for ${targetPane}`
            )

            // Create temp directory for FIFO
            const tempDir = yield* Effect.tryPromise({
              try: () => FsPromises.mkdtemp(path.join(tmpdir(), 'tmux-pipe-')),
              catch: (error) =>
                new ProcessMonitorError({
                  message: 'Failed to create temp directory for tmux pipe',
                  processId: handle.id,
                  cause: error,
                }),
            })

            const fifoPath = path.join(tempDir, 'pane.fifo')

            // Create FIFO
            yield* Effect.tryPromise({
              try: () => execAsync(`mkfifo ${quoteForShell(fifoPath)}`),
              catch: (error) =>
                new ProcessMonitorError({
                  message: 'Failed to create FIFO for tmux pipe',
                  processId: handle.id,
                  cause: error,
                }),
            })

            // Create pipe config
            const pipeConfig = new TmuxPipeConfig({
              targetPane,
              fifoPath,
              tempDir,
            })

            // Clear existing pipe configuration (best effort)
            yield* runTmuxCommandVoid(
              ['pipe-pane', '-t', targetPane],
              handle.id,
              `Failed to reset tmux pipe for ${targetPane}`
            ).pipe(Effect.catchAll(() => Effect.void))

            // Capture existing pane output (best effort)
            const captured = yield* runTmuxCommandCapture(
              ['capture-pane', '-pt', targetPane, '-S', '-200'],
              handle.id,
              `Failed to capture tmux pane ${targetPane}`
            ).pipe(Effect.catchAll(() => Effect.succeed('')))

            // Start tmux pipe (writer) FIRST
            // This must happen before we open the FIFO reader, otherwise the blocking open() will deadlock
            console.log(`[${handle.id.slice(0, 8)}] Starting tmux pipe-pane writer for ${targetPane}`)
            yield* runTmuxCommandVoid(
              ['pipe-pane', '-t', targetPane, `dd bs=1 of=${quoteForShell(fifoPath)} 2>/dev/null`],
              handle.id,
              `Failed to start tmux pipe for ${targetPane}`
            ).pipe(
              Effect.catchAll((error) =>
                cleanupTmuxPipe(pipeConfig, handle.id).pipe(
                  Effect.zipRight(Effect.fail(error))
                )
              )
            )
            console.log(`[${handle.id.slice(0, 8)}] Tmux pipe-pane writer started`)

            // Store pipe config
            yield* Ref.set(info.tmuxPipeRef, pipeConfig)

            // Emit captured output if any (for display only - doesn't mark activity)
            // Captured output is historical data, not new activity
            if (captured) {
              console.log(
                `[${handle.id.slice(0, 8)}] Emitting ${captured.split('\n').length} lines of captured output`
              )
              const lines = captured.replace(/\r/g, '').split('\n')
              for (const line of lines) {
                if (!line) continue
                // Don't call markActivity() - captured output is not new activity
                const event = new ProcessEvent({
                  type: 'stdout',
                  data: line + '\n',
                  timestamp: new Date(),
                  processId: handle.id,
                })
                yield* emitEvent(handle.id, event)
              }
            }

            // Create a dedicated scope for the tmux pipe stream
            const pipeScope = yield* Scope.make()
            yield* Ref.set(info.tmuxPipeScopeRef, pipeScope)

            // Setup the FIFO reader stream AFTER the writer is connected
            console.log(`[${handle.id.slice(0, 8)}] Forking FIFO reader setup`)
            yield* Effect.forkIn(
              setupTmuxPipeStream(handle, pipeConfig),
              pipeScope
            )
            console.log(`[${handle.id.slice(0, 8)}] FIFO reader setup forked, pipeTmuxSession returning`)
          }),
      }

      return implementation
    }),
  }
) {}
