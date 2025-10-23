import { Atom } from '@effect-atom/atom-react'
import { Effect, Duration } from 'effect'
import { AiProviderClient } from '../lib/ipc-client'
import type { AiProviderType } from '../../shared/schemas/ai/provider'

const aiProviderRuntime = Atom.runtime(AiProviderClient.Default)

export const aiProviderSignInAtom = Atom.family((provider: AiProviderType) =>
  aiProviderRuntime.fn(
    Effect.fnUntraced(function* () {
      const client = yield* AiProviderClient
      return yield* client.signIn(provider)
    }),
    {
      reactivityKeys: [`ai-provider:${provider}:auth`, 'ai-provider:usage'],
    }
  )
)

export const aiProviderUsageAtom = Atom.family((provider: AiProviderType) =>
  aiProviderRuntime
    .atom(
      Effect.gen(function* () {
        const client = yield* AiProviderClient
        return yield* client.getProviderUsage(provider)
      })
    )
    .pipe(
      Atom.withReactivity([`ai-provider:${provider}:usage`, 'ai-provider:usage']),
      Atom.setIdleTTL(Duration.minutes(5))
    )
)
