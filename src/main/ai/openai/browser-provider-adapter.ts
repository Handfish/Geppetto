import { Effect, Console } from 'effect'
import type { AiProviderAdapter } from '../ports'
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

const PROVIDER: 'openai' = 'openai'

/**
 * OpenAI authentication configuration.
 * User signs in via browser, we detect when they reach the usage/settings page.
 */
const OPENAI_AUTH_CONFIG: Omit<BrowserAuthConfig, 'provider'> = {
  loginUrl: 'https://chatgpt.com/auth/login',
  successUrlPatterns: [
    /^https:\/\/chatgpt\.com\/$/,
    /^https:\/\/chatgpt\.com\/#settings/,
    /^https:\/\/chatgpt\.com\/settings/,
  ],
  width: 800,
  height: 900,
  title: 'Sign in to OpenAI',
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
 * Extract stable user identifier from OpenAI session.
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

    // Try to fetch user account data from OpenAI API
    const userIdentifier = yield* Effect.tryPromise({
      try: async () => {
        try {
          // Fetch account data from OpenAI API
          const response = await accountSession.fetch(
            'https://chatgpt.com/backend-api/accounts/check',
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
            // Extract email or account_id from response
            if (data.account?.account_user_email) {
              return data.account.account_user_email
            }
            if (data.account?.account_id) {
              return data.account.account_id
            }
          }
        } catch (apiError) {
          // If API call fails, log but don't fail completely
          console.log('[OpenAI] Could not fetch account data:', apiError)
        }

        // Fallback to timestamp-based identifier
        return identifier
      },
      catch: error =>
        new Error(
          `Failed to extract user identifier: ${error instanceof Error ? error.message : String(error)}`
        ),
    })

    yield* Console.log(`[OpenAI] Extracted user identifier: ${userIdentifier}`)
    return userIdentifier
  })

/**
 * OpenAI provider adapter using browser-based cookie authentication.
 */
export class OpenAiBrowserProviderAdapter extends Effect.Service<OpenAiBrowserProviderAdapter>()(
  'OpenAiBrowserProviderAdapter',
  {
    dependencies: [
      BrowserAuthService.Default,
      CookieUsagePageAdapter.Default,
      ElectronSessionService.Default,
    ],
    effect: Effect.gen(function* () {
      const browserAuth = yield* BrowserAuthService
      const usagePage = yield* CookieUsagePageAdapter
      const sessionService = yield* ElectronSessionService

      const adapter: AiProviderAdapter = {
        provider: PROVIDER,
        supportsUsage: true,

        signIn: () =>
          Effect.gen(function* () {
            // Generate temporary identifier for auth session
            const tempIdentifier = `user-${Date.now()}`
            yield* Console.log(
              `[OpenAI] Starting sign-in flow with temp identifier: ${tempIdentifier}`
            )

            // Open browser window for authentication
            const authResult = yield* browserAuth.authenticate(
              {
                provider: PROVIDER,
                ...OPENAI_AUTH_CONFIG,
              },
              tempIdentifier
            )

            yield* Console.log(
              `[OpenAI] Auth window closed, checking cookies for temp session...`
            )

            // Verify cookies exist in temp session
            const tempSession = yield* sessionService.getSession(
              PROVIDER,
              authResult.identifier
            )
            const tempHasCookies =
              yield* sessionService.hasAnyCookies(tempSession)
            yield* Console.log(
              `[OpenAI] Temp session has cookies: ${tempHasCookies}`
            )

            if (!tempHasCookies) {
              yield* Console.error(
                `[OpenAI] CRITICAL: No cookies found in temp session after auth!`
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
                  `[OpenAI] Failed to extract stable identifier, using temp: ${error}`
                ).pipe(
                  Effect.flatMap(() => Effect.succeed(authResult.identifier))
                )
              )
            )

            yield* Console.log(
              `[OpenAI] Using stable identifier for account: ${stableIdentifier}`
            )

            // If stable identifier is different from temp, migrate cookies
            if (stableIdentifier !== authResult.identifier) {
              yield* Console.log(
                `[OpenAI] Migrating cookies from temp session ${authResult.identifier} to stable session ${stableIdentifier}`
              )

              const stableSession = yield* sessionService.getSession(
                PROVIDER,
                stableIdentifier
              )

              // Check stable session before migration
              const stableHasCookiesBefore =
                yield* sessionService.hasAnyCookies(stableSession)
              yield* Console.log(
                `[OpenAI] Stable session has cookies before migration: ${stableHasCookiesBefore}`
              )

              // Copy cookies from temp session to stable session
              yield* sessionService
                .copyCookies(tempSession, stableSession)
                .pipe(
                  Effect.tap(() =>
                    Console.log(
                      `[OpenAI] Successfully copied cookies to stable session`
                    )
                  ),
                  Effect.catchAll(error => {
                    // Log error but don't fail - cookies might already be there
                    return Console.error(
                      `[OpenAI] Failed to copy cookies: ${error}`
                    )
                  })
                )

              // Verify cookies were copied
              const stableHasCookiesAfter =
                yield* sessionService.hasAnyCookies(stableSession)
              yield* Console.log(
                `[OpenAI] Stable session has cookies after migration: ${stableHasCookiesAfter}`
              )

              if (!stableHasCookiesAfter) {
                yield* Console.error(
                  `[OpenAI] CRITICAL: Cookie migration failed! Stable session has no cookies`
                )
              }

              // Clean up temp session
              yield* sessionService.clearSessionData(tempSession).pipe(
                Effect.tap(() =>
                  Console.log(`[OpenAI] Cleaned up temp session`)
                ),
                Effect.catchAll(error => {
                  return Console.error(
                    `[OpenAI] Failed to clear temp session: ${error}`
                  )
                })
              )
            } else {
              yield* Console.log(
                `[OpenAI] Using temp session as stable session (no migration needed)`
              )
            }

            const accountId = AiAccount.makeAccountId(
              PROVIDER,
              stableIdentifier
            )
            yield* Console.log(`[OpenAI] Created account ID: ${accountId}`)

            // Verify final session has cookies
            const finalSession = yield* sessionService.getSession(
              PROVIDER,
              stableIdentifier
            )
            const finalHasCookies =
              yield* sessionService.hasAnyCookies(finalSession)
            yield* Console.log(
              `[OpenAI] Final session (${stableIdentifier}) has cookies: ${finalHasCookies}`
            )

            if (!finalHasCookies) {
              yield* Console.error(
                `[OpenAI] CRITICAL: Final session has no cookies before returning!`
              )
            }

            return new AiProviderSignInResult({
              provider: PROVIDER,
              accountId,
              label: 'OpenAI Account',
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
              `[OpenAI] Checking auth for account: ${accountId}`
            )
            const { identifier } = AiAccount.parseAccountId(accountId)
            yield* Console.log(`[OpenAI] Parsed identifier: ${identifier}`)

            const authenticated = yield* browserAuth.isAuthenticated(
              PROVIDER,
              identifier
            )
            yield* Console.log(
              `[OpenAI] Account ${accountId} authenticated: ${authenticated}`
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
    }),
  }
) {}
