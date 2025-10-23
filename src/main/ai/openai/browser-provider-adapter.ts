import { Effect } from 'effect'
import type { AiProviderAdapter } from '../ports'
import {
  AiProviderSignInResult,
  AiProviderAuthStatus,
  AiUsageSnapshot,
  AiAccount,
} from '../../../shared/schemas/ai/provider'
import { AiProviderUsageError, AiProviderAuthenticationError } from '../errors'
import { UsagePageError } from '../usage-page/ports'
import { BrowserAuthService, type BrowserAuthConfig } from '../browser/browser-auth-service'
import { CookieUsagePageAdapter } from '../browser/cookie-usage-page-adapter'
import { usageBarsToMetrics } from '../usage-page/usage-metric-utils'

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
 * OpenAI provider adapter using browser-based cookie authentication.
 */
export class OpenAiBrowserProviderAdapter extends Effect.Service<OpenAiBrowserProviderAdapter>()(
  'OpenAiBrowserProviderAdapter',
  {
    dependencies: [BrowserAuthService.Default, CookieUsagePageAdapter.Default],
    effect: Effect.gen(function* () {
      const browserAuth = yield* BrowserAuthService
      const usagePage = yield* CookieUsagePageAdapter

      const adapter: AiProviderAdapter = {
        provider: PROVIDER,
        supportsUsage: true,

        signIn: () =>
          Effect.gen(function* () {
            // Generate unique identifier for this account
            // Since OpenAI doesn't expose account IDs easily, we use timestamp-based identifier
            const identifier = `user-${Date.now()}`

            // Open browser window for authentication
            const authResult = yield* browserAuth.authenticate(
              {
                provider: PROVIDER,
                ...OPENAI_AUTH_CONFIG,
              },
              identifier
            )

            const accountId = AiAccount.makeAccountId(PROVIDER, authResult.identifier)

            return new AiProviderSignInResult({
              provider: PROVIDER,
              accountId,
              label: 'OpenAI Account',
              metadata: {
                accountIdentifier: authResult.identifier,
              },
            })
          }).pipe(
            Effect.mapError(
              error =>
                new AiProviderAuthenticationError({
                  provider: PROVIDER,
                  message: error instanceof Error ? error.message : 'Authentication failed',
                })
            )
          ),

        signOut: () => Effect.void,

        checkAuth: accountId =>
          Effect.gen(function* () {
            const { identifier } = AiAccount.parseAccountId(accountId)
            const authenticated = yield* browserAuth.isAuthenticated(PROVIDER, identifier)

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
                  message: error instanceof Error ? error.message : 'Failed to check authentication',
                })
            )
          ),

        getUsage: accountId =>
          Effect.gen(function* () {
            const snapshot = yield* usagePage.fetchUsagePage(PROVIDER, accountId)

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
