/**
 * Error Handling Ports - Hexagonal Architecture
 *
 * This file defines the interfaces (ports) for error handling in the renderer process.
 * Different adapters can implement these ports to provide different error presentation
 * and recovery strategies:
 *
 * - ToastErrorPresenter: Toast notifications (default)
 * - InlineErrorPresenter: Inline error messages (for forms, cards)
 * - SilentErrorPresenter: Silent errors (for background tasks)
 * - LoggingErrorPresenter: Console logging (dev mode)
 */

import type { Effect } from 'effect'
import type { IpcError } from '../../../shared/schemas/errors'

/**
 * Error context - additional metadata about where/why the error occurred
 */
export type ErrorContext = {
  /** Operation that failed (e.g., "sign-in", "fetch-repos") */
  operation?: string

  /** Provider context (e.g., "github", "openai") */
  provider?: string

  /** Additional metadata */
  metadata?: Record<string, unknown>

  /** Severity level */
  severity?: 'error' | 'warning' | 'info'

  /** Optional user-friendly title override */
  title?: string
}

/**
 * Port: Error Presenter
 *
 * Defines how errors should be presented to the user.
 * Different adapters can implement this interface to provide different
 * presentation strategies (toast, inline, modal, etc.)
 */
export interface ErrorPresenter {
  /**
   * Present an error to the user
   * @param error - The IPC error to present
   * @param context - Optional context about the error
   * @returns Effect that completes when presentation is done
   */
  present: (error: IpcError, context?: ErrorContext) => Effect.Effect<void>

  /**
   * Dismiss a previously presented error
   * @param id - Optional ID to dismiss specific error, or undefined to dismiss all
   * @returns Effect that completes when dismissal is done
   */
  dismiss: (id?: string) => Effect.Effect<void>
}

/**
 * Port: Error Recovery
 *
 * Defines how to recover from errors.
 * Different adapters can implement recovery strategies:
 * - RetryErrorRecovery: Retry with exponential backoff
 * - FallbackErrorRecovery: Return fallback value
 * - IgnoreErrorRecovery: Silent recovery
 */
export interface ErrorRecovery<A, E> {
  /**
   * Attempt to recover from an error
   * @param error - The error to recover from
   * @returns Effect with recovered value or re-thrown error
   */
  recover: (error: E) => Effect.Effect<A, E>
}
