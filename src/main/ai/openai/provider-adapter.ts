import { Effect } from 'effect'
import type {
  AiProviderAdapter,
  AiUsageEffect,
} from '../ports'
import {
  AiProviderSignInResult,
  AiProviderAuthStatus,
  AiUsageSnapshot,
  AiUsageMetric,
  AiAccount,
} from '../../../shared/schemas/ai/provider'

export class OpenAiProviderAdapter extends Effect.Service<OpenAiProviderAdapter>()(
  'OpenAiProviderAdapter',
  {
    effect: Effect.sync(() => {
      const adapter: AiProviderAdapter = {
        provider: 'openai',
        supportsUsage: true,

        signIn: () =>
          Effect.sync(() => {
            const accountId = AiAccount.makeAccountId('openai', 'default')
            return new AiProviderSignInResult({
              provider: 'openai',
              accountId,
              label: 'OpenAI CLI',
              metadata: {
                accountIdentifier: 'default',
              },
            })
          }),

        signOut: () => Effect.void,

        checkAuth: (accountId) =>
          Effect.sync(
            () =>
              new AiProviderAuthStatus({
                provider: 'openai',
                accountId,
                authenticated: true,
              })
          ),

        getUsage: ((accountId) =>
          Effect.sync(() => {
            const metrics = [
              new AiUsageMetric({
                toolId: 'cli.generate',
                toolName: 'CLI Generate',
                used: 4200,
                limit: 10000,
                usagePercentage: 42,
                unit: 'tokens',
              }),
              new AiUsageMetric({
                toolId: 'cli.plan',
                toolName: 'CLI Planner',
                used: 12,
                limit: 50,
                usagePercentage: 24,
                unit: 'invocations',
              }),
              new AiUsageMetric({
                toolId: 'cli.summarize',
                toolName: 'CLI Summaries',
                used: 80,
                limit: 100,
                usagePercentage: 80,
                unit: 'requests',
              }),
            ]

            return new AiUsageSnapshot({
              provider: 'openai',
              accountId,
              capturedAt: new Date(),
              metrics,
            })
          })) satisfies AiUsageEffect,
      }

      return adapter
    }),
  }
) {}
