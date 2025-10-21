import { Effect, Option, Redacted, Schema as S } from 'effect'
import Store from 'electron-store'
import { GitHubUser } from '../../shared/schemas'
import { StoredGitHubAuth } from './schemas'

// Type for the raw user data stored in electron-store
type StoredUserData = S.Schema.Type<typeof GitHubUser>

export class SecureStoreService extends Effect.Service<SecureStoreService>()('SecureStoreService', {
  sync: () => {
    const store = new Store({
      name: 'secure-data',
      encryptionKey: process.env.STORE_ENCRYPTION_KEY || 'dev-key-change-in-production',
      clearInvalidConfig: true,
    })

    return {
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

