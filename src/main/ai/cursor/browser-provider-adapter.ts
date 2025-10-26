import { Effect, Console, Layer } from 'effect'
import type { AiProviderPort } from '../provider-port'
import { AiProviderTags } from '../provider-port'
import {
  AiProviderSignInResult,
  AiProviderAuthStatus,
  AiUsageSnapshot,
  AiAccount,
} from '../../../shared/schemas/ai/provider'
import { AiProviderUsageError, AiProviderAuthenticationError } from '../errors'
import { UsagePageError } from '../usage-page/ports'
import {
  BrowserAuthService,
  type BrowserAuthConfig,
} from '../browser/browser-auth-service'
import { CookieUsagePageAdapter } from '../browser/cookie-usage-page-adapter'
import { usageBarsToMetrics } from '../usage-page/usage-metric-utils'
import { ElectronSessionService } from '../browser/electron-session-service'
import { AiInfrastructureLayer } from '../infrastructure-layer'

const PROVIDER: 'cursor' = 'cursor'

/**
 * Cursor authentication configuration.
 * User signs in via browser, we detect when they reach the usage dashboard.
 */
const CURSOR_AUTH_CONFIG: Omit<BrowserAuthConfig, 'provider'> = {
  loginUrl: 'https://cursor.com/login',
  successUrlPatterns: [
    /^https:\/\/cursor\.com\/$/,
    /^https:\/\/cursor\.com\/dashboard/,
    /^https:\/\/cursor\.com\/dashboard\?tab=usage/,
    /^https:\/\/cursor\.com\/settings/,
  ],
  width: 800,
  height: 900,
  title: 'Sign in to Cursor',
}

const mapUsageError =
  (accountId: AiAccount['id']) =>
  (error: unknown): AiProviderUsageError | AiProviderAuthenticationError => {
    if (error instanceof UsagePageError) {
      return new AiProviderUsageError({
        provider: PROVIDER,
        accountId,
        message: error.message,
      })
    }

    return error as AiProviderAuthenticationError
  }

/**
 * Extract stable user identifier from Cursor session.
 * Tries to get user email or account ID from the authenticated session.
 */
const extractUserIdentifier = (
  identifier: string
): Effect.Effect<string, Error, ElectronSessionService> =>
  Effect.gen(function* () {
    const sessionService = yield* ElectronSessionService
    const accountSession = yield* sessionService.getSession(
      PROVIDER,
      identifier
    )

    // Try to fetch user account data from Cursor API
    const userIdentifier = yield* Effect.tryPromise({
      try: async () => {
        try {
          // Fetch account data from Cursor API
          const response = await accountSession.fetch(
            'https://cursor.com/api/user',
            {
              headers: {
                'User-Agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                Accept: 'application/json',
              },
            }
          )

          if (response.ok) {
            const data = await response.json()
            // Extract email or user_id from response
            if (data.email) {
              return data.email
            }
            if (data.user_id) {
              return data.user_id
            }
            if (data.id) {
              return data.id
            }
          }
        } catch (apiError) {
          // If API call fails, log but don't fail completely
          console.log('[Cursor] Could not fetch account data:', apiError)
        }

        // Fallback to timestamp-based identifier
        return identifier
      },
      catch: error =>
        new Error(
          `Failed to extract user identifier: ${error instanceof Error ? error.message : String(error)}`
        ),
    })

    yield* Console.log(`[Cursor] Extracted user identifier: ${userIdentifier}`)
    return userIdentifier
  })

/**
 * Cursor provider adapter using browser-based cookie authentication.
 *
 * HEXAGONAL ARCHITECTURE: This is an ADAPTER implementation of the AiProviderPort.
 * It can be hot-swapped with other implementations (mock, test, alternative auth, etc.)
 */

// Register the provider tag
const CursorProviderTag = AiProviderTags.register(PROVIDER)

/**
 * Live implementation of Cursor provider adapter as a Layer.
 * This Layer provides the AiProviderPort for Cursor.
 */
export const CursorBrowserProviderAdapter = Layer.effect(
  CursorProviderTag,
  Effect.gen(function* () {
    const browserAuth = yield* BrowserAuthService
    const usagePage = yield* CookieUsagePageAdapter
    const sessionService = yield* ElectronSessionService

    const adapter: AiProviderPort = {
        provider: PROVIDER,
        supportsUsage: true,

        signIn: () =>
          Effect.gen(function* () {
            // Generate temporary identifier for auth session
            const tempIdentifier = `user-${Date.now()}`
            yield* Console.log(
              `[Cursor] Starting sign-in flow with temp identifier: ${tempIdentifier}`
            )

            // Open browser window for authentication
            const authResult = yield* browserAuth.authenticate(
              {
                provider: PROVIDER,
                ...CURSOR_AUTH_CONFIG,
              },
              tempIdentifier
            )

            yield* Console.log(
              `[Cursor] Auth window closed, checking cookies for temp session...`
            )

            // Verify cookies exist in temp session
            const tempSession = yield* sessionService.getSession(
              PROVIDER,
              authResult.identifier
            )
            const tempHasCookies =
              yield* sessionService.hasAnyCookies(tempSession)
            yield* Console.log(
              `[Cursor] Temp session has cookies: ${tempHasCookies}`
            )

            if (!tempHasCookies) {
              yield* Console.error(
                `[Cursor] CRITICAL: No cookies found in temp session after auth!`
              )
            }

            // Extract stable user identifier (email or account ID)
            const stableIdentifier = yield* extractUserIdentifier(
              authResult.identifier
            ).pipe(
              Effect.provide(ElectronSessionService.Default),
              // If extraction fails, use the temp identifier
              Effect.catchAll(error =>
                Console.log(
                  `[Cursor] Failed to extract stable identifier, using temp: ${error}`
                ).pipe(
                  Effect.flatMap(() => Effect.succeed(authResult.identifier))
                )
              )
            )

            yield* Console.log(
              `[Cursor] Using stable identifier for account: ${stableIdentifier}`
            )

            // If stable identifier is different from temp, migrate cookies
            if (stableIdentifier !== authResult.identifier) {
              yield* Console.log(
                `[Cursor] Migrating cookies from temp session ${authResult.identifier} to stable session ${stableIdentifier}`
              )

              const stableSession = yield* sessionService.getSession(
                PROVIDER,
                stableIdentifier
              )

              // Check stable session before migration
              const stableHasCookiesBefore =
                yield* sessionService.hasAnyCookies(stableSession)
              yield* Console.log(
                `[Cursor] Stable session has cookies before migration: ${stableHasCookiesBefore}`
              )

              // Copy cookies from temp session to stable session
              yield* sessionService
                .copyCookies(tempSession, stableSession)
                .pipe(
                  Effect.tap(() =>
                    Console.log(
                      `[Cursor] Successfully copied cookies to stable session`
                    )
                  ),
                  Effect.catchAll(error => {
                    // Log error but don't fail - cookies might already be there
                    return Console.error(
                      `[Cursor] Failed to copy cookies: ${error}`
                    )
                  })
                )

              // Verify cookies were copied
              const stableHasCookiesAfter =
                yield* sessionService.hasAnyCookies(stableSession)
              yield* Console.log(
                `[Cursor] Stable session has cookies after migration: ${stableHasCookiesAfter}`
              )

              if (!stableHasCookiesAfter) {
                yield* Console.error(
                  `[Cursor] CRITICAL: Cookie migration failed! Stable session has no cookies`
                )
              }

              // Clean up temp session
              yield* sessionService.clearSessionData(tempSession).pipe(
                Effect.tap(() =>
                  Console.log(`[Cursor] Cleaned up temp session`)
                ),
                Effect.catchAll(error => {
                  return Console.error(
                    `[Cursor] Failed to clear temp session: ${error}`
                  )
                })
              )
            } else {
              yield* Console.log(
                `[Cursor] Using temp session as stable session (no migration needed)`
              )
            }

            const accountId = AiAccount.makeAccountId(
              PROVIDER,
              stableIdentifier
            )
            yield* Console.log(`[Cursor] Created account ID: ${accountId}`)

            // Verify final session has cookies
            const finalSession = yield* sessionService.getSession(
              PROVIDER,
              stableIdentifier
            )
            const finalHasCookies =
              yield* sessionService.hasAnyCookies(finalSession)
            yield* Console.log(
              `[Cursor] Final session (${stableIdentifier}) has cookies: ${finalHasCookies}`
            )

            if (!finalHasCookies) {
              yield* Console.error(
                `[Cursor] CRITICAL: Final session has no cookies before returning!`
              )
            }

            return new AiProviderSignInResult({
              provider: PROVIDER,
              accountId,
              label: 'Cursor Account',
              metadata: {
                accountIdentifier: stableIdentifier,
              },
            })
          }).pipe(
            Effect.mapError(
              error =>
                new AiProviderAuthenticationError({
                  provider: PROVIDER,
                  message:
                    error instanceof Error
                      ? error.message
                      : 'Authentication failed',
                })
            )
          ),

        signOut: () => Effect.void,

        checkAuth: accountId =>
          Effect.gen(function* () {
            yield* Console.log(
              `[Cursor] Checking auth for account: ${accountId}`
            )
            const { identifier } = AiAccount.parseAccountId(accountId)
            yield* Console.log(`[Cursor] Parsed identifier: ${identifier}`)

            const authenticated = yield* browserAuth.isAuthenticated(
              PROVIDER,
              identifier
            )
            yield* Console.log(
              `[Cursor] Account ${accountId} authenticated: ${authenticated}`
            )

            return new AiProviderAuthStatus({
              provider: PROVIDER,
              accountId,
              authenticated,
            })
          }).pipe(
            Effect.mapError(
              error =>
                new AiProviderAuthenticationError({
                  provider: PROVIDER,
                  message:
                    error instanceof Error
                      ? error.message
                      : 'Failed to check authentication',
                })
            )
          ),

        getUsage: accountId =>
          Effect.gen(function* () {
            const snapshot = yield* usagePage.fetchUsagePage(
              PROVIDER,
              accountId
            )

            return new AiUsageSnapshot({
              provider: PROVIDER,
              accountId,
              capturedAt: snapshot.fetchedAt,
              metrics: usageBarsToMetrics(snapshot.bars),
            })
          }).pipe(Effect.mapError(mapUsageError(accountId))),
    }

    return adapter
  })
).pipe(
  Layer.provide(AiInfrastructureLayer)  // Shared infrastructure - memoized by reference
)
