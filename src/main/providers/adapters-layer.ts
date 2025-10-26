import { Layer } from 'effect'
import { GitHubBrowserProviderAdapter } from '../github/browser-provider-adapter'
import { GitLabBrowserProviderAdapter } from '../gitlab/browser-provider-adapter'
import { BitbucketBrowserProviderAdapter } from '../bitbucket/browser-provider-adapter'
import { GiteaBrowserProviderAdapter } from '../gitea/browser-provider-adapter'

/**
 * VcsAdaptersLayer - Hexagonal Architecture Adapter Layer
 *
 * This layer composes all VCS provider adapters (GitHub, GitLab, Bitbucket, Gitea, etc.)
 * following the Effectful Ports pattern from docs/effect_ports_migration_guide.md
 *
 * Benefits of this architecture:
 * - **Hot-swappable**: Can replace any adapter at runtime for testing/mocking
 * - **Multi-provider**: Multiple providers can coexist (GitHub + GitLab + Bitbucket)
 * - **Isolated**: Each adapter is independent and can be tested in isolation
 * - **Type-safe**: All adapters implement the same VcsProviderPort contract
 *
 * Example hot-swapping for tests:
 * ```typescript
 * const MockGitHubAdapter = Layer.succeed(
 *   VcsProviderTags.getOrCreate('github'),
 *   {
 *     provider: 'github',
 *     supportsRepositories: true,
 *     signIn: () => Effect.succeed(mockSignInResult),
 *     // ... other mocked methods
 *   }
 * )
 *
 * const TestLayer = VcsAdaptersLayer.pipe(
 *   Layer.provide(MockGitHubAdapter) // Override just GitHub
 * )
 * ```
 *
 * Example accessing multiple providers simultaneously:
 * ```typescript
 * Effect.gen(function* () {
 *   const registry = yield* ProviderRegistryService
 *
 *   // Get all available providers
 *   const adapters = yield* registry.listAdapters()
 *
 *   // Fetch repositories from all providers concurrently
 *   const allRepos = yield* Effect.forEach(
 *     adapters,
 *     adapter => adapter.getRepositories(getAccountId(adapter.provider)),
 *     { concurrency: 'unbounded' }
 *   )
 *
 *   // Now you have repositories from all providers!
 *   return allRepos.flat()
 * }).pipe(Effect.provide(VcsAdaptersLayer))
 * ```
 */
export const VcsAdaptersLayer = Layer.mergeAll(
  GitHubBrowserProviderAdapter,
  GitLabBrowserProviderAdapter,
  BitbucketBrowserProviderAdapter,
  GiteaBrowserProviderAdapter
)
