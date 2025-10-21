/**
 * AccountContextService - Multi-Account Management
 *
 * Domain service for managing AccountContext aggregate.
 * Handles adding, removing, switching between accounts with tier enforcement.
 */

import { Effect, Schema as S } from 'effect'
import Store from 'electron-store'
import {
  AccountContext,
  Account,
  type AccountId,
  type ProviderType,
  AccountStatus,
} from '../../shared/schemas/account-context'
import { TierService } from '../tier/tier-service'

/**
 * Stored account context schema (auto-derived from AccountContext Schema)
 * Effect.Schema handles serialization of Dates to ISO strings automatically
 */
type StoredAccountContext = S.Schema.Encoded<typeof AccountContext>

/**
 * AccountContextService implementation
 */
export class AccountContextService extends Effect.Service<AccountContextService>()(
  'AccountContextService',
  {
    dependencies: [TierService.Default],
    effect: Effect.gen(function* () {
      const tierService = yield* TierService

      /**
       * Default empty context for initial store state
       * Encoded using Schema for consistency
       */
      const defaultContext = S.encodeSync(AccountContext)(AccountContext.empty())

      const store = new Store<{ accountContext: StoredAccountContext }>({
        name: 'account-context',
        defaults: {
          accountContext: defaultContext,
        },
      })

    /**
     * Load AccountContext from store
     * Uses Effect.Schema decode for automatic validation and type conversion
     */
    const loadContext = (): AccountContext => {
      const stored = store.get('accountContext')
      // S.decodeUnknownSync validates and decodes (ISO strings -> Dates, etc.)
      return S.decodeUnknownSync(AccountContext)(stored)
    }

      /**
       * Save AccountContext to store
       * Uses Effect.Schema encode for automatic serialization (Dates -> ISO strings, etc.)
       */
      const saveContext = (context: AccountContext): void => {
        // S.encodeSync converts AccountContext to StoredAccountContext format
        const stored = S.encodeSync(AccountContext)(context)
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
              // Update existing account instead of adding (re-authentication)
              // No tier check needed since we're not adding a new account
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

            // Check tier limits ONLY when adding a new account
            yield* tierService.checkCanAddAccount(params.provider, context)

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
          Effect.sync(() => {
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
          Effect.sync(() => {
            const context = loadContext()
            return context.getActiveAccount()
          }),

        getActiveAccountForProvider: (provider: ProviderType) =>
          Effect.sync(() => {
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
            Effect.sync(() => {
              const context = loadContext()
              return context.getAccountsByProvider(provider)
            }),
      }
    })
  }
) {}
