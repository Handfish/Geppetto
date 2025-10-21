import { Effect } from 'effect'
import { AuthenticationError, NetworkError } from '../../shared/schemas/errors'
import {
  GitHubAuthError,
  GitHubAuthTimeout,
  GitHubTokenExchangeError,
  GitHubApiError,
  NotAuthenticatedError,
} from '../github/errors'

/**
 * Result type for IPC error responses
 */
export type IpcErrorResult = { _tag: 'Error'; error: AuthenticationError | NetworkError }

/**
 * Union of all domain errors that can occur in GitHub operations
 */
type GitHubDomainError =
  | GitHubAuthError
  | GitHubAuthTimeout
  | GitHubTokenExchangeError
  | GitHubApiError
  | NotAuthenticatedError

/**
 * Type guard to check if an error is a tagged GitHub domain error
 */
const isGitHubDomainError = (error: unknown): error is GitHubDomainError => {
  return (
    error instanceof GitHubAuthError ||
    error instanceof GitHubAuthTimeout ||
    error instanceof GitHubTokenExchangeError ||
    error instanceof GitHubApiError ||
    error instanceof NotAuthenticatedError
  )
}

/**
 * Maps domain errors to shared IPC error types that can be sent across process boundaries
 */
export const mapDomainErrorToIpcError = (error: unknown): Effect.Effect<IpcErrorResult> => {
  // Handle known GitHub domain errors
  if (isGitHubDomainError(error)) {
    // Map authentication-related errors
    if (
      error instanceof GitHubAuthError ||
      error instanceof GitHubAuthTimeout ||
      error instanceof GitHubTokenExchangeError
    ) {
      return Effect.succeed({
        _tag: 'Error' as const,
        error: new AuthenticationError({ message: error.message }),
      })
    }

    // Map API and authentication state errors
    if (error instanceof GitHubApiError || error instanceof NotAuthenticatedError) {
      return Effect.succeed({
        _tag: 'Error' as const,
        error: new NetworkError({ message: error.message }),
      })
    }
  }

  // Handle unexpected errors
  const message = error instanceof Error ? error.message : JSON.stringify(error)
  return Effect.succeed({
    _tag: 'Error' as const,
    error: new NetworkError({ message: `Unexpected error occurred: ${message}` }),
  })
}
