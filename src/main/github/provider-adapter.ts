import { Effect } from 'effect'
import type { ProviderAdapter } from '../providers/ports'
import {
  ProviderAuthStatus,
  ProviderRepository,
  ProviderSignInResult,
  ProviderUser,
} from '../../shared/schemas/provider'
import { GitHubAuthService } from './auth-service'
import { GitHubApiService } from './api-service'
import type { GitHubRepository } from '../../shared/schemas'
import type { AccountId } from '../../shared/schemas/account-context'

const makeRepositoryMapper =
  (accountId: AccountId) =>
  (repo: GitHubRepository): ProviderRepository =>
    new ProviderRepository({
      provider: 'github',
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
      avatarUrl: repo.owner.avatar_url ?? undefined,
      updatedAt: new Date(repo.updated_at),
      raw: repo,
    })

export class GitHubProviderAdapter extends Effect.Service<GitHubProviderAdapter>()(
  'GitHubProviderAdapter',
  {
    dependencies: [GitHubAuthService.Default, GitHubApiService.Default],
    effect: Effect.gen(function* () {
      const authService = yield* GitHubAuthService
      const apiService = yield* GitHubApiService

      const adapter: ProviderAdapter = {
        provider: 'github',
        supportsRepositories: true,
        supportsIssues: true,
        supportsPullRequests: true,

        signIn: () =>
          Effect.gen(function* () {
            const result = yield* authService.startAuthFlow
            const providerUser = new ProviderUser({
              provider: 'github',
              providerUserId: result.user.id.toString(),
              username: result.user.login,
              displayName: result.user.name ?? undefined,
              avatarUrl: result.user.avatar_url ?? undefined,
              email: result.user.email ?? undefined,
            })

            return new ProviderSignInResult({
              provider: 'github',
              accountId: result.account.id,
              user: providerUser,
            })
          }),

        signOut: accountId => authService.signOutAccount(accountId),

        checkAuth: accountId =>
          Effect.gen(function* () {
            const status = yield* authService.checkAuthForAccount(accountId)
            return new ProviderAuthStatus({
              provider: 'github',
              accountId,
              authenticated: status.authenticated,
            })
          }),

        getRepositories: accountId =>
          Effect.gen(function* () {
            const repositories = yield* apiService.getReposForAccount(accountId)
            const mapRepo = makeRepositoryMapper(accountId)
            return repositories.map(mapRepo)
          }),
      }

      return adapter
    }),
  }
) {}
