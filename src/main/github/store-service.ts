import { Effect, Option, Redacted, Schema as S } from 'effect'
import Store from 'electron-store'
import { GitHubUser } from '../../shared/schemas'
import { StoredGitHubAuth } from './schemas'
import { type AccountId } from '../../shared/schemas/account-context'

// Type for the raw user data stored in electron-store
type StoredUserData = S.Schema.Type<typeof GitHubUser>

/**
 * SecureStoreService - Multi-Account Token Storage
 *
 * Stores GitHub tokens per account using AccountId as the key.
 * Maintains backward compatibility with single-account mode.
 */
export class SecureStoreService extends Effect.Service<SecureStoreService>()('SecureStoreService', {
  sync: () => {
    const store = new Store({
      name: 'secure-data',
      encryptionKey: process.env.STORE_ENCRYPTION_KEY || 'dev-key-change-in-production',
      clearInvalidConfig: true,
    })

    return {
      /**
       * Get auth for a specific account ID
       */
      getAuthForAccount: (accountId: AccountId) =>
        Effect.sync(() => {
          const tokens = (store.get('githubTokens') as Record<string, string>) ?? {}
          const token = tokens[accountId]

          if (!token) {
            return Option.none()
          }

          return Option.some(Redacted.make(token))
        }),

      /**
       * Set auth for a specific account
       */
      setAuthForAccount: (accountId: AccountId, token: Redacted.Redacted<string>) =>
        Effect.sync(() => {
          const tokens = (store.get('githubTokens') as Record<string, string>) ?? {}
          tokens[accountId] = Redacted.value(token)
          store.set('githubTokens', tokens)
        }),

      /**
       * Clear auth for a specific account
       */
      clearAuthForAccount: (accountId: AccountId) =>
        Effect.sync(() => {
          const tokens = (store.get('githubTokens') as Record<string, string>) ?? {}
          delete tokens[accountId]
          store.set('githubTokens', tokens)
        }),

      /**
       * Clear all GitHub auth data
       */
      clearAllAuth: Effect.sync(() => {
        store.delete('githubTokens')
      }),

      // DEPRECATED: Legacy single-account methods for backward compatibility
      getAuth: Effect.sync(() => {
        const token = store.get('githubToken') as string | undefined
        const user = store.get('githubUser') as StoredUserData | undefined

        if (!token || !user) {
          return Option.none()
        }

        return Option.some(
          new StoredGitHubAuth({
            token: Redacted.make(token),
            user: new GitHubUser(user),
          })
        )
      }),

      setAuth: (token: Redacted.Redacted<string>, user: GitHubUser) =>
        Effect.sync(() => {
          store.set('githubToken', Redacted.value(token))
          store.set('githubUser', {
            login: user.login,
            id: user.id,
            name: user.name,
            avatar_url: user.avatar_url,
            email: user.email,
          })
        }),

      clearAuth: Effect.sync(() => {
        store.delete('githubToken')
        store.delete('githubUser')
      }),
    }
  },
}) {}

