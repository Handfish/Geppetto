import { Atom, Result } from '@effect-atom/atom-react'
import { Effect, Duration } from 'effect'
import type { AccountId, ProviderType } from '../../shared/schemas/account-context'
import { ProviderClient } from '../lib/ipc-client'
import type { ProviderRepository } from '../../shared/schemas/provider'

const providerRuntime = Atom.runtime(ProviderClient.Default)

export const providerSignInAtom = Atom.family((provider: ProviderType) =>
  providerRuntime.fn(
    Effect.fnUntraced(function* () {
      const client = yield* ProviderClient
      return yield* client.signIn(provider)
    }),
    {
      reactivityKeys: [
        `provider:${provider}:auth`,
        `provider:${provider}:repos`,
        'providers:auth',
        'providers:repos',
        'accounts:context',
      ],
    }
  )
)

export const providerSignOutAtom = providerRuntime.fn(
  (params: { accountId: AccountId }) =>
    Effect.gen(function* () {
      const client = yield* ProviderClient
      yield* client.signOut(params.accountId)
    }),
  {
    reactivityKeys: ['providers:auth', 'providers:repos', 'accounts:context'],
  }
)

export const providerAuthStatusAtom = Atom.family((accountId: AccountId) =>
  providerRuntime
    .atom(
      Effect.gen(function* () {
        const client = yield* ProviderClient
        return yield* client.checkAuth(accountId)
      })
    )
    .pipe(
      Atom.withReactivity([`provider:${accountId}:auth`, 'providers:auth']),
      Atom.setIdleTTL(Duration.minutes(5))
    )
)

export const providerRepositoriesAtom = Atom.family((provider: ProviderType) =>
  providerRuntime
    .atom(
      Effect.gen(function* () {
        const client = yield* ProviderClient
        return yield* client.getProviderRepositories(provider)
      })
    )
    .pipe(
      Atom.withReactivity([`provider:${provider}:repos`, 'providers:repos']),
      Atom.setIdleTTL(Duration.minutes(5))
    )
)

export const accountRepositoriesAtom = Atom.family((accountId: AccountId) =>
  providerRuntime
    .atom(
      Effect.gen(function* () {
        const client = yield* ProviderClient
        return yield* client.getAccountRepositories(accountId)
      })
    )
    .pipe(
      Atom.withReactivity([`provider:${accountId}:repos`, 'providers:repos']),
      Atom.setIdleTTL(Duration.minutes(5))
    )
)

export const emptyAccountRepositoriesAtom = Atom.make(() =>
  Result.success([] as ProviderRepository[])
)
