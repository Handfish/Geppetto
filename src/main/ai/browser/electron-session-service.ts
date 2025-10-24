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
          console.log(`[ElectronSession] Getting session for partition: ${partitionName}`)
          const accountSession = session.fromPartition(partitionName, { cache: true })
          console.log(`[ElectronSession] Session retrieved, path: ${accountSession.storagePath}`)
          return accountSession
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
          console.log(`[ElectronSession] Session has ${cookies.length} cookies`)
          if (cookies.length > 0) {
            console.log(`[ElectronSession] Cookie domains:`, cookies.map(c => c.domain))
          }
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

      /**
       * Copy cookies from one session to another.
       * Useful for migrating from temp session to stable session after extracting user identifier.
       */
      const copyCookies = (
        sourceSession: Session,
        targetSession: Session
      ): Effect.Effect<void, Error> =>
        Effect.gen(function* () {
          console.log(`[ElectronSession] Copying cookies from source to target session`)
          console.log(`[ElectronSession] Source session path: ${sourceSession.storagePath}`)
          console.log(`[ElectronSession] Target session path: ${targetSession.storagePath}`)

          const cookies = yield* getCookies(sourceSession)
          console.log(`[ElectronSession] Found ${cookies.length} cookies to copy`)

          // Debug: Log cookie details
          const now = Date.now() / 1000
          const sessionCookies = cookies.filter(c => !c.expirationDate)
          const expiredCookies = cookies.filter(
            c => c.expirationDate && c.expirationDate < now
          )
          const validPersistentCookies = cookies.filter(
            c => c.expirationDate && c.expirationDate >= now
          )

          console.log(
            `[ElectronSession] Cookie breakdown: ${sessionCookies.length} session, ${expiredCookies.length} expired, ${validPersistentCookies.length} valid persistent`
          )
          if (expiredCookies.length > 0) {
            console.warn(
              `[ElectronSession] WARNING: Found ${expiredCookies.length} expired cookies:`,
              expiredCookies.map(c => `${c.name} (${c.domain})`)
            )
          }

          yield* Effect.tryPromise({
            try: async () => {
              const results = await Promise.allSettled(
                cookies.map(async cookie => {
                  const url = `http${cookie.secure ? 's' : ''}://${cookie.domain}${cookie.path ?? '/'}`
                  console.log(
                    `[ElectronSession] Copying cookie: ${cookie.name} for ${cookie.domain}` +
                      (cookie.expirationDate
                        ? ` (expires: ${new Date(cookie.expirationDate * 1000).toISOString()})`
                        : ' (session cookie)')
                  )

                  try {
                    // For session cookies (no expirationDate), set a long expiration
                    // to persist them across app restarts. Session cookies would otherwise
                    // be lost when the app closes.
                    let expirationDate = cookie.expirationDate

                    if (!expirationDate) {
                      // Set session cookies to expire in 30 days
                      const thirtyDaysFromNow = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30
                      expirationDate = thirtyDaysFromNow
                      console.log(
                        `[ElectronSession] Converting session cookie ${cookie.name} to persistent (30 days)`
                      )
                    }

                    await targetSession.cookies.set({
                      url,
                      name: cookie.name,
                      value: cookie.value,
                      domain: cookie.domain,
                      path: cookie.path,
                      secure: cookie.secure,
                      httpOnly: cookie.httpOnly,
                      expirationDate: expirationDate,
                    })
                    return { success: true, cookie: cookie.name }
                  } catch (err) {
                    console.error(
                      `[ElectronSession] Failed to copy cookie ${cookie.name}:`,
                      err
                    )
                    return { success: false, cookie: cookie.name, error: err }
                  }
                })
              )

              const succeeded = results.filter(r => r.status === 'fulfilled').length
              const failed = results.filter(r => r.status === 'rejected').length
              console.log(
                `[ElectronSession] Cookie copy results: ${succeeded} succeeded, ${failed} failed`
              )

              if (failed > 0) {
                console.warn(`[ElectronSession] Some cookies failed to copy`)
              }
            },
            catch: error =>
              new Error(
                `Failed to copy cookies: ${error instanceof Error ? error.message : String(error)}`
              ),
          })
        })

      return {
        getSession,
        getCookies,
        hasAnyCookies,
        clearCookies,
        clearSessionData,
        copyCookies,
      } as const
    }),
  }
) {}
