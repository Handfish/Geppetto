import { Effect, Context } from 'effect'
import type {
  AccountId,
  ProviderType,
} from '../../shared/schemas/account-context'
import type {
  ProviderAuthStatus,
  ProviderRepository,
  ProviderSignInResult,
} from '../../shared/schemas/provider'
import type {
  ProviderAuthenticationError,
  ProviderFeatureUnsupportedError,
  ProviderNotRegisteredError,
  ProviderRepositoryError,
} from './errors'

/**
 * VcsProviderPort - Hexagonal Architecture Port
 *
 * This is the contract that ALL VCS provider adapters must implement.
 * Following the Effectful Ports pattern from docs/effect_ports_migration_guide.md
 *
 * Each provider (GitHub, GitLab, Bitbucket, Gitea, etc.) will be implemented as a Layer
 * that can be hot-swapped at runtime.
 */
export interface VcsProviderPort {
  readonly provider: ProviderType
  readonly supportsRepositories: boolean
  readonly supportsIssues: boolean
  readonly supportsPullRequests: boolean

  signIn(): Effect.Effect<
    ProviderSignInResult,
    ProviderAuthenticationError | ProviderFeatureUnsupportedError
  >

  signOut(
    accountId: AccountId
  ): Effect.Effect<
    void,
    ProviderAuthenticationError | ProviderFeatureUnsupportedError
  >

  checkAuth(
    accountId: AccountId
  ): Effect.Effect<
    ProviderAuthStatus,
    ProviderAuthenticationError | ProviderFeatureUnsupportedError
  >

  getRepositories(
    accountId: AccountId
  ): Effect.Effect<
    ReadonlyArray<ProviderRepository>,
    | ProviderRepositoryError
    | ProviderFeatureUnsupportedError
    | ProviderAuthenticationError
  >
}

/**
 * Create a tagged service for a specific VCS provider.
 * This allows us to have multiple provider instances in the same context.
 *
 * Usage:
 * ```typescript
 * const GitHubProviderTag = makeVcsProviderService('github')
 * const GitLabProviderTag = makeVcsProviderService('gitlab')
 * ```
 */
export const makeVcsProviderService = (provider: ProviderType) => {
  return Context.GenericTag<VcsProviderPort>(`VcsProvider:${provider}`)
}

/**
 * Registry of all VCS provider tags.
 * This allows us to retrieve the correct service tag by provider type.
 */
export class VcsProviderTags {
  private static tags = new Map<ProviderType, Context.Tag<VcsProviderPort, VcsProviderPort>>()

  static register(provider: ProviderType): Context.Tag<VcsProviderPort, VcsProviderPort> {
    const existing = this.tags.get(provider)
    if (existing) return existing

    const tag = makeVcsProviderService(provider)
    this.tags.set(provider, tag)
    return tag
  }

  static get(provider: ProviderType): Context.Tag<VcsProviderPort, VcsProviderPort> | undefined {
    return this.tags.get(provider)
  }

  static getOrCreate(provider: ProviderType): Context.Tag<VcsProviderPort, VcsProviderPort> {
    return this.get(provider) ?? this.register(provider)
  }

  static all(): ReadonlyArray<Context.Tag<VcsProviderPort, VcsProviderPort>> {
    return Array.from(this.tags.values())
  }
}

/**
 * Registry port used by the application layer to resolve adapters.
 */
export interface VcsProviderRegistryPort {
  getAdapter(
    provider: ProviderType
  ): Effect.Effect<VcsProviderPort, ProviderNotRegisteredError, never>
  listAdapters(): Effect.Effect<ReadonlyArray<VcsProviderPort>, never, never>
}
