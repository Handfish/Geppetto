import { Effect, Layer } from 'effect'
import { ProviderPortFactory, ProviderNotSupportedError } from '../../../source-control/ports/secondary/provider-port'
import { GitHubProviderAdapter } from './github-provider-adapter'
import { GitHubApiService } from '../../../github/api-service'
import { GitHubHttpService } from '../../../github/http-service'
import { SecureStoreService } from '../../../github/store-service'
import { ProviderType } from '../../../../shared/schemas/account-context'

/**
 * VcsSourceControlAdaptersLayer
 *
 * This layer provides the source-control domain's ProviderPortFactory interface
 * using VCS domain implementations (GitHub, GitLab, Bitbucket adapters).
 *
 * Architecture:
 * - Source-control domain defines ProviderPortFactory (the interface)
 * - VCS domain provides implementations (the adapters)
 * - Dependency inversion: source-control depends on interface, VCS implements it
 *
 * CRITICAL: Follows Effect's constructor dependency pattern to avoid dependency leaks.
 * All dependencies (GitHubApiService, etc.) are yielded in the constructor, not in methods.
 *
 * This layer is registered in MainLayer to bridge the two domains via the port interface.
 *
 * Usage in MainLayer:
 * ```typescript
 * const MainLayer = Layer.mergeAll(
 *   // ... other layers
 *   VcsSourceControlAdaptersLayer,   // Provides ProviderPortFactory
 *   SyncService.Default,              // Consumes ProviderPortFactory
 * )
 * ```
 */
export const VcsSourceControlAdaptersLayer = Layer.effect(
  ProviderPortFactory,
  Effect.gen(function* () {
    // ✅ Yield dependencies in constructor (not in methods!)
    const githubApi = yield* GitHubApiService
    const httpService = yield* GitHubHttpService
    const storeService = yield* SecureStoreService

    // Create adapter instance in constructor with captured dependencies
    const githubAdapter = new GitHubProviderAdapter(githubApi, httpService, storeService)

    // Return the service implementation (plain object matching the interface)
    return {
      getProvider: (type: ProviderType) => {
        switch (type) {
          case 'github':
            // ✅ Use pre-constructed adapter, no yielding here
            return Effect.succeed(githubAdapter)

          case 'gitlab':
          case 'bitbucket':
          case 'gitea':
            return Effect.fail(
              new ProviderNotSupportedError({
                providerType: type,
                supportedProviders: ['github'],
              })
            )

          default:
            // TypeScript exhaustiveness check
            return Effect.fail(
              new ProviderNotSupportedError({
                providerType: type,
                supportedProviders: ['github'],
              })
            )
        }
      },
    }
  })
)

export { GitHubProviderAdapter }
