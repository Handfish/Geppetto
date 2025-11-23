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
 * Sign in to AI provider with error handling and success toast
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
 * NOTE: Intentionally catches usage/provider unavailable errors and returns empty array.
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
        // EXPECTED: No usage data available → empty array (not an error)
        Effect.catchTag('AiUsageUnavailableError', error => {
          if (process.env.NODE_ENV === 'development') {
            console.log(`[${provider}] No usage data:`, error.message)
          }
          return Effect.succeed([] as readonly AiUsageSnapshot[])
        }),
        // EXPECTED: Provider not available → empty array (not an error)
        Effect.catchTag('AiProviderUnavailableError', error => {
          if (process.env.NODE_ENV === 'development') {
            console.log(`[${provider}] Provider unavailable:`, error.message)
          }
          return Effect.succeed([] as readonly AiUsageSnapshot[])
        }),
        // EXPECTED: Feature not available in current tier → empty array (not an error)
        Effect.catchTag('AiFeatureUnavailableError', error => {
          if (process.env.NODE_ENV === 'development') {
            console.log(`[${provider}] Feature unavailable:`, error.message)
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
      Atom.setIdleTTL(Duration.minutes(10))
    )
)

const disabledUsageAtom = Atom.family((provider: AiProviderType) =>
  aiProviderRuntime
    .atom(Effect.succeed([] as readonly AiUsageSnapshot[]))
    .pipe(
      Atom.withReactivity([
        `ai-provider:${provider}:usage`,
        'ai-provider:usage',
      ])
    )
)

export const selectAiProviderUsageAtom = (
  provider: AiProviderType,
  enabled: boolean
) =>
  enabled ? aiProviderUsageQueryAtom(provider) : disabledUsageAtom(provider)

/**
 * Query AI provider accounts list (independent of usage)
 *
 * Returns the list of accounts for a provider regardless of whether
 * usage fetching succeeds. This allows disconnecting accounts even
 * when usage scraping fails.
 */
export const aiProviderAccountsAtom = Atom.family((provider: AiProviderType) =>
  aiProviderRuntime
    .atom(
      Effect.gen(function* () {
        const client = yield* AiProviderClient
        return yield* client.getProviderAccounts(provider)
      })
    )
    .pipe(
      Atom.withReactivity([
        `ai-provider:${provider}:auth`,
        `ai-provider:${provider}:usage`,
        'ai-provider:usage',
      ]),
      Atom.setIdleTTL(Duration.minutes(5))
    )
)

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
