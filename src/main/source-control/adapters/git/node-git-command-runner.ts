import { Effect, Duration, Schema as S, Stream } from 'effect'
import { Command } from '@effect/platform'
import type { CommandExecutor } from '@effect/platform'
import { NodeContext } from '@effect/platform-node'
import type {
  GitCommandExecutionHandle,
  GitCommandRunnerPort,
} from '../../ports'
import {
  GitCommandRequest,
  GitCommandResult,
} from '../../../../shared/schemas/source-control'
import {
  GitCommandFailedError,
  GitCommandSpawnError,
  GitCommandTimeoutError,
  GitExecutableUnavailableError,
  type GitCommandDomainError,
} from '../../../../shared/schemas/source-control/errors'

/**
 * Node.js implementation of the GitCommandRunnerPort - Simplified.
 * Uses @effect/platform Command API with direct stdout/stderr/exitCode collection.
 * Removed unused event streaming infrastructure.
 */
export class NodeGitCommandRunner extends Effect.Service<NodeGitCommandRunner>()(
  'NodeGitCommandRunner',
  {
    dependencies: [NodeContext.layer],
    effect: Effect.gen(function* () {
      const runner: GitCommandRunnerPort = {
        execute: (request: GitCommandRequest) =>
          Effect.gen(function* () {
            const normalisedRequest = yield* S.decodeUnknown(
              GitCommandRequest
            )(request).pipe(
              Effect.mapError((parseError) =>
                new GitCommandSpawnError({
                  commandId: request.id,
                  message: `Invalid git command request: ${parseError.message}`,
                  cause: String(parseError),
                })
              )
            )

            const {
              id,
              binary,
              args,
              worktree,
              environment,
              allowInteractive,
              timeoutMs,
            } = normalisedRequest

            const mergedEnv: Record<string, string> = {
              ...(globalThis.process.env as Record<string, string>),
              ...Object.fromEntries(
                (environment ?? []).map(variable => [
                  variable.name,
                  variable.value,
                ])
              ),
            }

            // Build command using @effect/platform
            const cmd: Command.Command = Command.make(binary ?? 'git', ...args).pipe(
              Command.workingDirectory(worktree.repositoryPath),
              Command.env(mergedEnv),
              allowInteractive
                ? (cmd) => cmd.pipe(Command.stdin('inherit'), Command.stdout('inherit'), Command.stderr('inherit'))
                : (cmd) => cmd
            )

            const startedAt = new Date()

            console.log(`[GitCommandRunner] Running: ${binary ?? 'git'} ${args.join(' ')} (cwd: ${worktree.repositoryPath})`)

            // Start process
            const process: CommandExecutor.Process = yield* Command.start(cmd).pipe(
              Effect.mapError((platformError) => {
                const executableName = binary ?? 'git'
                const errorString = String(platformError)

                // Check for executable not found
                if (errorString.includes('ENOENT') || errorString.includes('NotFound') || errorString.includes('not found')) {
                  return new GitExecutableUnavailableError({
                    binary: executableName,
                    message: `Executable "${executableName}" was not found in PATH`,
                  })
                }

                return new GitCommandSpawnError({
                  commandId: id,
                  message: `Failed to spawn ${executableName}`,
                  cause: errorString,
                })
              })
            )

            // Collect stdout, stderr, and exit code in parallel
            const [stdout, stderr, exitCode] = yield* Effect.all([
              allowInteractive
                ? Effect.succeed('')
                : process.stdout.pipe(
                    Stream.decodeText('utf8'),
                    Stream.runFold('', (acc, chunk) => acc + chunk),
                    Effect.catchAll(() => Effect.succeed(''))
                  ),
              allowInteractive
                ? Effect.succeed('')
                : process.stderr.pipe(
                    Stream.decodeText('utf8'),
                    Stream.runFold('', (acc, chunk) => acc + chunk),
                    Effect.catchAll(() => Effect.succeed(''))
                  ),
              process.exitCode,
            ]).pipe(
              timeoutMs && timeoutMs > 0
                ? Effect.timeout(Duration.millis(timeoutMs))
                : (effect) => effect,
              Effect.mapError((error): GitCommandDomainError => {
                if (error._tag === 'TimeoutException') {
                  return new GitCommandTimeoutError({
                    commandId: id,
                    timeoutMs: timeoutMs!,
                    message: `Git command timed out after ${timeoutMs}ms`,
                  })
                }
                // Check if already a GitCommandDomainError
                if (
                  error instanceof GitExecutableUnavailableError ||
                  error instanceof GitCommandSpawnError ||
                  error instanceof GitCommandFailedError ||
                  error instanceof GitCommandTimeoutError
                ) {
                  return error
                }
                // Wrap any other error
                return new GitCommandSpawnError({
                  commandId: id,
                  message: 'Unexpected error during command execution',
                  cause: String(error),
                })
              })
            )

            const endedAt = new Date()
            const code = exitCode as number
            const durationMs = endedAt.getTime() - startedAt.getTime()

            // Create result based on exit code
            const result = code === 0
              ? new GitCommandResult({
                  commandId: id,
                  exitCode: 0,
                  status: 'success',
                  startedAt,
                  completedAt: endedAt,
                  durationMs,
                  stdout: stdout || undefined,
                  stderr: stderr || undefined,
                })
              : yield* Effect.fail(
                  new GitCommandFailedError({
                    commandId: id,
                    exitCode: code,
                    stdout: stdout || undefined,
                    stderr: stderr || undefined,
                    message: `Git exited with code ${code}`,
                  })
                )

            // Return simplified handle
            // events: empty stream (never consumed anyway)
            // awaitResult: immediately succeeds with result
            // terminate: no-op (command already completed)
            const handle: GitCommandExecutionHandle = {
              request: normalisedRequest,
              events: Stream.empty,
              awaitResult: Effect.succeed(result),
              terminate: Effect.void,
            }

            return handle
          }),
      }

      return runner
    }),
  }
) {}
