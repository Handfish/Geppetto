import React from 'react'
import { toast } from 'sonner'
import { Effect, Cause } from 'effect'
import type { Option as OptionType } from 'effect/Option'
import type { ExternalToast } from 'sonner'
import { clsx } from 'clsx'

const DEFAULT_DURATION = 6000

export const DEFAULT_PRO_FEATURE_MESSAGE =
  'OpenAI integration requires the Pro tier. Upgrade to unlock AI provider usage.'

const PRO_FEATURE_TOAST_ID = 'pro-feature-locked'

/**
 * Toast variants with different color schemes
 */
type ToastVariant = 'warning' | 'success'

/**
 * Unified custom toast component with variants
 */
type CustomToastProps = {
  title: string
  message: string
  description?: string
  variant?: ToastVariant
  onDismiss?: () => void
  toastId: string | number
}

/**
 * Variant-based styling configuration
 */
const variantStyles = {
  warning: {
    border: 'border-yellow-400/30',
    text: 'text-yellow-100',
    title: 'text-yellow-300 drop-shadow-[0_2px_8px_rgba(251,191,36,0.3)]',
    message: 'text-yellow-100/90',
    description: 'text-yellow-100/70',
    button: 'text-yellow-100/80 hover:bg-yellow-500/15 hover:text-yellow-50 border-yellow-400/20 hover:border-yellow-400/40',
  },
  success: {
    border: 'border-teal-400/30',
    text: 'text-teal-100',
    title: 'text-teal-300 drop-shadow-[0_2px_8px_rgba(45,212,191,0.3)]',
    message: 'text-teal-100/90',
    description: 'text-teal-100/70',
    button: 'text-teal-100/80 hover:bg-teal-500/15 hover:text-teal-50 border-teal-400/20 hover:border-teal-400/40',
  },
} as const

const CustomToast = ({
  title,
  message,
  description,
  variant = 'warning',
  onDismiss,
  toastId
}: CustomToastProps) => {
  const styles = variantStyles[variant]

  return (
    <div className={clsx(
      "pointer-events-auto w-[360px] rounded-2xl bg-gradient-to-br from-gray-900/60 via-gray-950/70 to-gray-950/80 px-5 py-4 shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-xl border",
      styles.border,
      styles.text
    )}>
      <div className="flex items-start gap-4">
        <div className="flex-1 space-y-1.5 min-w-0">
          <p className={clsx("text-sm font-semibold uppercase tracking-wide", styles.title)}>
            {title}
          </p>
          <p className={clsx("text-sm leading-relaxed", styles.message)}>
            {message}
          </p>
          {description && (
            <p className={clsx("text-xs mt-1", styles.description)}>
              {description}
            </p>
          )}
        </div>
        <button
          className={clsx(
            "flex-shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-all border",
            styles.button
          )}
          onClick={() => {
            toast.dismiss(toastId)
            onDismiss?.()
          }}
          type="button"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}

/**
 * Show a custom toast with unified styling
 */
export const showCustomToast = (
  props: Omit<CustomToastProps, 'toastId'>,
  options?: ExternalToast
) => {
  toast.custom(
    id => <CustomToast {...props} toastId={id} />,
    {
      duration: DEFAULT_DURATION,
      position: 'top-left',
      unstyled: true,
      ...options,
    }
  )
}

/**
 * Convenience function for Pro feature locked toasts
 */
export const showProFeatureLockedToast = (
  message: string = DEFAULT_PRO_FEATURE_MESSAGE
) => {
  showCustomToast(
    {
      title: 'Pro feature locked',
      message,
    },
    {
      id: PRO_FEATURE_TOAST_ID,
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
