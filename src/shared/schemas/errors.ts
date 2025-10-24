import { Schema as S } from 'effect'
import { ProviderType } from './account-context'

export class AuthenticationError extends S.TaggedError<AuthenticationError>(
  'AuthenticationError'
)('AuthenticationError', {
  message: S.String,
}) {}

export class ProviderUnavailableError extends S.TaggedError<ProviderUnavailableError>(
  'ProviderUnavailableError'
)('ProviderUnavailableError', {
  provider: ProviderType,
  message: S.String,
}) {}

export class ProviderFeatureUnavailableError extends S.TaggedError<ProviderFeatureUnavailableError>(
  'ProviderFeatureUnavailableError'
)('ProviderFeatureUnavailableError', {
  provider: ProviderType,
  feature: S.String,
  message: S.String,
}) {}

export class ProviderOperationError extends S.TaggedError<ProviderOperationError>(
  'ProviderOperationError'
)('ProviderOperationError', {
  provider: ProviderType,
  message: S.String,
}) {}

export class NetworkError extends S.TaggedError<NetworkError>('NetworkError')(
  'NetworkError',
  {
    message: S.String,
  }
) {}

export class NotFoundError extends S.TaggedError<NotFoundError>(
  'NotFoundError'
)('NotFoundError', {
  message: S.String,
  resource: S.String,
}) {}

/**
 * Tier limit error - preserves tier context across IPC
 * Used when user hits account limits or feature gates
 */
export class TierLimitError extends S.TaggedError<TierLimitError>(
  'TierLimitError'
)('TierLimitError', {
  provider: ProviderType,
  currentCount: S.Number,
  maxAllowed: S.Number,
  tier: S.String,
  requiredTier: S.optional(S.String),
  message: S.String,
}) {}

/**
 * Git operation error - captures git command failures
 * Preserves command context, exit codes, and stderr
 */
export class GitOperationError extends S.TaggedError<GitOperationError>(
  'GitOperationError'
)('GitOperationError', {
  commandId: S.optional(S.String),
  exitCode: S.optional(S.Number),
  message: S.String,
  stderr: S.optional(S.String),
}) {}

/**
 * Validation error - more specific than NetworkError for schema failures
 * Used when data validation fails at boundaries
 */
export class ValidationError extends S.TaggedError<ValidationError>(
  'ValidationError'
)('ValidationError', {
  field: S.optional(S.String),
  message: S.String,
  details: S.optional(S.String),
}) {}

// Import AI errors for comprehensive union
import {
  AiAuthenticationError,
  AiProviderUnavailableError,
  AiFeatureUnavailableError,
  AiUsageUnavailableError,
  AiUsageLimitExceededError,
} from './ai/errors'

/**
 * Comprehensive union of all IPC-safe error types
 * These errors can cross the main/renderer process boundary
 */
export type IpcError =
  | AuthenticationError
  | NetworkError
  | NotFoundError
  | TierLimitError
  | GitOperationError
  | ValidationError
  | ProviderUnavailableError
  | ProviderFeatureUnavailableError
  | ProviderOperationError
  | AiAuthenticationError
  | AiProviderUnavailableError
  | AiFeatureUnavailableError
  | AiUsageUnavailableError
  | AiUsageLimitExceededError

/**
 * Type guard: Check if error is authentication-related
 */
export const isAuthError = (
  e: IpcError
): e is AuthenticationError | AiAuthenticationError =>
  e._tag === 'AuthenticationError' || e._tag === 'AiAuthenticationError'

/**
 * Type guard: Check if error is tier/feature limit related
 */
export const isTierError = (
  e: IpcError
): e is TierLimitError | AiFeatureUnavailableError =>
  e._tag === 'TierLimitError' || e._tag === 'AiFeatureUnavailableError'

/**
 * Type guard: Check if error is network-related
 */
export const isNetworkError = (e: IpcError): e is NetworkError =>
  e._tag === 'NetworkError'

/**
 * Type guard: Check if error is git operation related
 */
export const isGitError = (e: IpcError): e is GitOperationError =>
  e._tag === 'GitOperationError'

/**
 * Type guard: Check if error is validation-related
 */
export const isValidationError = (e: IpcError): e is ValidationError =>
  e._tag === 'ValidationError'

/**
 * Type guard: Check if error is provider-related
 */
export const isProviderError = (
  e: IpcError
): e is
  | ProviderUnavailableError
  | ProviderFeatureUnavailableError
  | ProviderOperationError
  | AiProviderUnavailableError =>
  e._tag === 'ProviderUnavailableError' ||
  e._tag === 'ProviderFeatureUnavailableError' ||
  e._tag === 'ProviderOperationError' ||
  e._tag === 'AiProviderUnavailableError'

/**
 * Type guard: Check if error is AI usage related
 */
export const isAiUsageError = (
  e: IpcError
): e is AiUsageUnavailableError | AiUsageLimitExceededError =>
  e._tag === 'AiUsageUnavailableError' ||
  e._tag === 'AiUsageLimitExceededError'

/**
 * Utility: Check if error is retryable (network/git operations)
 */
export const isRetryableError = (e: IpcError): boolean =>
  e._tag === 'NetworkError' || e._tag === 'GitOperationError'

/**
 * Utility: Check if error requires authentication
 */
export const requiresAuth = (e: IpcError): boolean =>
  isAuthError(e) || e._tag === 'AiUsageUnavailableError'
