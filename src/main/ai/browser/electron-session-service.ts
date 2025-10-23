import { Effect, Schema as S } from 'effect'
import { session, type Session } from 'electron'
import type { AiProviderType, AiAccountId } from '../../../shared/schemas/ai/provider'

/**
 * Cookie stored in Electron session.
 * Mirrors Electron's Cookie type with Effect Schema.
 */
export class ElectronCookie extends S.Class<ElectronCookie>('ElectronCookie')({
  name: S.String,
  value: S.String,
  domain: S.optional(S.String),
  path: S.optional(S.String),
  secure: S.optional(S.Boolean),
  httpOnly: S.optional(S.Boolean),
  expirationDate: S.optional(S.Number),
}) {}

/**
 * Service for managing Electron session partitions and cookies per AI account.
 * Each AI account gets its own isolated session partition for cookie storage.
 */
export class ElectronSessionService extends Effect.Service<ElectronSessionService>()(
  'ElectronSessionService',
  {
    effect: Effect.sync(() => {
      /**
       * Get session partition name for an AI account.
       * Format: persist:ai-{provider}-{identifier}
       */
      const getPartitionName = (provider: AiProviderType, identifier: string): string => {
        return `persist:ai-${provider}-${identifier}`
      }

      /**
       * Get or create an Electron session for an AI account.
       */
      const getSession = (provider: AiProviderType, identifier: string): Effect.Effect<Session> =>
        Effect.sync(() => {
          const partitionName = getPartitionName(provider, identifier)
          return session.fromPartition(partitionName, { cache: true })
        })

      /**
       * Get all cookies for a session.
       */
      const getCookies = (
        accountSession: Session,
        filter?: { url?: string; name?: string; domain?: string }
      ): Effect.Effect<readonly ElectronCookie[], Error> =>
        Effect.tryPromise({
          try: async () => {
            const cookies = await accountSession.cookies.get(filter ?? {})
            return cookies.map(
              cookie =>
                new ElectronCookie({
                  name: cookie.name,
                  value: cookie.value,
                  domain: cookie.domain,
                  path: cookie.path,
                  secure: cookie.secure,
                  httpOnly: cookie.httpOnly,
                  expirationDate: cookie.expirationDate,
                })
            )
          },
          catch: error =>
            new Error(
              `Failed to get cookies: ${error instanceof Error ? error.message : String(error)}`
            ),
        })

      /**
       * Check if a session has any cookies (indicates authentication).
       */
      const hasAnyCookies = (accountSession: Session): Effect.Effect<boolean, Error> =>
        Effect.gen(function* () {
          const cookies = yield* getCookies(accountSession)
          return cookies.length > 0
        })

      /**
       * Clear all cookies for a session (sign out).
       */
      const clearCookies = (accountSession: Session): Effect.Effect<void, Error> =>
        Effect.tryPromise({
          try: async () => {
            const cookies = await accountSession.cookies.get({})
            await Promise.all(
              cookies.map(cookie => {
                const url = `http${cookie.secure ? 's' : ''}://${cookie.domain}${cookie.path}`
                return accountSession.cookies.remove(url, cookie.name)
              })
            )
          },
          catch: error =>
            new Error(
              `Failed to clear cookies: ${error instanceof Error ? error.message : String(error)}`
            ),
        })

      /**
       * Clear session data including cache and storage.
       */
      const clearSessionData = (accountSession: Session): Effect.Effect<void, Error> =>
        Effect.tryPromise({
          try: () =>
            accountSession.clearStorageData({
              storages: ['cookies', 'localstorage', 'cachestorage', 'indexdb'],
            }),
          catch: error =>
            new Error(
              `Failed to clear session data: ${
                error instanceof Error ? error.message : String(error)
              }`
            ),
        })

      return {
        getSession,
        getCookies,
        hasAnyCookies,
        clearCookies,
        clearSessionData,
      } as const
    }),
  }
) {}
