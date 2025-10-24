import { Atom, Result } from '@effect-atom/atom-react'
import { Effect, Duration } from 'effect'
import { toast } from 'sonner'
import { AiProviderClient } from '../lib/ipc-client'
import { withErrorHandling } from '../lib/error-handling'
import type {
  AiAccountId,
  AiProviderType,
  AiUsageSnapshot,
} from '../../shared/schemas/ai/provider'
import type { AiProviderSignInResult } from '../../shared/schemas/ai/provider'

const aiProviderRuntime = Atom.runtime(AiProviderClient.Default)

const formatProviderLabel = (provider: AiProviderType): string => {
  switch (provider) {
    case 'openai':
      return 'OpenAI'
    default:
      return provider
  }
}

/**
 * Sign in to AI provider with error handling
 * Uses new withErrorHandling wrapper for clean, type-safe error presentation
 */
const signIn = (provider: AiProviderType) =>
  Effect.gen(function* () {
    const client = yield* AiProviderClient
    return yield* client.signIn(provider)
  }).pipe(
    withErrorHandling({
      context: {
        operation: 'sign-in',
        provider,
      },
      onSuccess: result =>
        Effect.sync(() => {
          toast.success(`${formatProviderLabel(provider)} connected.`, {
            id: `ai-provider:${provider}:sign-in`,
            position: 'top-left',
            duration: 6000,
          })
        }),
    })
  )

export const aiProviderSignInAtom = Atom.family((provider: AiProviderType) =>
  aiProviderRuntime.fn(
    Effect.fnUntraced(function* () {
      return yield* signIn(provider)
    }),
    {
      reactivityKeys: [`ai-provider:${provider}:auth`, 'ai-provider:usage'],
    }
  )
)

/**
 * Query AI provider usage data
 *
 * NOTE: Intentionally catches auth/usage errors and returns empty array.
 * This is EXPECTED behavior when no accounts are configured - not a real error.
 * The UI will show "No accounts" state instead of error state.
 */
const aiProviderUsageQueryAtom = Atom.family((provider: AiProviderType) =>
  aiProviderRuntime
    .atom(
      Effect.gen(function* () {
        const client = yield* AiProviderClient
        return yield* client.getProviderUsage(provider)
      }).pipe(
        // EXPECTED: No accounts configured → empty array (not an error)
        Effect.catchTag('AiUsageUnavailableError', error => {
          if (process.env.NODE_ENV === 'development') {
            console.log(`[${provider}] No usage data:`, error.message)
          }
          return Effect.succeed([] as readonly AiUsageSnapshot[])
        }),
        // EXPECTED: Not authenticated → empty array (not an error)
        Effect.catchTag('AiAuthenticationError', error => {
          if (process.env.NODE_ENV === 'development') {
            console.log(`[${provider}] Not authenticated`)
          }
          return Effect.succeed([] as readonly AiUsageSnapshot[])
        })
        // NetworkError is NOT caught - that's a real error that should propagate
      )
    )
    .pipe(
      Atom.withReactivity([
        `ai-provider:${provider}:usage`,
        'ai-provider:usage',
      ]),
      Atom.setIdleTTL(Duration.minutes(5))
    )
)

const disabledUsageAtom = Atom.family((provider: AiProviderType) =>
  Atom.make(() => Result.success([] as readonly AiUsageSnapshot[]))
)

export const selectAiProviderUsageAtom = (
  provider: AiProviderType,
  enabled: boolean
) =>
  enabled ? aiProviderUsageQueryAtom(provider) : disabledUsageAtom(provider)

export const aiProviderSignOutAtom = aiProviderRuntime.fn(
  (params: { accountId: AiAccountId }) =>
    Effect.gen(function* () {
      const client = yield* AiProviderClient
      yield* client.signOut(params.accountId)
    }),
  {
    reactivityKeys: ['ai-provider:usage'],
  }
)
