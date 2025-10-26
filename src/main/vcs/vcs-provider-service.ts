import { Effect } from 'effect'
import { Account } from '../../shared/schemas/account-context'
import {
  ProviderAccountRepositories,
  type ProviderAuthStatus,
  type ProviderRepository,
  type ProviderSignInResult,
} from '../../shared/schemas/provider'
import type {
  AccountId,
  ProviderType,
} from '../../shared/schemas/account-context'
import { ProviderRegistryService } from './provider-registry'
import type { VcsProviderRegistryPort } from './provider-port'
import { AccountContextService } from '../account/account-context-service'
import { TierService } from '../tier/tier-service'

/**
 * Application service orchestrating provider adapters.
 * Implements the hexagonal "driving" side of the architecture.
 */
export class VcsProviderService extends Effect.Service<VcsProviderService>()(
  'VcsProviderService',
  {
    dependencies: [
      ProviderRegistryService.Default,
      AccountContextService.Default,
      TierService.Default,
    ],
    effect: Effect.gen(function* () {
      const registry: VcsProviderRegistryPort = yield* ProviderRegistryService
      const accountService = yield* AccountContextService
      const tierService = yield* TierService

      const resolveProvider = (accountId: AccountId): ProviderType =>
        Account.parseAccountId(accountId).provider

      return {
        signIn: (provider: ProviderType) =>
          Effect.gen(function* () {
            // Enforce tier-based feature availability
            if (provider !== 'github') {
              yield* tierService.checkFeatureAvailable(provider)
            }

            const adapter = yield* registry.getAdapter(provider)
            const signInResult = yield* adapter.signIn()
            return signInResult
          }),

        signOut: (accountId: AccountId) =>
          Effect.gen(function* () {
            const provider = resolveProvider(accountId)
            const adapter = yield* registry.getAdapter(provider)

            // Ensure account exists before signaling adapter
            const context = yield* accountService.getContext()
            if (!context.hasAccount(accountId)) {
              return
            }

            yield* adapter.signOut(accountId)
          }),

        checkAuth: (accountId: AccountId) =>
          Effect.gen(function* () {
            const provider = resolveProvider(accountId)
            const adapter = yield* registry.getAdapter(provider)

            return yield* adapter.checkAuth(accountId)
          }),

        getRepositories: (accountId: AccountId) =>
          Effect.gen(function* () {
            const provider = resolveProvider(accountId)
            const adapter = yield* registry.getAdapter(provider)

            const repos = yield* adapter.getRepositories(accountId)
            yield* accountService.touchAccount(accountId)
            return repos
          }),

        getRepositoriesByProvider: (provider: ProviderType) =>
          Effect.gen(function* () {
            const adapter = yield* registry.getAdapter(provider)
            const context = yield* accountService.getContext()
            const accounts = context.getAccountsByProvider(provider)

            const results = yield* Effect.forEach(
              accounts,
              account =>
                adapter.getRepositories(account.id).pipe(
                  Effect.tap(() => accountService.touchAccount(account.id)),
                  Effect.map(
                    repositories =>
                      new ProviderAccountRepositories({
                        provider,
                        accountId: account.id,
                        repositories,
                      })
                  )
                ),
              { concurrency: 'unbounded' }
            )

            return results
          }),
      }
    }),
  }
) {}
