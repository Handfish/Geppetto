import { Effect } from 'effect'
import {
  AuthenticationError,
  NetworkError,
  NotFoundError,
  ProviderFeatureUnavailableError as SharedFeatureUnavailableError,
  ProviderUnavailableError as SharedProviderUnavailableError,
  ProviderOperationError as SharedProviderOperationError,
} from '../../shared/schemas/errors'
import {
  AiAuthenticationError as SharedAiAuthenticationError,
  AiProviderUnavailableError as SharedAiProviderUnavailableError,
  AiUsageUnavailableError as SharedAiUsageUnavailableError,
} from '../../shared/schemas/ai/errors'
import {
  GitHubAuthError,
  GitHubAuthTimeout,
  GitHubTokenExchangeError,
  GitHubApiError,
  NotAuthenticatedError,
} from '../github/errors'
import {
  AccountLimitExceededError,
  FeatureNotAvailableError,
} from '../tier/tier-service'
import {
  ProviderAuthenticationError,
  ProviderFeatureUnsupportedError,
  ProviderNotRegisteredError,
  ProviderRepositoryError,
} from '../providers/errors'
import {
  AiProviderAuthenticationError,
  AiProviderFeatureUnsupportedError,
  AiProviderNotRegisteredError,
  AiProviderUsageError,
  AiAccountNotFoundError,
} from '../ai/errors'

/**
 * Result type for IPC error responses
 */
export type IpcErrorResult = {
  _tag: 'Error'
  error:
    | AuthenticationError
    | NetworkError
    | NotFoundError
    | SharedFeatureUnavailableError
    | SharedProviderUnavailableError
    | SharedProviderOperationError
    | SharedAiAuthenticationError
    | SharedAiProviderUnavailableError
    | SharedAiUsageUnavailableError
}

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
 * Union of all tier-related domain errors
 */
type TierDomainError = AccountLimitExceededError | FeatureNotAvailableError

type ProviderDomainError =
  | ProviderAuthenticationError
  | ProviderFeatureUnsupportedError
  | ProviderNotRegisteredError
  | ProviderRepositoryError

type AiDomainError =
  | AiProviderAuthenticationError
  | AiProviderFeatureUnsupportedError
  | AiProviderNotRegisteredError
  | AiProviderUsageError
  | AiAccountNotFoundError

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
 * Type guard to check if an error is a tier domain error
 */
const isTierDomainError = (error: unknown): error is TierDomainError => {
  return (
    error instanceof AccountLimitExceededError ||
    error instanceof FeatureNotAvailableError
  )
}

const isProviderDomainError = (error: unknown): error is ProviderDomainError => {
  return (
    error instanceof ProviderAuthenticationError ||
    error instanceof ProviderFeatureUnsupportedError ||
    error instanceof ProviderNotRegisteredError ||
    error instanceof ProviderRepositoryError
  )
}

const isAiDomainError = (error: unknown): error is AiDomainError => {
  return (
    error instanceof AiProviderAuthenticationError ||
    error instanceof AiProviderFeatureUnsupportedError ||
    error instanceof AiProviderNotRegisteredError ||
    error instanceof AiProviderUsageError ||
    error instanceof AiAccountNotFoundError
  )
}

/**
 * Maps domain errors to shared IPC error types that can be sent across process boundaries
 */
export const mapDomainErrorToIpcError = (error: unknown): Effect.Effect<IpcErrorResult> => {
  // Handle tier-related errors
  if (isTierDomainError(error)) {
    if (error instanceof AccountLimitExceededError) {
      return Effect.succeed({
        _tag: 'Error' as const,
        error: new AuthenticationError({
          message: `Account limit exceeded for ${error.provider}. Maximum ${error.maxAllowed} account(s) allowed in ${error.tier} tier.`,
        }),
      })
    }

    if (error instanceof FeatureNotAvailableError) {
      return Effect.succeed({
        _tag: 'Error' as const,
        error: new AuthenticationError({
          message: `Feature '${error.feature}' requires ${error.requiredTier} tier.`,
        }),
      })
    }
  }

  if (isProviderDomainError(error)) {
    if (error instanceof ProviderAuthenticationError) {
      return Effect.succeed({
        _tag: 'Error' as const,
        error: new AuthenticationError({ message: error.message }),
      })
    }

    if (error instanceof ProviderFeatureUnsupportedError) {
      return Effect.succeed({
        _tag: 'Error' as const,
        error: new SharedFeatureUnavailableError({
          provider: error.provider,
          feature: error.feature,
          message: `Provider '${error.provider}' does not support feature '${error.feature}' yet.`,
        }),
      })
    }

    if (error instanceof ProviderNotRegisteredError) {
      return Effect.succeed({
        _tag: 'Error' as const,
        error: new SharedProviderUnavailableError({
          provider: error.provider,
          message: `Provider '${error.provider}' is not configured.`,
        }),
      })
    }

    if (error instanceof ProviderRepositoryError) {
      return Effect.succeed({
        _tag: 'Error' as const,
        error: new SharedProviderOperationError({
          provider: error.provider,
          message: error.message,
        }),
      })
    }
  }

  if (isAiDomainError(error)) {
    if (error instanceof AiProviderAuthenticationError) {
      return Effect.succeed({
        _tag: 'Error' as const,
        error: new SharedAiAuthenticationError({
          provider: error.provider,
          message: error.message,
        }),
      })
    }

    if (error instanceof AiProviderFeatureUnsupportedError) {
      return Effect.succeed({
        _tag: 'Error' as const,
        error: new SharedAiProviderUnavailableError({
          provider: error.provider,
          message: `Provider '${error.provider}' does not support feature '${error.feature}' yet.`,
        }),
      })
    }

    if (error instanceof AiProviderNotRegisteredError) {
      return Effect.succeed({
        _tag: 'Error' as const,
        error: new SharedAiProviderUnavailableError({
          provider: error.provider,
          message: `AI provider '${error.provider}' is not configured.`,
        }),
      })
    }

    if (error instanceof AiProviderUsageError) {
      return Effect.succeed({
        _tag: 'Error' as const,
        error: new SharedAiUsageUnavailableError({
          provider: error.provider,
          accountId: error.accountId,
          message: error.message,
        }),
      })
    }

    if (error instanceof AiAccountNotFoundError) {
      return Effect.succeed({
        _tag: 'Error' as const,
        error: new SharedAiUsageUnavailableError({
          provider: error.provider,
          accountId: error.accountId,
          message: `AI account '${error.accountId}' could not be located.`,
        }),
      })
    }
  }

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
