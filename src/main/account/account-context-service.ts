/**
 * AccountContextService - Multi-Account Management
 *
 * Domain service for managing AccountContext aggregate.
 * Handles adding, removing, switching between accounts with tier enforcement.
 */

import { Effect, Context } from 'effect'
import Store from 'electron-store'
import {
  AccountContext,
  Account,
  type AccountId,
  type ProviderType,
  AccountStatus,
} from '../../shared/schemas/account-context'
import { TierService, AccountLimitExceededError } from '../tier/tier-service'

/**
 * Stored account context schema
 */
interface StoredAccountContext {
  accounts: Array<{
    id: string
    provider: string
    providerId: string
    username: string
    displayName?: string
    avatarUrl?: string
    status: string
    createdAt: string
    lastUsedAt: string
  }>
  activeAccountId: string | null
  lastModified: string
}

/**
 * AccountContextService implementation
 */
export class AccountContextService extends Effect.Service<AccountContextService>()(
  'AccountContextService',
  {
    dependencies: [TierService.Default],
    effect: Effect.gen(function* () {
      const tierService = yield* TierService
      const store = new Store<{ accountContext: StoredAccountContext }>({
      name: 'account-context',
      defaults: {
        accountContext: {
          accounts: [],
          activeAccountId: null,
          lastModified: new Date().toISOString(),
        },
      },
    })

    /**
     * Load AccountContext from store
     */
    const loadContext = (): AccountContext => {
      const stored = store.get('accountContext')
      return new AccountContext({
        accounts: stored.accounts.map(
          (acc) =>
            new Account({
              id: acc.id as AccountId,
              provider: acc.provider as ProviderType,
              providerId: acc.providerId,
              username: acc.username,
              displayName: acc.displayName,
              avatarUrl: acc.avatarUrl,
              status: acc.status as AccountStatus,
              createdAt: new Date(acc.createdAt),
              lastUsedAt: new Date(acc.lastUsedAt),
            })
        ),
        activeAccountId: stored.activeAccountId as AccountId | null,
        lastModified: new Date(stored.lastModified),
      })
    }

      /**
       * Save AccountContext to store
       */
      const saveContext = (context: AccountContext): void => {
        const stored: StoredAccountContext = {
          accounts: context.accounts.map((acc) => ({
            id: acc.id,
            provider: acc.provider,
            providerId: acc.providerId,
            username: acc.username,
            displayName: acc.displayName,
            avatarUrl: acc.avatarUrl,
            status: acc.status,
            createdAt: acc.createdAt.toISOString(),
            lastUsedAt: acc.lastUsedAt.toISOString(),
          })),
          activeAccountId: context.activeAccountId,
          lastModified: new Date().toISOString(),
        }
        store.set('accountContext', stored)
      }

      return {
        getContext: () => Effect.succeed(loadContext()),

        addAccount: (params: {
          provider: ProviderType
          providerId: string
          username: string
          displayName?: string
          avatarUrl?: string
        }) =>
          Effect.gen(function* () {
            const context = loadContext()

            // Check tier limits
            yield* tierService.checkCanAddAccount(params.provider, context)

            // Create new account
            const now = new Date()
            const accountId = Account.makeAccountId(params.provider, params.providerId)
            const account = new Account({
              id: accountId,
              provider: params.provider,
              providerId: params.providerId,
              username: params.username,
              displayName: params.displayName,
              avatarUrl: params.avatarUrl,
              status: 'active' as AccountStatus,
              createdAt: now,
              lastUsedAt: now,
            })

            // Check if account already exists
            if (context.hasAccount(accountId)) {
              // Update existing account instead of adding
              const updatedAccounts = context.accounts.map((acc: Account) =>
                acc.id === accountId ? account : acc
              )
              const updatedContext = new AccountContext({
                ...context,
                accounts: updatedAccounts,
                activeAccountId: accountId,
                lastModified: now,
              })
              saveContext(updatedContext)
              return account
            }

            // Add new account
            const updatedContext = new AccountContext({
              ...context,
              accounts: [...context.accounts, account],
              activeAccountId: accountId, // Auto-switch to newly added account
              lastModified: now,
            })

            saveContext(updatedContext)
            return account
          }),

        removeAccount: (accountId: AccountId) =>
          Effect.gen(function* () {
            const context = loadContext()
            const updatedAccounts = context.accounts.filter((acc) => acc.id !== accountId)

            // If removing active account, switch to another or null
            let newActiveAccountId = context.activeAccountId
            if (context.activeAccountId === accountId) {
              newActiveAccountId = updatedAccounts[0]?.id ?? null
            }

            const updatedContext = new AccountContext({
              ...context,
              accounts: updatedAccounts,
              activeAccountId: newActiveAccountId,
              lastModified: new Date(),
            })

            saveContext(updatedContext)
          }),

        switchAccount: (accountId: AccountId) =>
          Effect.gen(function* () {
            const context = loadContext()

            if (!context.hasAccount(accountId)) {
              return // Silently ignore invalid account IDs
            }

            const updatedContext = new AccountContext({
              ...context,
              activeAccountId: accountId,
              lastModified: new Date(),
            })

            saveContext(updatedContext)
          }),

        getActiveAccount: () =>
          Effect.gen(function* () {
            const context = loadContext()
            return context.getActiveAccount()
          }),

        getActiveAccountForProvider: (provider: ProviderType) =>
          Effect.gen(function* () {
            const context = loadContext()
            return context.getActiveAccountForProvider(provider)
          }),

        touchAccount: (accountId: AccountId) =>
          Effect.gen(function* () {
            const context = loadContext()
            const updatedAccounts = context.accounts.map((acc: Account) =>
              acc.id === accountId
                ? new Account({
                    ...acc,
                    lastUsedAt: new Date(),
                  })
                : acc
            )

            const updatedContext = new AccountContext({
              ...context,
              accounts: updatedAccounts,
              lastModified: new Date(),
            })

            saveContext(updatedContext)
          }),

        expireAccount: (accountId: AccountId) =>
          Effect.gen(function* () {
            const context = loadContext()
            const updatedAccounts = context.accounts.map((acc: Account) =>
              acc.id === accountId
                ? new Account({
                    ...acc,
                    status: 'expired' as AccountStatus,
                  })
                : acc
            )

            const updatedContext = new AccountContext({
              ...context,
              accounts: updatedAccounts,
              lastModified: new Date(),
            })

            saveContext(updatedContext)
          }),

          getAccountsByProvider: (provider: ProviderType) =>
            Effect.gen(function* () {
              const context = loadContext()
              return context.getAccountsByProvider(provider)
            }),
      }
    })
  }
) {}
