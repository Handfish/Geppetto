/**
 * Error Formatters
 *
 * Utilities for formatting errors for different audiences:
 * - formatErrorForUser: User-friendly messages
 * - formatErrorForDeveloper: Detailed technical information
 */

import type { IpcError } from '../../../shared/schemas/errors'

/**
 * Format error message for end users
 *
 * Includes additional context and helpful hints where appropriate.
 */
export function formatErrorForUser(error: IpcError): string {
  switch (error._tag) {
    case 'AuthenticationError':
      return error.message || 'Please sign in to continue'

    case 'AiAuthenticationError':
      return `${error.provider.toUpperCase()} authentication failed: ${error.message}`

    case 'TierLimitError':
      return `${error.message}\n\nYou have ${error.currentCount} of ${error.maxAllowed} accounts in the ${error.tier} tier.${error.requiredTier ? `\n\nUpgrade to ${error.requiredTier} for more accounts.` : ''}`

    case 'AiFeatureUnavailableError':
      return `${error.message}\n\nThis feature requires the ${error.requiredTier} tier.`

    case 'GitOperationError': {
      const gitMsg = error.message
      if (error.stderr) {
        return `${gitMsg}\n\nDetails: ${error.stderr}`
      }
      if (error.exitCode) {
        return `${gitMsg}\n\nExit code: ${error.exitCode}`
      }
      return gitMsg
    }

    case 'NetworkError':
      return error.message.includes('Unexpected')
        ? 'A network error occurred. Please check your connection and try again.'
        : error.message

    case 'NotFoundError':
      return `${error.resource} not found: ${error.message}`

    case 'ValidationError':
      return error.field
        ? `Invalid ${error.field}: ${error.message}`
        : `Validation failed: ${error.message}`

    case 'ProviderUnavailableError':
      return `${error.provider.toUpperCase()} is not configured. ${error.message}`

    case 'ProviderFeatureUnavailableError':
      return `${error.provider.toUpperCase()} does not support ${error.feature}. ${error.message}`

    case 'ProviderOperationError':
      return `${error.provider.toUpperCase()} error: ${error.message}`

    case 'AiProviderUnavailableError':
      return `AI provider ${error.provider.toUpperCase()} is not configured. ${error.message}`

    case 'AiUsageUnavailableError':
      return `Usage data unavailable for ${error.provider.toUpperCase()} account ${error.accountId}. ${error.message}`

    case 'AiUsageLimitExceededError':
      return error.limit
        ? `Usage limit exceeded for ${error.provider.toUpperCase()}: ${error.message} (Limit: ${error.limit})`
        : `Usage limit exceeded for ${error.provider.toUpperCase()}: ${error.message}`

    default: {
      // Exhaustive check - should never reach here
      const _exhaustive: never = error
      return (error as IpcError).message
    }
  }
}

/**
 * Format error for developers (detailed technical info)
 *
 * Returns JSON-formatted error with all fields for debugging.
 */
export function formatErrorForDeveloper(error: IpcError): string {
  return JSON.stringify(error, null, 2)
}

/**
 * Get recovery hint for error type
 *
 * Provides actionable suggestions for users to recover from errors.
 */
export function getRecoveryHint(error: IpcError): string | null {
  switch (error._tag) {
    case 'AuthenticationError':
    case 'AiAuthenticationError':
      return 'Try signing in again'

    case 'NetworkError':
      return 'Check your internet connection and try again'

    case 'TierLimitError':
      return 'Upgrade to Pro or remove an existing account'

    case 'GitOperationError':
      return 'Ensure Git is installed and the repository is valid'

    case 'ValidationError':
      return 'Check your input and try again'

    case 'ProviderUnavailableError':
    case 'AiProviderUnavailableError':
      return 'Configure the provider in settings'

    case 'NotFoundError':
      return 'Verify the resource exists and try again'

    default:
      return null
  }
}

/**
 * Check if error suggests user action is required
 */
export function requiresUserAction(error: IpcError): boolean {
  return (
    error._tag === 'AuthenticationError' ||
    error._tag === 'AiAuthenticationError' ||
    error._tag === 'TierLimitError' ||
    error._tag === 'AiFeatureUnavailableError' ||
    error._tag === 'ProviderUnavailableError' ||
    error._tag === 'AiProviderUnavailableError'
  )
}

/**
 * Check if error is transient (likely to resolve on retry)
 */
export function isTransientError(error: IpcError): boolean {
  return error._tag === 'NetworkError' || error._tag === 'GitOperationError'
}
