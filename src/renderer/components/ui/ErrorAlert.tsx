/**
 * ErrorAlert Components
 *
 * Reusable error display components with consistent styling.
 * Built on top of the base Alert component.
 */

import React from 'react'
import { Alert, AlertTitle, AlertDescription } from './alert'
import type { IpcError } from '../../../shared/schemas/errors'

/**
 * Get user-friendly error title based on error type
 */
function getErrorTitle(error: IpcError): string {
  switch (error._tag) {
    case 'AuthenticationError':
    case 'AiAuthenticationError':
      return 'Authentication Error'
    case 'NetworkError':
      return 'Network Error'
    case 'NotFoundError':
      return 'Not Found'
    case 'TierLimitError':
      return 'Tier Limit Reached'
    case 'AiFeatureUnavailableError':
      return 'Pro Feature Required'
    case 'GitOperationError':
      return 'Git Operation Failed'
    case 'ValidationError':
      return 'Invalid Data'
    case 'ProviderUnavailableError':
    case 'AiProviderUnavailableError':
      return 'Provider Not Configured'
    case 'ProviderFeatureUnavailableError':
      return 'Feature Not Supported'
    case 'ProviderOperationError':
      return 'Provider Error'
    case 'AiUsageUnavailableError':
      return 'Usage Data Unavailable'
    case 'AiUsageLimitExceededError':
      return 'Usage Limit Exceeded'
    default:
      return 'Error'
  }
}

/**
 * ErrorAlert Props
 */
type ErrorAlertProps = {
  /** The IPC error to display */
  error?: IpcError

  /** Custom title (overrides error-based title) */
  title?: string

  /** Custom message (overrides error.message) */
  message?: string

  /** Optional action button or link */
  action?: React.ReactNode

  /** Dismiss callback */
  onDismiss?: () => void

  /** Custom className */
  className?: string
}

/**
 * ErrorAlert - Standard error display component
 *
 * @example
 * ```tsx
 * <ErrorAlert
 *   error={error}
 *   action={<Button onClick={retry}>Retry</Button>}
 *   onDismiss={() => setError(null)}
 * />
 * ```
 */
export function ErrorAlert({
  error,
  title,
  message,
  action,
  onDismiss,
  className,
}: ErrorAlertProps) {
  const displayTitle = title ?? (error ? getErrorTitle(error) : 'Error')
  const displayMessage = message ?? error?.message ?? 'An error occurred'

  return (
    <Alert variant="destructive" className={className}>
      <div className="flex items-start justify-between w-full">
        <div className="flex-1 min-w-0">
          <AlertTitle>{displayTitle}</AlertTitle>
          <AlertDescription>
            <p>{displayMessage}</p>
            {action && <div className="mt-4">{action}</div>}
          </AlertDescription>
        </div>
        {onDismiss && (
          <button
            className="ml-4 text-red-300 hover:text-red-100 text-lg leading-none shrink-0"
            onClick={onDismiss}
            type="button"
            aria-label="Dismiss error"
          >
            ×
          </button>
        )}
      </div>
    </Alert>
  )
}

/**
 * TierLimitAlert Props
 */
type TierLimitAlertProps = {
  /** Current tier */
  tier: string

  /** Required tier (for feature locks) */
  requiredTier?: string

  /** Error message */
  message: string

  /** Current count (for account limits) */
  currentCount?: number

  /** Max allowed (for account limits) */
  maxAllowed?: number

  /** Upgrade callback */
  onUpgrade?: () => void

  /** Custom className */
  className?: string
}

/**
 * TierLimitAlert - Special styling for tier/feature limit errors
 *
 * @example
 * ```tsx
 * <TierLimitAlert
 *   tier="free"
 *   requiredTier="pro"
 *   message="AI providers require the Pro tier"
 *   onUpgrade={() => window.open('https://...', '_blank')}
 * />
 * ```
 */
export function TierLimitAlert({
  tier,
  requiredTier,
  message,
  currentCount,
  maxAllowed,
  onUpgrade,
  className,
}: TierLimitAlertProps) {
  return (
    <Alert
      className={`border-yellow-500/70 bg-yellow-500/10 text-yellow-100 ${className || ''}`}
    >
      <AlertTitle className="text-yellow-300">
        {requiredTier ? `${requiredTier} Tier Required` : 'Tier Limit Reached'}
      </AlertTitle>
      <AlertDescription>
        <p className="text-yellow-100/85">{message}</p>
        {currentCount !== undefined && maxAllowed !== undefined && (
          <p className="text-xs text-yellow-100/65 mt-2">
            {currentCount} / {maxAllowed} accounts used in {tier} tier
          </p>
        )}
        {onUpgrade && (
          <div className="mt-4">
            <button
              onClick={onUpgrade}
              type="button"
              className="px-4 py-2 border border-yellow-500/70 rounded-md text-yellow-100 hover:bg-yellow-500/20 transition-colors"
            >
              Upgrade to Pro
            </button>
          </div>
        )}
      </AlertDescription>
    </Alert>
  )
}

/**
 * LoadingSpinner - Simple loading indicator
 */
export function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-2',
    lg: 'w-12 h-12 border-3',
  }

  return (
    <div className="flex items-center justify-center">
      <div
        className={`${sizeClasses[size]} border-gray-600 border-t-blue-500 rounded-full animate-spin`}
        aria-label="Loading"
      />
    </div>
  )
}
