/**
 * Toast Error Presenter - Default Error Presentation Adapter
 *
 * Presents errors as toast notifications using Sonner.
 * This is the default error presenter for the application.
 */

import { Effect } from 'effect'
import { toast } from 'sonner'
import type { ErrorPresenter, ErrorContext } from '../ports'
import type { IpcError } from '../../../../shared/schemas/errors'
import {
  isAuthError,
  isTierError,
  isNetworkError,
  isGitError,
  isValidationError,
} from '../../../../shared/schemas/errors'
import { showCustomToast } from '../../toast'

const DEFAULT_TOAST_DURATION = 6000

/**
 * Toast Error Presenter Implementation
 *
 * Features:
 * - Tier errors get special yellow styling
 * - Context-aware titles and messages
 * - Provider prefixes for multi-provider errors
 * - Automatic duration based on severity
 */
export class ToastErrorPresenter implements ErrorPresenter {
  present = (error: IpcError, context?: ErrorContext): Effect.Effect<void> =>
    Effect.sync(() => {
      const title = this.formatErrorTitle(error, context)
      const message = this.formatErrorMessage(error, context)
      const id = context?.operation ? `error:${context.operation}` : undefined
      const duration = context?.severity === 'warning' ? 8000 : DEFAULT_TOAST_DURATION

      // Build description for tier errors
      const description = isTierError(error) && error._tag === 'TierLimitError'
        ? `${error.currentCount} / ${error.maxAllowed} accounts used`
        : undefined

      showCustomToast(
        {
          title,
          message,
          description,
        },
        {
          id,
          duration,
        }
      )
    })

  dismiss = (id?: string): Effect.Effect<void> =>
    Effect.sync(() => {
      if (id) {
        toast.dismiss(id)
      } else {
        toast.dismiss()
      }
    })

  /**
   * Format error title based on error type and context
   */
  private formatErrorTitle(error: IpcError, context?: ErrorContext): string {
    // Use custom title from context if provided
    if (context?.title) {
      return context.title
    }

    // Generate title based on operation
    if (context?.operation) {
      const opLabel = context.operation
        .replace(/-/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase())
      return `Failed to ${opLabel}`
    }

    // Error-type specific titles
    if (isAuthError(error)) return 'Authentication Error'
    if (isTierError(error)) return 'Tier Limit'
    if (isNetworkError(error)) return 'Network Error'
    if (isGitError(error)) return 'Git Operation Failed'
    if (isValidationError(error)) return 'Validation Error'
    if (error._tag === 'NotFoundError') return 'Not Found'
    if (error._tag === 'ProviderUnavailableError') return 'Provider Not Configured'
    if (error._tag === 'ProviderFeatureUnavailableError') return 'Feature Not Supported'
    if (error._tag === 'ProviderOperationError') return 'Provider Error'

    return 'Error'
  }

  /**
   * Format error message with optional provider prefix
   */
  private formatErrorMessage(error: IpcError, context?: ErrorContext): string {
    // Include provider context if available
    const prefix = context?.provider
      ? `[${context.provider.toUpperCase()}] `
      : ''

    return `${prefix}${error.message}`
  }
}

/**
 * Default error presenter instance
 * Use this in most cases unless you need a different presentation strategy
 */
export const defaultErrorPresenter = new ToastErrorPresenter()
