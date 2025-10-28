import { Effect, Layer } from 'effect'
import type { VcsProviderPort } from '../provider-port'
import { VcsProviderTags } from '../provider-port'
import {
  ProviderAuthStatus,
  ProviderRepository,
  ProviderSignInResult,
  ProviderUser,
} from '../../../shared/schemas/provider'
import {
  ProviderAuthenticationError,
  ProviderFeatureUnsupportedError,
  ProviderRepositoryError,
} from '../errors'
import { GitHubAuthService } from '../../github/auth-service'
import { GitHubApiService } from '../../github/api-service'
import {
  GitHubAuthError,
  GitHubTokenExchangeError,
  GitHubApiError,
  NotAuthenticatedError,
} from '../../github/errors'
import type { GitHubRepository } from '../../../shared/schemas'
import type { AccountId } from '../../../shared/schemas/account-context'
import { AccountLimitExceededError } from '../../tier/tier-service'

const PROVIDER: 'github' = 'github'

/**
 * Map GitHub domain errors to Provider port errors
 * This preserves the hexagonal architecture by translating domain-specific
 * errors to port-defined errors at the adapter boundary
 */
const mapGitHubAuthErrorToProviderError = (
  error: unknown
): ProviderAuthenticationError | ProviderFeatureUnsupportedError => {
  if (error instanceof GitHubAuthError) {
    return new ProviderAuthenticationError({
      provider: PROVIDER,
      message: error.message,
    })
  }
  if (error instanceof GitHubTokenExchangeError) {
    return new ProviderAuthenticationError({
      provider: PROVIDER,
      message: `Token exchange failed: ${error.message}`,
    })
  }
  if (error instanceof GitHubApiError) {
    return new ProviderAuthenticationError({
      provider: PROVIDER,
      message: error.message,
    })
  }
  if (error instanceof AccountLimitExceededError) {
    // Map tier limit errors to ProviderFeatureUnsupportedError
    // The IPC layer will handle mapping this to a tier-specific error for the UI
    return new ProviderFeatureUnsupportedError({
      provider: PROVIDER,
      feature: 'multiple-accounts',
    })
  }
  if (error instanceof NotAuthenticatedError) {
    return new ProviderAuthenticationError({
      provider: PROVIDER,
      message: error.message,
    })
  }
  // Fallback for unknown errors
  return new ProviderAuthenticationError({
    provider: PROVIDER,
    message: error instanceof Error ? error.message : 'Unknown error',
  })
}

const mapGitHubApiErrorToRepositoryError = (
  error: unknown
): ProviderRepositoryError | ProviderAuthenticationError => {
  if (error instanceof NotAuthenticatedError) {
    return new ProviderAuthenticationError({
      provider: PROVIDER,
      message: error.message,
    })
  }
  if (error instanceof GitHubApiError) {
    // Check for authentication-related status codes
    if (error.status === 401 || error.status === 403) {
      return new ProviderAuthenticationError({
        provider: PROVIDER,
        message: error.message,
      })
    }
    return new ProviderRepositoryError({
      provider: PROVIDER,
      message: error.message,
    })
  }
  // Fallback for unknown errors
  return new ProviderRepositoryError({
    provider: PROVIDER,
    message: error instanceof Error ? error.message : 'Unknown error',
  })
}

const makeRepositoryMapper =
  (accountId: AccountId) =>
  (repo: GitHubRepository): ProviderRepository =>
    new ProviderRepository({
      provider: PROVIDER,
      accountId,
      repositoryId: repo.id.toString(),
      owner: repo.owner.login,
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description ?? undefined,
      visibility: repo.visibility ?? (repo.private ? 'private' : 'public'),
      defaultBranch: repo.default_branch,
      language: repo.language ?? undefined,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      openIssues: repo.open_issues_count,
      webUrl: repo.html_url,
      cloneUrl: repo.clone_url,
      sshUrl: repo.ssh_url,
      avatarUrl: repo.owner.avatar_url ?? undefined,
      updatedAt: new Date(repo.updated_at),
      raw: repo,
    })

/**
 * GitHub provider adapter using standard OAuth flow with browser callback.
 *
 * HEXAGONAL ARCHITECTURE: This is an ADAPTER implementation of the VcsProviderPort.
 * It can be hot-swapped with other implementations (mock, test, alternative auth, etc.)
 */

// Register the provider tag
const GitHubProviderTag = VcsProviderTags.register(PROVIDER)

/**
 * Live implementation of GitHub provider adapter as a Layer.
 * This Layer provides the VcsProviderPort for GitHub.
 */
export const GitHubBrowserProviderAdapter = Layer.effect(
  GitHubProviderTag,
  Effect.gen(function* () {
    const authService = yield* GitHubAuthService
    const apiService = yield* GitHubApiService

    const adapter: VcsProviderPort = {
      provider: PROVIDER,
      supportsRepositories: true,
      supportsIssues: true,
      supportsPullRequests: true,

      signIn: () =>
        Effect.gen(function* () {
          const result = yield* authService.startAuthFlow
          const providerUser = new ProviderUser({
            provider: PROVIDER,
            providerUserId: result.user.id.toString(),
            username: result.user.login,
            displayName: result.user.name ?? undefined,
            avatarUrl: result.user.avatar_url ?? undefined,
            email: result.user.email ?? undefined,
          })

          return new ProviderSignInResult({
            provider: PROVIDER,
            accountId: result.account.id,
            user: providerUser,
          })
        }).pipe(
          // Map all GitHub domain errors to Provider port errors
          Effect.mapError(mapGitHubAuthErrorToProviderError)
        ),

      signOut: accountId =>
        authService.signOutAccount(accountId).pipe(
          Effect.mapError(mapGitHubAuthErrorToProviderError)
        ),

      checkAuth: accountId =>
        Effect.gen(function* () {
          const status = yield* authService.checkAuthForAccount(accountId)
          return new ProviderAuthStatus({
            provider: PROVIDER,
            accountId,
            authenticated: status.authenticated,
          })
        }).pipe(Effect.mapError(mapGitHubAuthErrorToProviderError)),

      getRepositories: accountId =>
        Effect.gen(function* () {
          const repositories = yield* apiService.getReposForAccount(accountId)
          const mapRepo = makeRepositoryMapper(accountId)
          return repositories.map(mapRepo)
        }).pipe(Effect.mapError(mapGitHubApiErrorToRepositoryError)),
    }

    return adapter
  })
).pipe(
  // Dependencies are provided via Layer system
  Layer.provide(
    Layer.mergeAll(
      GitHubAuthService.Default,
      GitHubApiService.Default
    )
  )
)
