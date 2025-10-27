import { Effect, Redacted } from 'effect'
import {
  ProviderPort,
  ProviderRepository,
  ProviderBranch,
  ProviderPullRequest,
  ProviderCommit,
  ProviderUser,
  ProviderAuthenticationError,
  ProviderApiError,
  ProviderRateLimitError,
  ProviderNotFoundError,
} from '../../../source-control/ports/secondary/provider-port'
import { GitHubApiService } from '../../../github/api-service'
import { GitHubHttpService } from '../../../github/http-service'
import { SecureStoreService } from '../../../github/store-service'
import { AccountId } from '../../../../shared/schemas/account-context'
import { GitHubRepository } from '../../../../shared/schemas'
import { Schema as S } from 'effect'

/**
 * GitHub branch schema from GitHub API
 */
const GitHubBranch = S.Struct({
  name: S.String,
  commit: S.Struct({
    sha: S.String,
    commit: S.Struct({
      message: S.String,
      author: S.Struct({
        name: S.String,
        date: S.String,
      }),
    }),
  }),
  protected: S.Boolean,
})

/**
 * GitHubProviderAdapter - Adapts GitHubApiService to ProviderPort interface
 *
 * This adapter lives in the VCS domain and implements source-control's ProviderPort.
 * It translates between GitHub's API types and source-control's domain types.
 *
 * Architecture:
 * - VCS domain provides this adapter
 * - Source-control domain consumes via ProviderPort interface
 * - Dependency flows inward (VCS → source-control interface)
 */
export class GitHubProviderAdapter implements ProviderPort {
  readonly type = 'github' as const

  constructor(
    private readonly githubApi: GitHubApiService,
    private readonly httpService: GitHubHttpService,
    private readonly storeService: SecureStoreService
  ) {}

  authenticate(accountId: AccountId): Effect.Effect<Redacted.Redacted<string>, ProviderAuthenticationError> {
    return this.storeService.getAuthForAccount(accountId).pipe(
      Effect.flatMap(authOption =>
        authOption._tag === 'Some'
          ? Effect.succeed(authOption.value)
          : Effect.fail(
              new ProviderAuthenticationError({
                provider: 'github',
                accountId,
                reason: 'No stored authentication for account',
              })
            )
      )
    )
  }

  getCurrentUser(accountId: AccountId): Effect.Effect<ProviderUser, ProviderAuthenticationError | ProviderApiError> {
    const self = this
    return Effect.gen(function* () {
      // Get token for account
      const token = yield* self.authenticate(accountId).pipe(
        Effect.map(redacted => Redacted.value(redacted))
      )

      // Fetch user from GitHub
      const githubUser = yield* self.httpService.fetchUser(token).pipe(
        Effect.mapError(error => new ProviderApiError({
          provider: 'github',
          endpoint: '/user',
          message: error.message,
        }))
      )

      return new ProviderUser({
        id: String(githubUser.id),
        username: githubUser.login,
        name: githubUser.name ?? undefined,
        email: githubUser.email ?? undefined,
        avatarUrl: githubUser.avatar_url,
      })
    })
  }

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
  ): Effect.Effect<ProviderRepository[], ProviderAuthenticationError | ProviderApiError | ProviderRateLimitError> {
    return this.githubApi.getReposForAccount(accountId).pipe(
      Effect.map(repos => repos.map(repo => this.mapGitHubRepoToProviderRepo(repo))),
      Effect.mapError(error => new ProviderApiError({
        provider: 'github',
        endpoint: '/user/repos',
        message: error instanceof Error ? error.message : 'Failed to fetch repositories',
      }))
    )
  }

  getRepository(
    owner: string,
    repo: string,
    accountId?: AccountId
  ): Effect.Effect<
    ProviderRepository,
    ProviderAuthenticationError | ProviderApiError | ProviderNotFoundError | ProviderRateLimitError
  > {
    const self = this
    return Effect.gen(function* () {
      if (accountId) {
        // Use authenticated request
        const githubRepo = yield* self.githubApi.getRepoForAccount(accountId, owner, repo).pipe(
          Effect.mapError(error => new ProviderApiError({
            provider: 'github',
            endpoint: `/repos/${owner}/${repo}`,
            message: error instanceof Error ? error.message : 'Failed to fetch repository',
          }))
        )
        return self.mapGitHubRepoToProviderRepo(githubRepo)
      } else {
        // Use unauthenticated request (for public repos)
        const githubRepo = yield* self.httpService.makeAuthenticatedRequest(
          `/repos/${owner}/${repo}`,
          '', // No token for public repos
          GitHubRepository
        ).pipe(
          Effect.mapError(error => new ProviderApiError({
            provider: 'github',
            endpoint: `/repos/${owner}/${repo}`,
            message: error.message,
          }))
        )
        return self.mapGitHubRepoToProviderRepo(githubRepo)
      }
    })
  }

  listBranches(
    owner: string,
    repo: string,
    accountId?: AccountId
  ): Effect.Effect<ProviderBranch[], ProviderAuthenticationError | ProviderApiError | ProviderRateLimitError> {
    const self = this
    return Effect.gen(function* () {
      const token = accountId
        ? yield* self.authenticate(accountId).pipe(Effect.map(redacted => Redacted.value(redacted)))
        : ''

      const branches = yield* self.httpService.makeAuthenticatedRequest(
        `/repos/${owner}/${repo}/branches`,
        token,
        S.Array(GitHubBranch)
      ).pipe(
        Effect.mapError(error => new ProviderApiError({
          provider: 'github',
          endpoint: `/repos/${owner}/${repo}/branches`,
          message: error.message,
        }))
      )

      return branches.map(branch => new ProviderBranch({
        name: branch.name,
        commit: {
          sha: branch.commit.sha,
          message: branch.commit.commit.message,
          author: branch.commit.commit.author.name,
          date: new Date(branch.commit.commit.author.date),
        },
        isProtected: branch.protected,
      }))
    })
  }

  getBranch(
    owner: string,
    repo: string,
    branch: string,
    accountId?: AccountId
  ): Effect.Effect<
    ProviderBranch,
    ProviderAuthenticationError | ProviderApiError | ProviderNotFoundError | ProviderRateLimitError
  > {
    const self = this
    return Effect.gen(function* () {
      const token = accountId
        ? yield* self.authenticate(accountId).pipe(Effect.map(redacted => Redacted.value(redacted)))
        : ''

      const githubBranch = yield* self.httpService.makeAuthenticatedRequest(
        `/repos/${owner}/${repo}/branches/${branch}`,
        token,
        GitHubBranch
      ).pipe(
        Effect.mapError(error => new ProviderApiError({
          provider: 'github',
          endpoint: `/repos/${owner}/${repo}/branches/${branch}`,
          message: error.message,
        }))
      )

      return new ProviderBranch({
        name: githubBranch.name,
        commit: {
          sha: githubBranch.commit.sha,
          message: githubBranch.commit.commit.message,
          author: githubBranch.commit.commit.author.name,
          date: new Date(githubBranch.commit.commit.author.date),
        },
        isProtected: githubBranch.protected,
      })
    })
  }

  listPullRequests(
    owner: string,
    repo: string,
    accountId: AccountId,
    options?: {
      state?: 'open' | 'closed' | 'all'
      sort?: 'created' | 'updated'
      direction?: 'asc' | 'desc'
    }
  ): Effect.Effect<ProviderPullRequest[], ProviderAuthenticationError | ProviderApiError | ProviderRateLimitError> {
    return this.githubApi.getPullRequestsForAccount(accountId, owner, repo, options?.state).pipe(
      Effect.map(prs => prs.map(pr => new ProviderPullRequest({
        id: pr.id,
        number: pr.number,
        title: pr.title,
        body: pr.body ?? undefined,
        state: pr.state as 'open' | 'closed' | 'merged',
        author: pr.user.login,
        headBranch: pr.head.ref,
        baseBranch: pr.base.ref,
        createdAt: new Date(pr.created_at),
        updatedAt: new Date(pr.updated_at),
        mergedAt: pr.merged_at ? new Date(pr.merged_at) : undefined,
      }))),
      Effect.mapError(error => new ProviderApiError({
        provider: 'github',
        endpoint: `/repos/${owner}/${repo}/pulls`,
        message: error instanceof Error ? error.message : 'Failed to fetch pull requests',
      }))
    )
  }

  getPullRequest(
    owner: string,
    repo: string,
    number: number,
    accountId: AccountId
  ): Effect.Effect<
    ProviderPullRequest,
    ProviderAuthenticationError | ProviderApiError | ProviderNotFoundError | ProviderRateLimitError
  > {
    const self = this
    return Effect.gen(function* () {
      const token = yield* self.authenticate(accountId).pipe(
        Effect.map(redacted => Redacted.value(redacted))
      )

      const pr = yield* self.httpService.makeAuthenticatedRequest(
        `/repos/${owner}/${repo}/pulls/${number}`,
        token,
        S.Any // We'll use the GitHubPullRequest schema when available
      ).pipe(
        Effect.mapError(error => new ProviderApiError({
          provider: 'github',
          endpoint: `/repos/${owner}/${repo}/pulls/${number}`,
          message: error.message,
        }))
      )

      return new ProviderPullRequest({
        id: pr.id,
        number: pr.number,
        title: pr.title,
        body: pr.body ?? undefined,
        state: pr.state,
        author: pr.user.login,
        headBranch: pr.head.ref,
        baseBranch: pr.base.ref,
        createdAt: new Date(pr.created_at),
        updatedAt: new Date(pr.updated_at),
        mergedAt: pr.merged_at ? new Date(pr.merged_at) : undefined,
      })
    })
  }

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
  ): Effect.Effect<ProviderPullRequest, ProviderAuthenticationError | ProviderApiError | ProviderRateLimitError> {
    const self = this
    return Effect.gen(function* () {
      const token = yield* self.authenticate(accountId).pipe(
        Effect.map(redacted => Redacted.value(redacted))
      )

      const pr = yield* Effect.tryPromise({
        try: () => fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'application/vnd.github.v3+json',
          },
          body: JSON.stringify(data),
        }).then(res => res.json()),
        catch: error => new ProviderApiError({
          provider: 'github',
          endpoint: `/repos/${owner}/${repo}/pulls`,
          message: error instanceof Error ? error.message : 'Failed to create pull request',
        })
      })

      return new ProviderPullRequest({
        id: pr.id,
        number: pr.number,
        title: pr.title,
        body: pr.body ?? undefined,
        state: pr.state,
        author: pr.user.login,
        headBranch: pr.head.ref,
        baseBranch: pr.base.ref,
        createdAt: new Date(pr.created_at),
        updatedAt: new Date(pr.updated_at),
        mergedAt: pr.merged_at ? new Date(pr.merged_at) : undefined,
      })
    })
  }

  getCommit(
    owner: string,
    repo: string,
    sha: string,
    accountId?: AccountId
  ): Effect.Effect<
    ProviderCommit,
    ProviderAuthenticationError | ProviderApiError | ProviderNotFoundError | ProviderRateLimitError
  > {
    const self = this
    return Effect.gen(function* () {
      const token = accountId
        ? yield* self.authenticate(accountId).pipe(Effect.map(redacted => Redacted.value(redacted)))
        : ''

      const commit = yield* self.httpService.makeAuthenticatedRequest(
        `/repos/${owner}/${repo}/commits/${sha}`,
        token,
        S.Any
      ).pipe(
        Effect.mapError(error => new ProviderApiError({
          provider: 'github',
          endpoint: `/repos/${owner}/${repo}/commits/${sha}`,
          message: error.message,
        }))
      )

      return new ProviderCommit({
        sha: commit.sha,
        message: commit.commit.message,
        author: {
          name: commit.commit.author.name,
          email: commit.commit.author.email,
          date: new Date(commit.commit.author.date),
        },
        committer: {
          name: commit.commit.committer.name,
          email: commit.commit.committer.email,
          date: new Date(commit.commit.committer.date),
        },
        parents: commit.parents.map((p: any) => p.sha),
        url: commit.html_url,
      })
    })
  }

  compareCommits(
    owner: string,
    repo: string,
    base: string,
    head: string,
    accountId?: AccountId
  ): Effect.Effect<
    { aheadBy: number; behindBy: number; commits: ProviderCommit[] },
    ProviderAuthenticationError | ProviderApiError | ProviderRateLimitError
  > {
    const self = this
    return Effect.gen(function* () {
      const token = accountId
        ? yield* self.authenticate(accountId).pipe(Effect.map(redacted => Redacted.value(redacted)))
        : ''

      const comparison = yield* self.httpService.makeAuthenticatedRequest(
        `/repos/${owner}/${repo}/compare/${base}...${head}`,
        token,
        S.Any
      ).pipe(
        Effect.mapError(error => new ProviderApiError({
          provider: 'github',
          endpoint: `/repos/${owner}/${repo}/compare/${base}...${head}`,
          message: error.message,
        }))
      )

      return {
        aheadBy: comparison.ahead_by,
        behindBy: comparison.behind_by,
        commits: comparison.commits.map((c: any) => new ProviderCommit({
          sha: c.sha,
          message: c.commit.message,
          author: {
            name: c.commit.author.name,
            email: c.commit.author.email,
            date: new Date(c.commit.author.date),
          },
          committer: {
            name: c.commit.committer.name,
            email: c.commit.committer.email,
            date: new Date(c.commit.committer.date),
          },
          parents: c.parents.map((p: any) => p.sha),
          url: c.html_url,
        })),
      }
    })
  }

  /**
   * Helper to map GitHubRepository to ProviderRepository
   */
  private mapGitHubRepoToProviderRepo(repo: GitHubRepository): ProviderRepository {
    return new ProviderRepository({
      id: String(repo.id),
      owner: repo.owner.login,
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description ?? undefined,
      isPrivate: repo.private,
      isFork: repo.fork,
      defaultBranch: repo.default_branch,
      cloneUrl: repo.clone_url,
      sshUrl: repo.ssh_url,
      language: repo.language ?? undefined,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      updatedAt: new Date(repo.updated_at),
    })
  }
}
