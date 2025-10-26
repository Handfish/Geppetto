import type { Effect, Scope, Stream } from 'effect'
import type {
  GitCommandEvent,
  GitCommandRequest,
  GitCommandResult,
} from '../../shared/schemas/source-control'
import type { GitCommandDomainError } from '../../shared/schemas/source-control/errors'

/**
 * Handle returned when executing a git command via the runner port.
 * Consumers receive a live stream of events and effectful controls.
 */
export interface GitCommandExecutionHandle {
  readonly request: GitCommandRequest
  readonly events: Stream.Stream<GitCommandEvent, never, never>
  readonly awaitResult: Effect.Effect<GitCommandResult, GitCommandDomainError>
  readonly terminate: Effect.Effect<void, GitCommandDomainError>
}

/**
 * Secondary port describing the infrastructure required to spawn git processes.
 *
 * Note: This is implemented by NodeGitCommandRunner service.
 * Services should depend on NodeGitCommandRunner directly, not this interface.
 */
export interface GitCommandRunnerPort {
  execute(
    request: GitCommandRequest
  ): Effect.Effect<
    GitCommandExecutionHandle,
    GitCommandDomainError,
    Scope.Scope
  >
}
