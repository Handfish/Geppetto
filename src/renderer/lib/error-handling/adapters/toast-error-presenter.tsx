/**
 * Toast Error Presenter - Default Error Presentation Adapter
 *
 * Presents errors as toast notifications using Sonner.
 * This is the default error presenter for the application.
 */

import React from 'react'
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

const DEFAULT_TOAST_DURATION = 6000
const TOAST_POSITION = 'top-left' as const

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
      const id = context?.operation
        ? `error:${context.operation}`
        : undefined

      // Tier errors get special treatment (yellow warning style)
      if (isTierError(error)) {
        this.presentTierError(error, context, id)
        return
      }

      // Standard error toast
      const duration = context?.severity === 'warning' ? 8000 : DEFAULT_TOAST_DURATION

      toast.error(message, {
        id,
        description: title !== 'Error' ? title : undefined,
        duration,
        position: TOAST_POSITION,
      })
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

  /**
   * Present tier error with special yellow styling
   */
  private presentTierError(
    error: Extract<IpcError, { _tag: 'TierLimitError' | 'AiFeatureUnavailableError' }>,
    context?: ErrorContext,
    id?: string
  ): void {
    toast.custom(
      toastId => (
        <div className="pointer-events-auto w-[320px] rounded-xl border border-yellow-500/80 bg-gray-950/90 px-5 py-4 text-yellow-100 shadow-2xl backdrop-blur-md">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <p className="text-sm font-semibold uppercase tracking-wide text-yellow-300">
                {error._tag === 'TierLimitError'
                  ? 'Tier Limit Reached'
                  : 'Pro Feature Required'}
              </p>
              <p className="text-sm text-yellow-100/85">{error.message}</p>
              {error._tag === 'TierLimitError' && (
                <p className="text-xs text-yellow-100/65">
                  {error.currentCount} / {error.maxAllowed} accounts used
                </p>
              )}
            </div>
            <button
              className="rounded-md px-2 py-1 text-xs font-medium text-yellow-100/70 transition hover:bg-yellow-500/10 hover:text-yellow-50"
              onClick={() => toast.dismiss(toastId)}
              type="button"
            >
              Dismiss
            </button>
          </div>
        </div>
      ),
      {
        id: id ?? 'tier-error',
        duration: 10000,
        position: TOAST_POSITION,
      }
    )
  }
}

/**
 * Default error presenter instance
 * Use this in most cases unless you need a different presentation strategy
 */
export const defaultErrorPresenter = new ToastErrorPresenter()
