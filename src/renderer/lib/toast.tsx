import React from 'react'
import { toast } from 'sonner'
import { Effect, Cause } from 'effect'
import type { Option as OptionType } from 'effect/Option'

const DEFAULT_DURATION = 6000

export const DEFAULT_PRO_FEATURE_MESSAGE =
  'OpenAI integration requires the Pro tier. Upgrade to unlock AI provider usage.'

const PRO_FEATURE_TOAST_ID = 'pro-feature-locked'

export const showProFeatureLockedToast = (message: string = DEFAULT_PRO_FEATURE_MESSAGE) => {
  toast.custom(
    (id) => (
      <div className="pointer-events-auto w-[320px] rounded-xl border border-yellow-500/80 bg-gray-950/90 px-5 py-4 text-yellow-100 shadow-2xl backdrop-blur-md">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-sm font-semibold uppercase tracking-wide text-yellow-300">
              Pro feature locked
            </p>
            <p className="text-sm text-yellow-100/85">{message}</p>
          </div>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-xs font-medium text-yellow-100/70 transition hover:bg-yellow-500/10 hover:text-yellow-50"
            onClick={() => toast.dismiss(id)}
          >
            Dismiss
          </button>
        </div>
      </div>
    ),
    {
      id: PRO_FEATURE_TOAST_ID,
      duration: DEFAULT_DURATION,
      position: 'top-left',
    }
  )
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
    return (value as (...innerArgs: Args) => T)(...args) as T extends string ? string : T
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
      const toastIdValue = options.id ? resolveMessage(options.id, ...args) : undefined
      const waitingMessage = resolveMessage(options.onWaiting, ...args)

      const toastId = toast.loading(waitingMessage, {
        id: toastIdValue,
        duration: options.duration ?? DEFAULT_DURATION,
        position: 'top-left',
      })

      return yield* effectFactory(...args).pipe(
        Effect.tap((result) =>
          Effect.sync(() => {
            const successMessage = resolveMessage(options.onSuccess, result, ...args)
            toast.success(successMessage, {
              id: toastId,
              duration: options.duration ?? DEFAULT_DURATION,
              position: 'top-left',
            })
          })
        ),
        Effect.tapErrorCause((cause) =>
          Effect.sync(() => {
            const failureOption = Cause.failureOption(cause) as OptionType<E>
            const failureMessage = resolveMessage(options.onFailure, failureOption, ...args)

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
