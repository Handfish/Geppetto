import { Effect, Stream, Scope } from 'effect'
import type {
  GitCommandEvent,
  GitCommandRequest,
  GitCommandResult,
} from '../../shared/schemas/source-control'
import type { GitCommandDomainError } from '../../shared/schemas/source-control/errors'
import { NodeGitCommandRunner } from './node-git-command-runner'
import type { GitCommandExecutionHandle } from './ports'

/**
 * Application service orchestrating command executions via the runner port.
 * Provides higher-level conveniences tailored to the renderer's UX needs.
 */
export class GitCommandService extends Effect.Service<GitCommandService>()(
  'GitCommandService',
  {
    dependencies: [NodeGitCommandRunner.Default],
    effect: Effect.gen(function* () {
      const runner = yield* NodeGitCommandRunner

      const startExecution = (
        request: GitCommandRequest
      ): Effect.Effect<
        GitCommandExecutionHandle,
        GitCommandDomainError,
        Scope.Scope
      > =>
        runner.execute(request).pipe(
          Effect.map(handle => ({
            ...handle,
            events: handle.events,
          }))
        )

      const runToCompletion = (
        request: GitCommandRequest
      ): Effect.Effect<GitCommandResult, GitCommandDomainError> =>
        Effect.scoped(
          Effect.gen(function* () {
            const execution = yield* startExecution(request)
            return yield* execution.awaitResult
          })
        )

      const streamCommand = (
        request: GitCommandRequest
      ): Effect.Effect<
        Stream.Stream<GitCommandEvent, never, never>,
        GitCommandDomainError
      > =>
        Effect.scoped(
          Effect.gen(function* () {
            const execution = yield* startExecution(request)
            return execution.events
          })
        )

      return {
        startExecution,
        runToCompletion,
        streamCommand,
      }
    }),
  }
) {}
