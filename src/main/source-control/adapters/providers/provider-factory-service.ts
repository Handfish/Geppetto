import { Effect } from 'effect'
import {
  ProviderPort,
  ProviderFactory as IProviderFactory,
  ProviderNotSupportedError,
} from '../../ports/secondary/provider-port'
import { ProviderType } from '../../../../shared/schemas/account-context'
import { GitHubProviderAdapter } from './github-provider-adapter'

/**
 * ProviderFactoryService
 *
 * Factory service for creating and managing provider adapters.
 * Currently supports GitHub, with extensibility for GitLab, Bitbucket, etc.
 *
 * Architecture:
 * - Lazy initialization of provider adapters
 * - Single instance per provider type (cached)
 * - Type-safe provider resolution
 *
 * Usage:
 * ```typescript
 * const factory = yield* ProviderFactoryService
 * const githubProvider = yield* factory.getProvider('github')
 * const repos = yield* githubProvider.listRepositories(accountId)
 * ```
 *
 * Future Extensions:
 * - GitLabProviderAdapter for GitLab support
 * - BitbucketProviderAdapter for Bitbucket support
 * - AzureDevOpsProviderAdapter for Azure DevOps
 */
export class ProviderFactoryService extends Effect.Service<ProviderFactoryService>()(
  'ProviderFactoryService',
  {
    effect: Effect.gen(function* () {
      const githubAdapter = yield* GitHubProviderAdapter

      /**
       * Map of provider type to adapter instance
       * Currently only GitHub is supported
       */
      const providers = new Map<ProviderType, ProviderPort>([
        ['github', githubAdapter],
      ])

      /**
       * Factory implementation
       */
      const factory: IProviderFactory = {
        /**
         * Get a provider adapter for the specified type
         */
        getProvider: (type: ProviderType) =>
          Effect.gen(function* () {
            const provider = providers.get(type)

            if (!provider) {
              return yield* Effect.fail(
                new ProviderNotSupportedError({
                  providerType: type,
                  supportedProviders: Array.from(providers.keys()),
                })
              )
            }

            return provider
          }),

        /**
         * Get all supported provider types
         */
        getSupportedProviders: () => Array.from(providers.keys()),
      }

      return factory
    }),
    dependencies: [GitHubProviderAdapter.Default],
  }
) {}

/**
 * Alternative export name for consistency with port interface
 */
export { ProviderFactoryService as ProviderFactory }
