import { Layer } from 'effect'
import { GitHubProviderAdapter } from './adapters/providers/github-provider-adapter'

/**
 * Source Control Providers Adapters Layer
 *
 * This layer composes all source control provider adapters (GitHub, GitLab, Bitbucket, etc.).
 * These are DIFFERENT from VCS provider adapters - VCS adapters are for account management,
 * while source control adapters are for repository operations and synchronization.
 *
 * Similar to AI/VCS providers pattern (multiple implementations per port):
 * - ProviderPort → GitHubProviderAdapter (active)
 *               → GitLabProviderAdapter (future)
 *               → BitbucketProviderAdapter (future)
 *
 * Unlike infrastructure adapters (single implementation per port):
 * - Requires ProviderFactoryService for dynamic selection
 * - Multiple implementations can run simultaneously
 * - Each provider has unique implementation
 *
 * Benefits of this architecture:
 * - **Multi-provider support**: GitHub, GitLab, Bitbucket simultaneously
 * - **Provider-agnostic**: Sync service works with any provider
 * - **Type-safe**: All providers implement ProviderPort interface
 * - **Isolated testing**: Each provider can be tested independently
 * - **Hot-swappable**: Replace providers for testing (MockGitHub, MockGitLab)
 *
 * Example usage with factory:
 * ```typescript
 * const factory = yield* ProviderFactoryService
 * const github = yield* factory.getProvider('github')
 * const repos = yield* github.listRepositories(accountId)
 * ```
 *
 * Example hot-swapping for tests:
 * ```typescript
 * const MockGitHubProvider = Layer.succeed(
 *   GitHubProviderAdapter,
 *   {
 *     type: 'github',
 *     authenticate: () => Effect.succeed(mockToken),
 *     listRepositories: () => Effect.succeed([mockRepo1, mockRepo2]),
 *     // ... other methods
 *   }
 * )
 *
 * const TestLayer = Layer.mergeAll(
 *   MockGitHubProvider,
 *   ProviderFactoryService.Default
 * )
 * ```
 */
export const SourceControlProvidersAdaptersLayer = Layer.mergeAll(
  GitHubProviderAdapter.Default
  // Future providers:
  // GitLabProviderAdapter.Default,
  // BitbucketProviderAdapter.Default,
)
