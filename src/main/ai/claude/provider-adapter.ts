import { Effect } from 'effect'
import type {
  AiProviderAdapter,
  AiUsageEffect,
} from '../ports'
import {
  AiProviderSignInResult,
  AiProviderAuthStatus,
  AiUsageMetric,
  AiUsageSnapshot,
  AiAccount,
} from '../../../shared/schemas/ai/provider'

export class ClaudeProviderAdapter extends Effect.Service<ClaudeProviderAdapter>()(
  'ClaudeProviderAdapter',
  {
    effect: Effect.sync(() => {
      const adapter: AiProviderAdapter = {
        provider: 'claude',
        supportsUsage: true,

        signIn: () =>
          Effect.sync(() => {
            const accountId = AiAccount.makeAccountId('claude', 'default')
            return new AiProviderSignInResult({
              provider: 'claude',
              accountId,
              label: 'Claude CLI',
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
                provider: 'claude',
                accountId,
                authenticated: true,
              })
          ),

        getUsage: ((accountId) =>
          Effect.sync(() => {
            const metrics = [
              new AiUsageMetric({
                toolId: 'cli.workspace',
                toolName: 'Workspace Agent',
                used: 18,
                limit: 40,
                usagePercentage: 45,
                unit: 'sessions',
              }),
              new AiUsageMetric({
                toolId: 'cli.review',
                toolName: 'Code Review',
                used: 6,
                limit: 20,
                usagePercentage: 30,
                unit: 'reviews',
              }),
            ]

            return new AiUsageSnapshot({
              provider: 'claude',
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
