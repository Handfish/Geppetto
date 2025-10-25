import { toast } from 'sonner'
import { Effect, Cause } from 'effect'
import type { Option as OptionType } from 'effect/Option'
import type { ExternalToast } from 'sonner'

const DEFAULT_DURATION = 6000

export const DEFAULT_PRO_FEATURE_MESSAGE =
  'OpenAI integration requires the Pro tier. Upgrade to unlock AI provider usage.'

const PRO_FEATURE_TOAST_ID = 'pro-feature-locked'

/**
 * Show an error toast (stock Sonner)
 */
export const showErrorToast = (
  message: string,
  options?: ExternalToast
) => {
  toast.error(message, {
    duration: DEFAULT_DURATION,
    ...options,
  })
}

/**
 * Show a success toast (stock Sonner)
 */
export const showSuccessToast = (
  message: string,
  options?: ExternalToast
) => {
  toast.success(message, {
    duration: DEFAULT_DURATION,
    ...options,
  })
}

/**
 * Show a warning toast (stock Sonner)
 */
export const showWarningToast = (
  message: string,
  options?: ExternalToast
) => {
  toast.warning(message, {
    duration: DEFAULT_DURATION,
    ...options,
  })
}

/**
 * Convenience function for Pro feature locked toasts
 */
export const showProFeatureLockedToast = (
  message: string = DEFAULT_PRO_FEATURE_MESSAGE
) => {
  toast.warning(message, {
    id: PRO_FEATURE_TOAST_ID,
    duration: DEFAULT_DURATION,
  })
}

type ToastOptions<A, E, Args extends ReadonlyArray<unknown>> = {
  id?: string | ((...args: Args) => string)
  onWaiting: string | ((...args: Args) => string)
  onSuccess: string | ((value: A, ...args: Args) => string)
  onFailure:
    | string
    | ((error: OptionType<E>, ...args: Args) => string | null | undefined)
  duration?: number
}

const resolveMessage = <Args extends ReadonlyArray<unknown>, T>(
  value: string | ((...args: Args) => T),
  ...args: Args
): T extends string ? string : T => {
  if (typeof value === 'function') {
    return (value as (...innerArgs: Args) => T)(...args) as T extends string
      ? string
      : T
  }
  return value as T extends string ? string : T
}

export const withToast =
  <Args extends ReadonlyArray<unknown>, A, E, R>(
    effectFactory: (...args: Args) => Effect.Effect<A, E, R>,
    options: ToastOptions<A, E, Args>
  ) =>
  (...args: Args): Effect.Effect<A, E, R> =>
    Effect.gen(function* () {
      const toastIdValue = options.id
        ? resolveMessage(options.id, ...args)
        : undefined
      const waitingMessage = resolveMessage(options.onWaiting, ...args)

      const toastId = toast.loading(waitingMessage, {
        id: toastIdValue,
        duration: options.duration ?? DEFAULT_DURATION,
        position: 'top-left',
      })

      return yield* effectFactory(...args).pipe(
        Effect.tap(result =>
          Effect.sync(() => {
            const successMessage = resolveMessage(
              options.onSuccess,
              result,
              ...args
            )
            toast.success(successMessage, {
              id: toastId,
              duration: options.duration ?? DEFAULT_DURATION,
              position: 'top-left',
            })
          })
        ),
        Effect.tapErrorCause(cause =>
          Effect.sync(() => {
            const failureOption = Cause.failureOption(cause) as OptionType<E>
            const failureMessage = resolveMessage(
              options.onFailure,
              failureOption,
              ...args
            )

            if (failureMessage == null || failureMessage === '') {
              toast.dismiss(toastId)
              return
            }

            toast.error(failureMessage, {
              id: toastId,
              duration: options.duration ?? DEFAULT_DURATION,
              position: 'top-left',
            })
          })
        )
      )
    })
