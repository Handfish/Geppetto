import { Effect, Option, Redacted } from 'effect'
import Store from 'electron-store'
import type { AccountId } from '../../shared/schemas/account-context'

/**
 * SecureStoreService - Multi-Account Token Storage
 *
 * Stores GitHub tokens per account using AccountId as the key.
 * All tokens are encrypted using electron-store's encryption feature.
 */
export class SecureStoreService extends Effect.Service<SecureStoreService>()(
  'SecureStoreService',
  {
    sync: () => {
      const store = new Store({
        name: 'secure-data',
        encryptionKey:
          process.env.STORE_ENCRYPTION_KEY || 'dev-key-change-in-production',
        clearInvalidConfig: true,
      })

      return {
        /**
         * Get auth for a specific account ID
         */
        getAuthForAccount: (accountId: AccountId) =>
          Effect.sync(() => {
            const tokens =
              (store.get('githubTokens') as Record<string, string>) ?? {}
            const token = tokens[accountId]

            if (!token) {
              return Option.none()
            }

            return Option.some(Redacted.make(token))
          }),

        /**
         * Set auth for a specific account
         */
        setAuthForAccount: (
          accountId: AccountId,
          token: Redacted.Redacted<string>
        ) =>
          Effect.sync(() => {
            const tokens =
              (store.get('githubTokens') as Record<string, string>) ?? {}
            tokens[accountId] = Redacted.value(token)
            store.set('githubTokens', tokens)
          }),

        /**
         * Clear auth for a specific account
         */
        clearAuthForAccount: (accountId: AccountId) =>
          Effect.sync(() => {
            const tokens =
              (store.get('githubTokens') as Record<string, string>) ?? {}
            delete tokens[accountId]
            store.set('githubTokens', tokens)
          }),

        /**
         * Clear all GitHub auth data
         */
        clearAllAuth: Effect.sync(() => {
          store.delete('githubTokens')
        }),
      }
    },
  }
) {}
