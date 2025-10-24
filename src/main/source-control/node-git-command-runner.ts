import {
  Cause,
  Deferred,
  Duration,
  Effect,
  Queue,
  Schedule,
  Schema as S,
  Stream,
} from 'effect'
import { spawn, type ChildProcess } from 'node:child_process'
import type {
  GitCommandExecutionHandle,
  GitCommandRunnerPort,
} from './ports'
import {
  GitCommandEvent,
  GitCommandRequest,
  GitCommandResult,
} from '../../shared/schemas/source-control'
import {
  GitCommandFailedError,
  GitCommandSpawnError,
  GitCommandTimeoutError,
  GitExecutableUnavailableError,
  type GitCommandDomainError,
} from '../../shared/schemas/source-control/errors'

/**
 * Node.js implementation of the GitCommandRunnerPort.
 * Wraps child_process.spawn with Effect primitives for structured concurrency.
 */
export class NodeGitCommandRunner extends Effect.Service<NodeGitCommandRunner>()(
  'NodeGitCommandRunner',
  {
    effect: Effect.sync(() => {
      const runner: GitCommandRunnerPort = {
        execute: (request: GitCommandRequest) =>
          Effect.gen(function* () {
              const handleDeferred = yield* Deferred.make<
                GitCommandExecutionHandle,
                GitCommandDomainError
              >()

              yield* Effect.forkScoped(
                Effect.catchAll(
                  Effect.gen(function* () {
                    const normalisedRequest = yield* S.decodeUnknown(
                      GitCommandRequest
                    )(request)

                    const {
                      id,
                      binary,
                      args,
                      worktree,
                      environment,
                      allowInteractive,
                      stdio,
                      timeoutMs,
                    } = normalisedRequest

                    const mergedEnv = {
                      ...process.env,
                      ...Object.fromEntries(
                        (environment ?? []).map(variable => [
                          variable.name,
                          variable.value,
                        ])
                      ),
                    }

                    const queue = yield* Effect.acquireRelease(
                      Queue.unbounded<GitCommandEvent>(),
                      queue => queue.shutdown
                    )

                    const resultDeferred = yield* Deferred.make<
                      GitCommandResult,
                      GitCommandDomainError
                    >()

                    const emit = (event: GitCommandEvent) => {
                      Effect.runFork(
                        queue.offer(event).pipe(
                          Effect.catchAllCause(cause =>
                            Effect.logError(
                              `Failed to emit git command event: ${Cause.pretty(
                                cause
                              )}`
                            ).pipe(Effect.zipRight(queue.shutdown))
                          )
                        )
                      )
                    }

                    let stdoutBuffer = ''
                    let stderrBuffer = ''
                    let completed = false
                    let terminatedByUser = false
                    const startedAt = new Date()

                    const markCompleted = (): boolean => {
                      if (completed) return false
                      completed = true
                      return true
                    }

                    const completeSuccess = (result: GitCommandResult) => {
                      if (!markCompleted()) return
                      console.log('[GitCommandRunner] About to complete deferred with result')

                      Effect.runFork(
                        Deferred.succeed(resultDeferred, result).pipe(
                          Effect.tap(() => Effect.sync(() => console.log('[GitCommandRunner] Deferred succeeded'))),
                          Effect.zipRight(queue.shutdown),
                          Effect.tap(() => Effect.sync(() => console.log('[GitCommandRunner] Queue shut down')))
                        )
                      )
                      console.log('[GitCommandRunner] Effect.runFork returned')
                    }

                    const completeFailure = (
                      error: GitCommandDomainError
                    ) => {
                      if (!markCompleted()) return

                      Effect.runFork(
                        Deferred.fail(resultDeferred, error).pipe(
                          Effect.zipRight(queue.shutdown)
                        )
                      )
                    }

                    const child = yield* Effect.acquireRelease(
                      Effect.try({
                        try: () =>
                          spawn(binary ?? 'git', args, {
                            cwd: worktree.repositoryPath,
                            env: mergedEnv,
                            stdio: allowInteractive ? 'inherit' : stdio,
                          }),
                        catch: (error: unknown) => {
                          const nodeError = error as NodeJS.ErrnoException
                          const executableName = binary ?? 'git'
                          if (nodeError?.code === 'ENOENT') {
                            return new GitExecutableUnavailableError({
                              binary: executableName,
                              message: `Executable "${executableName}" was not found in PATH`,
                            })
                          }

                          return new GitCommandSpawnError({
                            commandId: id,
                            message: `Failed to spawn ${executableName}`,
                            cause:
                              error instanceof Error
                                ? error.message
                                : String(error),
                          })
                        },
                      }),
                      (child: ChildProcess) =>
                        Effect.sync(() => {
                          child.removeAllListeners()
                          if (!child.killed) {
                            child.kill('SIGTERM')
                          }
                        })
                    )

                    if (child.stdout) {
                      child.stdout.setEncoding('utf8')
                      child.stdout.on('data', (chunk: string) => {
                        stdoutBuffer += chunk
                        emit({
                          _tag: 'StdoutChunk',
                          commandId: id,
                          data: chunk,
                          timestamp: new Date(),
                        })
                      })
                    }

                    if (child.stderr) {
                      child.stderr.setEncoding('utf8')
                      child.stderr.on('data', (chunk: string) => {
                        stderrBuffer += chunk
                        emit({
                          _tag: 'StderrChunk',
                          commandId: id,
                          data: chunk,
                          timestamp: new Date(),
                        })
                      })
                    }

                    child.once('error', error => {
                      emit({
                        _tag: 'Failed',
                        commandId: id,
                        error: {
                          message: 'Process error',
                          cause:
                            error instanceof Error
                              ? error.message
                              : String(error),
                        },
                        failedAt: new Date(),
                      })

                      completeFailure(
                        new GitCommandSpawnError({
                          commandId: id,
                          message: `Process error for ${binary ?? 'git'}`,
                          cause:
                            error instanceof Error
                              ? error.message
                              : String(error),
                        })
                      )
                    })

                    child.once('exit', (code, signal) => {
                      console.log(`[GitCommandRunner] Process exited - code: ${code}, signal: ${signal}`)
                      const endedAt = new Date()
                      const exitEvent = {
                        _tag: 'Exited' as const,
                        commandId: id,
                        exitCode: typeof code === 'number' ? code : -1,
                        endedAt,
                      }

                      emit(exitEvent)

                      // Check if already completed but don't mark as completed yet
                      // Let completeSuccess/completeFailure handle that
                      if (completed) {
                        console.log(`[GitCommandRunner] Already completed, skipping`)
                        return
                      }

                      const durationMs = endedAt.getTime() - startedAt.getTime()
                      console.log(`[GitCommandRunner] Duration: ${durationMs}ms, completing...`)

                      if (signal || terminatedByUser) {
                        const result = new GitCommandResult({
                          commandId: id,
                          exitCode: code ?? undefined,
                          status: 'cancelled',
                          startedAt,
                          completedAt: endedAt,
                          durationMs,
                          stdout: stdoutBuffer || undefined,
                          stderr: stderrBuffer || undefined,
                        })

                        completeSuccess(result)
                        return
                      }

                      if (code === 0) {
                        console.log(`[GitCommandRunner] Success - calling completeSuccess`)
                        const result = new GitCommandResult({
                          commandId: id,
                          exitCode: 0,
                          status: 'success',
                          startedAt,
                          completedAt: endedAt,
                          durationMs,
                          stdout: stdoutBuffer || undefined,
                          stderr: stderrBuffer || undefined,
                        })

                        completeSuccess(result)
                        console.log(`[GitCommandRunner] completeSuccess called`)
                        return
                      }

                      emit({
                        _tag: 'Failed',
                        commandId: id,
                        error: {
                          message: `Git exited with code ${code ?? 'unknown'}`,
                          cause: stderrBuffer || undefined,
                        },
                        failedAt: endedAt,
                      })

                      completeFailure(
                        new GitCommandFailedError({
                          commandId: id,
                          exitCode: code ?? -1,
                          stdout: stdoutBuffer || undefined,
                          stderr: stderrBuffer || undefined,
                          message: `Git exited with code ${code ?? 'unknown'}`,
                        })
                      )
                    })

                    if (typeof timeoutMs === 'number' && timeoutMs > 0) {
                      yield* Effect.forkScoped(
                        Effect.sleep(Duration.millis(timeoutMs)).pipe(
                          Effect.flatMap(() =>
                            Effect.sync(() => {
                              if (completed) {
                                return
                              }

                              const timeoutError =
                                new GitCommandTimeoutError({
                                  commandId: id,
                                  timeoutMs,
                                  message: `Git command timed out after ${timeoutMs}ms`,
                                })

                              emit({
                                _tag: 'Failed',
                                commandId: id,
                                error: {
                                  message:
                                    timeoutError.message ?? 'Command timeout',
                                },
                                failedAt: new Date(),
                              })

                              completeFailure(timeoutError)

                              if (!child.killed) {
                                child.kill('SIGKILL')
                              }
                            })
                          )
                        )
                      )
                    }

                    yield* Effect.forkScoped(
                      Effect.repeat(
                        Effect.suspend(() => {
                          if (completed) {
                            return Effect.void
                          }
                          return Effect.gen(function* () {
                            const heartbeat: GitCommandEvent = {
                              _tag: 'Heartbeat',
                              commandId: id,
                              timestamp: new Date(),
                            }
                            yield* queue.offer(heartbeat).pipe(
                              Effect.catchAll(() => Effect.void)
                            )
                          })
                        }),
                        Schedule.spaced(Duration.seconds(5))
                      )
                    )

                    const startedEvent: GitCommandEvent = {
                      _tag: 'Started',
                      commandId: id,
                      startedAt,
                      binary: binary ?? 'git',
                      args,
                      cwd: worktree.repositoryPath,
                    }
                    yield* queue.offer(startedEvent)

                    const events = Stream.fromQueue(queue)

                    const handle: GitCommandExecutionHandle = {
                      request: normalisedRequest,
                      events,
                      awaitResult: Deferred.await(resultDeferred),
                      terminate: Effect.sync(() => {
                        if (!child.killed) {
                          terminatedByUser = true
                          child.kill('SIGTERM')
                        }
                      }),
                    }

                    yield* Deferred.succeed(handleDeferred, handle)

                    yield* Deferred.await(resultDeferred).pipe(
                      Effect.match({
                        onFailure: () => Effect.void,
                        onSuccess: () => Effect.void,
                      })
                    )
                  }),
                  error => {
                    // Convert any error (including ParseError) to GitCommandDomainError
                    const domainError: GitCommandDomainError =
                      error instanceof GitExecutableUnavailableError ||
                      error instanceof GitCommandTimeoutError ||
                      error instanceof GitCommandFailedError ||
                      error instanceof GitCommandSpawnError
                        ? error
                        : new GitCommandSpawnError({
                            commandId: request.id,
                            message: `Failed to execute command: ${
                              error instanceof Error
                                ? error.message
                                : String(error)
                            }`,
                            cause:
                              error instanceof Error
                                ? error.message
                                : String(error),
                          })

                    return Deferred.fail(handleDeferred, domainError).pipe(
                      Effect.zipRight(Effect.fail(domainError))
                    )
                  }
                )
              )

              return yield* Deferred.await(handleDeferred)
            })
      }

      return runner
    }),
  }
) {}
