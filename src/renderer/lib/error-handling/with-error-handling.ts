/**
 * withErrorHandling - Effect-First Error Handling Wrapper
 *
 * Replaces the old withToast pattern with a cleaner, type-safe approach.
 * Uses ErrorPresenter adapters for flexible error presentation.
 *
 * Benefits over withToast:
 * - No manual error type checks (instanceof + _tag)
 * - Pluggable error presenters (toast, inline, silent)
 * - Type-safe error narrowing
 * - Consistent error handling across app
 */

import { Effect } from 'effect'
import type { ErrorPresenter, ErrorContext } from './ports'
import { defaultErrorPresenter } from './adapters/toast-error-presenter'
import type { IpcError } from '../../../shared/schemas/errors'

export type WithErrorHandlingOptions<A> = {
  /** Error context for presentation */
  context?: ErrorContext

  /** Custom error presenter (defaults to toast) */
  presenter?: ErrorPresenter

  /** Success callback */
  onSuccess?: (value: A) => Effect.Effect<void>

  /** Suppress error presentation (error still propagates in Effect) */
  suppressErrors?: boolean
}

/**
 * Wrap an Effect with error presentation
 *
 * @example
 * ```typescript
 * const signIn = (provider: ProviderType) =>
 *   Effect.gen(function* () {
 *     const client = yield* ProviderClient
 *     return yield* client.signIn(provider)
 *   }).pipe(
 *     withErrorHandling({
 *       context: { operation: 'sign-in', provider },
 *       onSuccess: (result) =>
 *         Effect.sync(() => {
 *           toast.success(`${provider} connected!`)
 *         })
 *     })
 *   )
 * ```
 */
export const withErrorHandling = <A, E extends IpcError, R>(
  effect: Effect.Effect<A, E, R>,
  options: WithErrorHandlingOptions<A> = {}
): Effect.Effect<A, E, R> => {
  const presenter = options.presenter ?? defaultErrorPresenter

  return effect.pipe(
    // On success
    Effect.tap(value =>
      options.onSuccess ? options.onSuccess(value) : Effect.void
    ),
    // On error
    Effect.tapError(error =>
      options.suppressErrors
        ? Effect.void
        : presenter.present(error as IpcError, options.context)
    )
  )
}

/**
 * Alternative syntax for wrapping effect factories
 *
 * @example
 * ```typescript
 * const signIn = withErrorHandlingFactory(
 *   (provider: ProviderType) => Effect.gen(function* () {
 *     const client = yield* ProviderClient
 *     return yield* client.signIn(provider)
 *   }),
 *   (provider) => ({
 *     context: { operation: 'sign-in', provider },
 *     onSuccess: () => Effect.sync(() => toast.success(`${provider} connected`))
 *   })
 * )
 *
 * // Use it:
 * const result = await Effect.runPromise(signIn('github'))
 * ```
 */
export const withErrorHandlingFactory = <Args extends readonly unknown[], A, E extends IpcError, R>(
  effectFactory: (...args: Args) => Effect.Effect<A, E, R>,
  optionsFactory: (...args: Args) => WithErrorHandlingOptions<A>
) => {
  return (...args: Args): Effect.Effect<A, E, R> => {
    const effect = effectFactory(...args)
    const options = optionsFactory(...args)
    return withErrorHandling(effect, options)
  }
}
