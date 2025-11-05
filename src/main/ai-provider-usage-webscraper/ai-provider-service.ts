import { Effect } from 'effect'
import {
  type AiProviderSignInResult,
  type AiProviderType,
  type AiAccountId,
  type AiUsageSnapshot,
  AiAccount,
} from '../../shared/schemas/ai/provider'
import { AiProviderRegistryService } from './registry'
import type { AiProviderRegistryPort } from './registry'
import { AiAccountContextService } from './account-context-service'
import { TierService } from '../tier/tier-service'
import { AiAccountNotFoundError } from './errors'

export class AiProviderService extends Effect.Service<AiProviderService>()(
  'AiProviderService',
  {
    dependencies: [
      AiProviderRegistryService.Default,
      AiAccountContextService.Default,
      TierService.Default,
    ],
    effect: Effect.gen(function* () {
      const registry: AiProviderRegistryPort = yield* AiProviderRegistryService
      const accountService = yield* AiAccountContextService
      const tierService = yield* TierService

      return {
        signIn: (provider: AiProviderType) =>
          Effect.gen(function* () {
            yield* tierService.ensureAiProvidersEnabled()
            const adapter = yield* registry.getAdapter(provider)
            const signInResult = yield* adapter.signIn()

            yield* accountService.addAccount({
              provider,
              identifier: signInResult.metadata.accountIdentifier,
              label: signInResult.label,
            })

            return signInResult
          }),

        signOut: (accountId: AiAccountId) =>
          Effect.gen(function* () {
            const context = yield* accountService.getContext()
            const account = context.getAccount(accountId)
            if (!account) {
              return
            }

            const adapter = yield* registry.getAdapter(account.provider)
            yield* adapter.signOut(accountId)
            yield* accountService.removeAccount(accountId)
          }),

        checkAuth: (accountId: AiAccountId) =>
          Effect.gen(function* () {
            const context = yield* accountService.getContext()
            const account = context.getAccount(accountId)
            if (!account) {
              const { provider } = AiAccount.parseAccountId(accountId)
              return yield* Effect.fail(
                new AiAccountNotFoundError({ accountId, provider })
              )
            }

            const adapter = yield* registry.getAdapter(account.provider)
            return yield* adapter.checkAuth(accountId)
          }),

        getUsage: (accountId: AiAccountId) =>
          Effect.gen(function* () {
            const context = yield* accountService.getContext()
            const account = context.getAccount(accountId)

            if (!account) {
              const { provider } = AiAccount.parseAccountId(accountId)
              return yield* Effect.fail(
                new AiAccountNotFoundError({ accountId, provider })
              )
            }

            const adapter = yield* registry.getAdapter(account.provider)
            const usage = yield* adapter.getUsage(accountId)
            yield* accountService.touchAccount(accountId)
            return usage
          }),

        getUsageByProvider: (provider: AiProviderType) =>
          Effect.gen(function* () {
            console.log(
              `[AiProviderService] Fetching usage for provider: ${provider}`
            )
            yield* tierService.ensureAiProvidersEnabled()
            const adapter = yield* registry.getAdapter(provider)
            const context = yield* accountService.getContext()
            const accounts = context.getAccountsByProvider(provider)

            console.log(
              `[AiProviderService] Found ${accounts.length} accounts for ${provider}:`,
              accounts.map(a => a.id)
            )

            // If no accounts exist, return empty array immediately
            if (accounts.length === 0) {
              console.log(
                `[AiProviderService] No accounts for ${provider}, returning empty array`
              )
              return []
            }

            console.log(
              `[AiProviderService] Fetching usage for ${accounts.length} account(s)...`
            )
            const usage = yield* Effect.forEach(
              accounts,
              account =>
                adapter.getUsage(account.id).pipe(
                  Effect.tap(() => {
                    console.log(
                      `[AiProviderService] Successfully fetched usage for ${account.id}`
                    )
                    return accountService.touchAccount(account.id)
                  }),
                  // Gracefully handle authentication errors per account
                  Effect.catchAll(error => {
                    console.log(
                      `[AiProviderService] Failed to fetch usage for ${account.id}:`,
                      error
                    )
                    return Effect.succeed(null)
                  })
                ),
              { concurrency: 'unbounded' }
            )

            // Filter out null results from failed fetches
            const validUsage = usage.filter(
              (u): u is AiUsageSnapshot => u !== null
            )
            console.log(
              `[AiProviderService] Returning ${validUsage.length} valid usage snapshots`
            )
            return validUsage
          }),
      }
    }),
  }
) {}
