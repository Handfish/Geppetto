/**
 * Error Recovery Strategies
 *
 * Different strategies for recovering from errors:
 * - RetryErrorRecovery: Retry operation with exponential backoff
 * - FallbackErrorRecovery: Return fallback value
 * - LoggingErrorRecovery: Log and re-throw
 */

import { Effect, Schedule, Duration } from 'effect'
import type { ErrorRecovery } from '../ports'
import type { IpcError } from '../../../../shared/schemas/errors'
import { isRetryableError } from '../../../../shared/schemas/errors'

/**
 * Retry Error Recovery
 *
 * Retries the operation with exponential backoff for retryable errors
 * (NetworkError, GitOperationError).
 * Non-retryable errors (auth, tier limits) are re-thrown immediately.
 */
export class RetryErrorRecovery<A> implements ErrorRecovery<A, IpcError> {
  constructor(
    private operation: Effect.Effect<A, IpcError>,
    private maxRetries: number = 3,
    private baseDelay: Duration.Duration = Duration.seconds(1)
  ) {}

  recover = (error: IpcError): Effect.Effect<A, IpcError> => {
    // Only retry transient errors (network, git)
    if (isRetryableError(error)) {
      return this.operation.pipe(
        Effect.retry(
          Schedule.exponential(this.baseDelay).pipe(
            Schedule.compose(Schedule.recurs(this.maxRetries))
          )
        )
      )
    }

    // Don't retry auth/tier/validation errors
    return Effect.fail(error)
  }
}

/**
 * Fallback Error Recovery
 *
 * Returns a fallback value when an error occurs.
 * Useful for gracefully degrading to empty states or default values.
 */
export class FallbackErrorRecovery<A> implements ErrorRecovery<A, IpcError> {
  constructor(
    private fallback: A,
    private logInDev: boolean = true
  ) {}

  recover = (error: IpcError): Effect.Effect<A, never> => {
    const { fallback, logInDev } = this
    return Effect.sync(() => {
      // Log fallback in development
      if (logInDev && process.env.NODE_ENV === 'development') {
        console.warn('[FallbackErrorRecovery] Using fallback for error:', error)
      }
      return fallback
    })
  }
}

/**
 * Logging Error Recovery
 *
 * Logs the error to console (in dev) and re-throws.
 * Useful for debugging while preserving error propagation.
 */
export class LoggingErrorRecovery implements ErrorRecovery<never, IpcError> {
  constructor(private context?: string) {}

  recover = (error: IpcError): Effect.Effect<never, IpcError> =>
    Effect.fail(error).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          if (process.env.NODE_ENV === 'development') {
            const prefix = this.context ? `[${this.context}]` : '[ErrorRecovery]'
            console.error(prefix, error)
          }
        })
      )
    )
}

/**
 * Conditional Recovery
 *
 * Applies different recovery strategies based on error type.
 * Example: Retry network errors, fallback for others.
 */
export class ConditionalErrorRecovery<A> implements ErrorRecovery<A, IpcError> {
  constructor(
    private strategies: Map<
      (error: IpcError) => boolean,
      ErrorRecovery<A, IpcError>
    >,
    private defaultStrategy: ErrorRecovery<A, IpcError>
  ) {}

  recover = (error: IpcError): Effect.Effect<A, IpcError> => {
    const { strategies, defaultStrategy } = this

    // Find matching strategy
    const entries = Array.from(strategies.entries())
    for (const [predicate, strategy] of entries) {
      if (predicate(error)) {
        return strategy.recover(error)
      }
    }

    // Use default strategy
    return defaultStrategy.recover(error)
  }
}
