import { Effect } from 'effect'
import {
  AuthenticationError,
  NetworkError,
  NotFoundError,
  TierLimitError,
  GitOperationError,
  ValidationError,
  ProviderFeatureUnavailableError as SharedFeatureUnavailableError,
  ProviderUnavailableError as SharedProviderUnavailableError,
  ProviderOperationError as SharedProviderOperationError,
} from '../../shared/schemas/errors'
import type { ProviderType } from '../../shared/schemas/account-context'
import {
  AiAuthenticationError as SharedAiAuthenticationError,
  AiProviderUnavailableError as SharedAiProviderUnavailableError,
  AiFeatureUnavailableError as SharedAiFeatureUnavailableError,
  AiUsageUnavailableError as SharedAiUsageUnavailableError,
} from '../../shared/schemas/ai/errors'
import {
  GitExecutableUnavailableError,
  GitCommandTimeoutError,
  GitCommandFailedError,
  GitCommandSpawnError,
  type GitCommandDomainError,
} from '../../shared/schemas/source-control/errors'
import {
  RepositoryNotFoundError as DomainRepositoryNotFoundError,
  InvalidRepositoryError,
  RepositoryOperationError,
} from '../source-control/domain/aggregates/repository'
import {
  GraphBuildError,
  GraphUpdateError,
} from '../source-control/domain/aggregates/commit-graph'
import {
  WorkingTreeError,
  ConflictResolutionError,
  StagingError,
} from '../source-control/domain/aggregates/working-tree'
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
} from '../vcs/errors'
import {
  AiProviderAuthenticationError,
  AiProviderFeatureUnsupportedError,
  AiProviderNotRegisteredError,
  AiProviderUsageError,
  AiAccountNotFoundError,
} from '../ai/errors'
import {
  ProcessSpawnError,
  ProcessAttachError,
  ProcessMonitorError,
  ProcessKillError,
  ProcessNotFoundError,
  ProcessRunnerCreateError,
  ProcessRunnerStartError,
  ProcessRunnerStopError,
  RunnerNotFoundError as DomainRunnerNotFoundError,
  TmuxSessionNotFoundError,
  TmuxCommandError,
} from '../process-runners/errors'
import {
  ProcessError,
  WatcherNotFoundError as IpcWatcherNotFoundError,
  WatcherOperationError,
  TmuxError,
} from '../../shared/schemas/ai-watchers/errors'
import {
  TerminalError as SharedTerminalError,
} from '../../shared/schemas/terminal/errors'
import {
  TerminalError as DomainTerminalError,
} from '../terminal/terminal-port'

/**
 * Result type for IPC error responses
 * Maps to IpcError union type from shared schemas
 */
export type IpcErrorResult = {
  _tag: 'Error'
  error:
    | AuthenticationError
    | NetworkError
    | NotFoundError
    | TierLimitError
    | GitOperationError
    | ValidationError
    | SharedFeatureUnavailableError
    | SharedProviderUnavailableError
    | SharedProviderOperationError
    | SharedAiAuthenticationError
    | SharedAiProviderUnavailableError
    | SharedAiFeatureUnavailableError
    | SharedAiUsageUnavailableError
    | ProcessError
    | IpcWatcherNotFoundError
    | WatcherOperationError
    | TmuxError
    | SharedTerminalError
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
 * Union of all Process Runner domain errors
 */
type ProcessRunnerDomainError =
  | ProcessSpawnError
  | ProcessAttachError
  | ProcessMonitorError
  | ProcessKillError
  | ProcessNotFoundError
  | ProcessRunnerCreateError
  | ProcessRunnerStartError
  | ProcessRunnerStopError
  | DomainRunnerNotFoundError
  | TmuxSessionNotFoundError
  | TmuxCommandError

/**
 * Union of all Git command domain errors
 */
type GitDomainError = GitCommandDomainError

/**
 * Union of all source control domain errors
 */
type SourceControlDomainError =
  | DomainRepositoryNotFoundError
  | InvalidRepositoryError
  | RepositoryOperationError
  | GraphBuildError
  | GraphUpdateError
  | WorkingTreeError
  | ConflictResolutionError
  | StagingError

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
 * Type guard to check if an error is a Git command domain error
 */
const isGitDomainError = (error: unknown): error is GitDomainError => {
  return (
    error instanceof GitExecutableUnavailableError ||
    error instanceof GitCommandTimeoutError ||
    error instanceof GitCommandFailedError ||
    error instanceof GitCommandSpawnError
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

const isProviderDomainError = (
  error: unknown
): error is ProviderDomainError => {
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
 * Type guard to check if an error is a Process Runner domain error
 */
const isProcessRunnerDomainError = (error: unknown): error is ProcessRunnerDomainError => {
  return (
    error instanceof ProcessSpawnError ||
    error instanceof ProcessAttachError ||
    error instanceof ProcessMonitorError ||
    error instanceof ProcessKillError ||
    error instanceof ProcessNotFoundError ||
    error instanceof ProcessRunnerCreateError ||
    error instanceof ProcessRunnerStartError ||
    error instanceof ProcessRunnerStopError ||
    error instanceof DomainRunnerNotFoundError ||
    error instanceof TmuxSessionNotFoundError ||
    error instanceof TmuxCommandError
  )
}

/**
 * Type guard to check if an error is a source control domain error
 */
const isSourceControlDomainError = (error: unknown): error is SourceControlDomainError => {
  return (
    error instanceof DomainRepositoryNotFoundError ||
    error instanceof InvalidRepositoryError ||
    error instanceof RepositoryOperationError ||
    error instanceof GraphBuildError ||
    error instanceof GraphUpdateError ||
    error instanceof WorkingTreeError ||
    error instanceof ConflictResolutionError ||
    error instanceof StagingError
  )
}

/**
 * Type guard to check if an error is a terminal domain error
 */
const isTerminalDomainError = (error: unknown): error is DomainTerminalError => {
  return error instanceof DomainTerminalError
}

/**
 * Maps domain errors to shared IPC error types that can be sent across process boundaries
 */
export const mapDomainErrorToIpcError = (
  error: unknown
): Effect.Effect<IpcErrorResult> => {
  // DEBUG: Log the error to see what's failing
  console.error('[ERROR MAPPER] Received error:', error)
  if (error instanceof Error) {
    console.error('[ERROR MAPPER] Error name:', error.name)
    console.error('[ERROR MAPPER] Error message:', error.message)
    console.error('[ERROR MAPPER] Error stack:', error.stack)
  }

  // Handle Terminal errors (node-pty, xterm)
  if (isTerminalDomainError(error)) {
    return Effect.succeed({
      _tag: 'Error' as const,
      error: new SharedTerminalError({
        _tag: 'TerminalError' as const,
        reason: error.reason,
        message: error.message,
      }),
    })
  }

  // Handle Process Runner errors
  if (isProcessRunnerDomainError(error)) {
    // Process errors
    if (
      error instanceof ProcessSpawnError ||
      error instanceof ProcessAttachError ||
      error instanceof ProcessMonitorError ||
      error instanceof ProcessKillError ||
      error instanceof ProcessNotFoundError
    ) {
      return Effect.succeed({
        _tag: 'Error' as const,
        error: new ProcessError({
          message: error.message,
          processId: 'processId' in error ? error.processId : undefined,
          pid: 'pid' in error ? error.pid : undefined,
        }),
      })
    }

    // Runner not found
    if (error instanceof DomainRunnerNotFoundError) {
      return Effect.succeed({
        _tag: 'Error' as const,
        error: new IpcWatcherNotFoundError({
          message: error.message,
          watcherId: error.runnerId,
        }),
      })
    }

    // Runner operation errors
    if (
      error instanceof ProcessRunnerCreateError ||
      error instanceof ProcessRunnerStartError ||
      error instanceof ProcessRunnerStopError
    ) {
      return Effect.succeed({
        _tag: 'Error' as const,
        error: new WatcherOperationError({
          message: error.message,
          watcherId: 'runnerId' in error ? error.runnerId : undefined,
          operation:
            error instanceof ProcessRunnerCreateError
              ? 'create'
              : error instanceof ProcessRunnerStartError
                ? 'start'
                : 'stop',
        }),
      })
    }

    // Tmux errors
    if (error instanceof TmuxSessionNotFoundError || error instanceof TmuxCommandError) {
      return Effect.succeed({
        _tag: 'Error' as const,
        error: new TmuxError({
          message: error.message,
          sessionName: 'sessionName' in error ? error.sessionName : undefined,
        }),
      })
    }
  }

  // Handle Git command errors - preserve command context
  if (isGitDomainError(error)) {
    if (error instanceof GitExecutableUnavailableError) {
      return Effect.succeed({
        _tag: 'Error' as const,
        error: new GitOperationError({
          message: `Git executable not found: ${error.binary}`,
        }),
      })
    }

    if (error instanceof GitCommandTimeoutError) {
      return Effect.succeed({
        _tag: 'Error' as const,
        error: new GitOperationError({
          commandId: error.commandId,
          message:
            error.message ??
            `Git command timed out after ${error.timeoutMs}ms`,
        }),
      })
    }

    if (error instanceof GitCommandFailedError) {
      return Effect.succeed({
        _tag: 'Error' as const,
        error: new GitOperationError({
          commandId: error.commandId,
          exitCode: error.exitCode,
          stderr: error.stderr,
          message:
            error.message ??
            `Git command failed with exit code ${error.exitCode}`,
        }),
      })
    }

    if (error instanceof GitCommandSpawnError) {
      return Effect.succeed({
        _tag: 'Error' as const,
        error: new GitOperationError({
          commandId: error.commandId,
          message: error.message,
          stderr: error.cause,
        }),
      })
    }
  }

  // Handle tier-related errors - PRESERVE CONTEXT (no more lossy mapping)
  if (isTierDomainError(error)) {
    if (error instanceof AccountLimitExceededError) {
      return Effect.succeed({
        _tag: 'Error' as const,
        error: new TierLimitError({
          provider: error.provider as ProviderType,
          currentCount: error.currentCount,
          maxAllowed: error.maxAllowed,
          tier: error.tier,
          message: `Account limit exceeded for ${error.provider}. Maximum ${error.maxAllowed} account(s) allowed in ${error.tier} tier.`,
        }),
      })
    }

    if (error instanceof FeatureNotAvailableError) {
      if (error.feature === 'ai-providers') {
        return Effect.succeed({
          _tag: 'Error' as const,
          error: new SharedAiFeatureUnavailableError({
            feature: error.feature,
            tier: error.tier,
            requiredTier: error.requiredTier,
            message: `Feature '${error.feature}' requires ${error.requiredTier} tier.`,
          }),
        })
      }
      // Map other feature errors to TierLimitError to preserve context
      return Effect.succeed({
        _tag: 'Error' as const,
        error: new TierLimitError({
          provider: 'github' as const, // Default provider for non-AI features
          currentCount: 0,
          maxAllowed: 0,
          tier: error.tier,
          requiredTier: error.requiredTier,
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

  // Handle shared errors directly (pass through)
  if (error instanceof GitOperationError) {
    return Effect.succeed({
      _tag: 'Error' as const,
      error: error,
    })
  }

  if (error instanceof NotFoundError) {
    return Effect.succeed({
      _tag: 'Error' as const,
      error: error,
    })
  }

  // Handle source control domain errors
  if (isSourceControlDomainError(error)) {
    // Repository not found errors
    if (error instanceof DomainRepositoryNotFoundError) {
      const notFoundError = new NotFoundError({
        message: error.message ?? 'Repository not found',
        resource: error.path ?? 'repository',
      })
      console.error('[ERROR MAPPER] Returning NotFoundError:', notFoundError)
      return Effect.succeed({
        _tag: 'Error' as const,
        error: notFoundError,
      })
    }

    // Invalid repository errors (validation/structure issues)
    if (error instanceof InvalidRepositoryError) {
      return Effect.succeed({
        _tag: 'Error' as const,
        error: new ValidationError({
          message: error.message ?? 'Invalid repository structure',
          details: error.message,
        }),
      })
    }

    // All other source control errors map to GitOperationError
    if (
      error instanceof RepositoryOperationError ||
      error instanceof GraphBuildError ||
      error instanceof GraphUpdateError ||
      error instanceof WorkingTreeError ||
      error instanceof ConflictResolutionError ||
      error instanceof StagingError
    ) {
      return Effect.succeed({
        _tag: 'Error' as const,
        error: new GitOperationError({
          message: error.message ?? 'Source control operation failed',
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
    if (
      error instanceof GitHubApiError ||
      error instanceof NotAuthenticatedError
    ) {
      return Effect.succeed({
        _tag: 'Error' as const,
        error: new NetworkError({ message: error.message }),
      })
    }
  }

  // Handle unexpected errors - use ValidationError for parse/schema errors
  const message =
    error instanceof Error ? error.message : JSON.stringify(error)

  // If it looks like a parse/validation error, use ValidationError
  if (
    message.includes('validation') ||
    message.includes('schema') ||
    message.includes('decode') ||
    message.includes('parse') ||
    message.includes('expected') ||
    message.includes('Brand')
  ) {
    // Extract more details from schema errors
    const details = error instanceof Error && 'errors' in error
      ? JSON.stringify((error as any).errors, null, 2)
      : message

    return Effect.succeed({
      _tag: 'Error' as const,
      error: new ValidationError({
        message: `Schema validation failed: ${message}`,
        details: details,
      }),
    })
  }

  // Generic fallback for truly unexpected errors
  return Effect.succeed({
    _tag: 'Error' as const,
    error: new NetworkError({
      message: `Unexpected error occurred: ${message}`,
    }),
  })
}
