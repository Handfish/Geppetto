import { Atom, Result } from '@effect-atom/atom-react'
import { Effect, Duration } from 'effect'
import { AccountClient } from '../lib/ipc-client'
import { ProviderType } from '../../shared/schemas/account-context'

const accountRuntime = Atom.runtime(AccountClient.Default)

export const accountContextAtom = accountRuntime
  .atom(
    Effect.gen(function* () {
      const accountClient = yield* AccountClient
      return yield* accountClient.getContext()
    })
  )
  .pipe(Atom.withReactivity(['accounts:context']), Atom.keepAlive)

export const activeAccountAtom = Atom.make((get) => {
  const contextResult = get(accountContextAtom)
  return Result.map(contextResult, (context) => context.getActiveAccount())
})

export const providerAccountsAtom = Atom.family((provider: ProviderType) =>
  Atom.make((get) => {
    const contextResult = get(accountContextAtom)
    return Result.map(contextResult, (context) => context.getAccountsByProvider(provider))
  })
)

export const tierLimitsAtom = accountRuntime
  .atom(
    Effect.gen(function* () {
      const accountClient = yield* AccountClient
      return yield* accountClient.getTierLimits()
    })
  )
  .pipe(Atom.withReactivity(['accounts:tier']), Atom.setIdleTTL(Duration.minutes(10)))
