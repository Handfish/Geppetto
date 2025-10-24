import { Effect, pipe } from 'effect'
import type { AiProviderAdapter } from '../ports'
import {
  AiProviderSignInResult,
  AiProviderAuthStatus,
  AiUsageSnapshot,
  AiAccount,
} from '../../../shared/schemas/ai/provider'
import { AiProviderUsageError } from '../errors'
import type { AiProviderAuthenticationError } from '../errors'
import { UsagePageError } from '../usage-page/ports'
import { WebUsagePageAdapter } from '../usage-page/web-usage-page-adapter'
import { usageBarsToMetrics } from '../usage-page/usage-metric-utils'

const PROVIDER: 'openai' = 'openai'

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

export class OpenAiProviderAdapter extends Effect.Service<OpenAiProviderAdapter>()(
  'OpenAiProviderAdapter',
  {
    dependencies: [WebUsagePageAdapter.Default],
    effect: Effect.gen(function* () {
      const usagePage = yield* WebUsagePageAdapter

      const adapter: AiProviderAdapter = {
        provider: PROVIDER,
        supportsUsage: true,

        signIn: () =>
          Effect.sync(() => {
            const accountId = AiAccount.makeAccountId(PROVIDER, 'default')
            return new AiProviderSignInResult({
              provider: PROVIDER,
              accountId,
              label: 'OpenAI Usage',
              metadata: {
                accountIdentifier: 'default',
              },
            })
          }),

        signOut: () => Effect.void,

        checkAuth: accountId =>
          Effect.sync(
            () =>
              new AiProviderAuthStatus({
                provider: PROVIDER,
                accountId,
                authenticated: true,
              })
          ),

        getUsage: accountId =>
          pipe(
            usagePage.fetchUsagePage(PROVIDER),
            Effect.map(
              snapshot =>
                new AiUsageSnapshot({
                  provider: PROVIDER,
                  accountId,
                  capturedAt: snapshot.fetchedAt,
                  metrics: usageBarsToMetrics(snapshot.bars),
                })
            ),
            Effect.mapError(mapUsageError(accountId))
          ),
      }

      return adapter
    }),
  }
) {}
