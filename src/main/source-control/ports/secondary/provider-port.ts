import { Effect } from 'effect'
import { Data } from 'effect'
import { AccountId, ProviderType } from '../../../../shared/schemas/account-context'
import { Redacted } from 'effect'

/**
 * ProviderRepository - Repository metadata from provider API
 */
export class ProviderRepository extends Data.TaggedClass('ProviderRepository')<{
  id: string // Provider-specific ID
  owner: string
  name: string
  fullName: string // e.g., "owner/repo"
  description?: string
  isPrivate: boolean
  isFork: boolean
  defaultBranch: string
  cloneUrl: string
  sshUrl?: string
  language?: string
  stars?: number
  forks?: number
  updatedAt: Date
}> {}

/**
 * ProviderBranch - Branch metadata from provider API
 */
export class ProviderBranch extends Data.TaggedClass('ProviderBranch')<{
  name: string
  commit: {
    sha: string
    message: string
    author: string
    date: Date
  }
  isProtected: boolean
}> {}

/**
 * ProviderPullRequest - Pull request metadata from provider API
 */
export class ProviderPullRequest extends Data.TaggedClass('ProviderPullRequest')<{
  id: number
  number: number
  title: string
  body?: string
  state: 'open' | 'closed' | 'merged'
  author: string
  headBranch: string
  baseBranch: string
  createdAt: Date
  updatedAt: Date
  mergedAt?: Date
}> {}

/**
 * ProviderCommit - Commit metadata from provider API
 */
export class ProviderCommit extends Data.TaggedClass('ProviderCommit')<{
  sha: string
  message: string
  author: {
    name: string
    email: string
    date: Date
  }
  committer: {
    name: string
    email: string
    date: Date
  }
  parents: string[]
  url: string
}> {}

/**
 * ProviderUser - User information from provider
 */
export class ProviderUser extends Data.TaggedClass('ProviderUser')<{
  id: string
  username: string
  name?: string
  email?: string
  avatarUrl?: string
}> {}

/**
 * Provider API errors
 */
export class ProviderAuthenticationError extends Data.TaggedError('ProviderAuthenticationError')<{
  provider: ProviderType
  accountId: AccountId
  reason: string
}> {}

export class ProviderApiError extends Data.TaggedError('ProviderApiError')<{
  provider: ProviderType
  endpoint: string
  statusCode?: number
  message: string
  cause?: unknown
}> {}

export class ProviderRateLimitError extends Data.TaggedError('ProviderRateLimitError')<{
  provider: ProviderType
  resetAt?: Date
  limit: number
  remaining: number
}> {}

export class ProviderNotFoundError extends Data.TaggedError('ProviderNotFoundError')<{
  provider: ProviderType
  resource: string
  identifier: string
}> {}

/**
 * ProviderPort - Secondary port for online provider integration
 *
 * This port abstracts interactions with Git hosting providers (GitHub, GitLab, Bitbucket).
 * It provides a unified interface for:
 * - Repository metadata
 * - Branch information
 * - Pull request operations
 * - Authentication
 *
 * Adapters:
 * - GitHubProviderAdapter: GitHub API implementation
 * - GitLabProviderAdapter: GitLab API implementation (future)
 * - BitbucketProviderAdapter: Bitbucket API implementation (future)
 */
export interface ProviderPort {
  /**
   * Get the provider type
   */
  readonly type: ProviderType

  /**
   * Authenticate and get access token for the account
   */
  authenticate(
    accountId: AccountId
  ): Effect.Effect<Redacted.Redacted<string>, ProviderAuthenticationError>

  /**
   * Get authenticated user information
   */
  getCurrentUser(
    accountId: AccountId
  ): Effect.Effect<ProviderUser, ProviderAuthenticationError | ProviderApiError>

  /**
   * List repositories accessible by the account
   */
  listRepositories(
    accountId: AccountId,
    options?: {
      visibility?: 'all' | 'public' | 'private'
      affiliation?: 'owner' | 'collaborator' | 'organization_member'
      sort?: 'created' | 'updated' | 'pushed' | 'full_name'
      direction?: 'asc' | 'desc'
      perPage?: number
      page?: number
    }
  ): Effect.Effect<
    ProviderRepository[],
    ProviderAuthenticationError | ProviderApiError | ProviderRateLimitError
  >

  /**
   * Get repository metadata
   */
  getRepository(
    owner: string,
    repo: string,
    accountId?: AccountId
  ): Effect.Effect<
    ProviderRepository,
    | ProviderAuthenticationError
    | ProviderApiError
    | ProviderNotFoundError
    | ProviderRateLimitError
  >

  /**
   * List branches in a repository
   */
  listBranches(
    owner: string,
    repo: string,
    accountId?: AccountId
  ): Effect.Effect<
    ProviderBranch[],
    ProviderAuthenticationError | ProviderApiError | ProviderRateLimitError
  >

  /**
   * Get a specific branch
   */
  getBranch(
    owner: string,
    repo: string,
    branch: string,
    accountId?: AccountId
  ): Effect.Effect<
    ProviderBranch,
    | ProviderAuthenticationError
    | ProviderApiError
    | ProviderNotFoundError
    | ProviderRateLimitError
  >

  /**
   * List pull requests
   */
  listPullRequests(
    owner: string,
    repo: string,
    accountId: AccountId,
    options?: {
      state?: 'open' | 'closed' | 'all'
      sort?: 'created' | 'updated'
      direction?: 'asc' | 'desc'
    }
  ): Effect.Effect<
    ProviderPullRequest[],
    ProviderAuthenticationError | ProviderApiError | ProviderRateLimitError
  >

  /**
   * Get a specific pull request
   */
  getPullRequest(
    owner: string,
    repo: string,
    number: number,
    accountId: AccountId
  ): Effect.Effect<
    ProviderPullRequest,
    | ProviderAuthenticationError
    | ProviderApiError
    | ProviderNotFoundError
    | ProviderRateLimitError
  >

  /**
   * Create a pull request
   */
  createPullRequest(
    owner: string,
    repo: string,
    data: {
      title: string
      body?: string
      head: string
      base: string
    },
    accountId: AccountId
  ): Effect.Effect<
    ProviderPullRequest,
    ProviderAuthenticationError | ProviderApiError | ProviderRateLimitError
  >

  /**
   * Get commit information
   */
  getCommit(
    owner: string,
    repo: string,
    sha: string,
    accountId?: AccountId
  ): Effect.Effect<
    ProviderCommit,
    | ProviderAuthenticationError
    | ProviderApiError
    | ProviderNotFoundError
    | ProviderRateLimitError
  >

  /**
   * Compare two commits/branches
   */
  compareCommits(
    owner: string,
    repo: string,
    base: string,
    head: string,
    accountId?: AccountId
  ): Effect.Effect<
    {
      aheadBy: number
      behindBy: number
      commits: ProviderCommit[]
    },
    ProviderAuthenticationError | ProviderApiError | ProviderRateLimitError
  >
}

/**
 * Tag for dependency injection
 */
export const ProviderPort = Effect.Tag<ProviderPort>('ProviderPort')

/**
 * ProviderFactory - Factory for creating provider adapters
 *
 * Allows getting the appropriate provider adapter based on ProviderType.
 */
export interface ProviderFactory {
  /**
   * Get a provider adapter for the specified type
   */
  getProvider(type: ProviderType): Effect.Effect<ProviderPort, ProviderNotSupportedError>

  /**
   * Get all supported provider types
   */
  getSupportedProviders(): ProviderType[]
}

/**
 * Error when provider type is not supported
 */
export class ProviderNotSupportedError extends Data.TaggedError('ProviderNotSupportedError')<{
  providerType: string
  supportedProviders: string[]
}> {}

/**
 * Tag for dependency injection
 */
export const ProviderFactory = Effect.Tag<ProviderFactory>('ProviderFactory')
