import { Atom, Result } from '@effect-atom/atom-react'
import { Effect, Duration } from 'effect'
import * as Option from 'effect/Option'
import { AiProviderClient } from '../lib/ipc-client'
import { withToast, showProFeatureLockedToast } from '../lib/toast'
import type {
  AiAccountId,
  AiProviderType,
  AiUsageSnapshot,
} from '../../shared/schemas/ai/provider'
import type { AiProviderSignInResult } from '../../shared/schemas/ai/provider'
import { AiFeatureUnavailableError } from '../../shared/schemas/ai/errors'

const aiProviderRuntime = Atom.runtime(AiProviderClient.Default)

const formatProviderLabel = (provider: AiProviderType): string => {
  switch (provider) {
    case 'openai':
      return 'OpenAI'
    default:
      return provider
  }
}

const signInWithToast = withToast(
  (provider: AiProviderType): Effect.Effect<AiProviderSignInResult> =>
    Effect.gen(function* () {
      const client = yield* AiProviderClient
      return yield* client.signIn(provider)
    }),
  {
    id: (provider) => `ai-provider:${provider}:sign-in`,
    onWaiting: (provider) => `Connecting ${formatProviderLabel(provider)}…`,
    onSuccess: (_result, provider) => `${formatProviderLabel(provider)} connected.`,
    onFailure: (errorOption, provider) => {
      if (Option.isSome(errorOption)) {
        const error = errorOption.value
        if (error instanceof AiFeatureUnavailableError || error._tag === 'AiFeatureUnavailableError') {
          const message =
            error.message ??
            `${formatProviderLabel(provider)} integration requires the Pro tier. Upgrade to unlock AI provider usage.`
          showProFeatureLockedToast(message)
          return null
        }

        if (typeof (error as { message?: unknown }).message === 'string') {
          return (error as { message: string }).message
        }
      }

      return `Unable to connect to ${formatProviderLabel(provider)}.`
    },
  }
)

export const aiProviderSignInAtom = Atom.family((provider: AiProviderType) =>
  aiProviderRuntime.fn(
    Effect.fnUntraced(function* () {
      return yield* signInWithToast(provider)
    }),
    {
      reactivityKeys: [`ai-provider:${provider}:auth`, 'ai-provider:usage'],
    }
  )
)

const aiProviderUsageQueryAtom = Atom.family((provider: AiProviderType) =>
  aiProviderRuntime
    .atom(
      Effect.gen(function* () {
        const client = yield* AiProviderClient
        return yield* client.getProviderUsage(provider)
      }).pipe(
        // Gracefully handle no accounts case - return empty array instead of error
        Effect.catchTag('AiUsageUnavailableError', () => Effect.succeed([] as readonly AiUsageSnapshot[])),
        Effect.catchTag('AiAuthenticationError', () => Effect.succeed([] as readonly AiUsageSnapshot[]))
      )
    )
    .pipe(
      Atom.withReactivity([`ai-provider:${provider}:usage`, 'ai-provider:usage']),
      Atom.setIdleTTL(Duration.minutes(5))
    )
)

const disabledUsageAtom = Atom.family((provider: AiProviderType) =>
  Atom.make(() => Result.success([] as readonly AiUsageSnapshot[]))
)

export const selectAiProviderUsageAtom = (provider: AiProviderType, enabled: boolean) =>
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
