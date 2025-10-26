import { Effect, Redacted } from 'effect'
import { ProviderPort } from '../../ports/secondary/provider-port'
import {
  ProviderRepository,
  ProviderBranch,
  ProviderPullRequest,
  ProviderCommit,
  ProviderUser,
  ProviderAuthenticationError,
  ProviderApiError,
  ProviderRateLimitError,
  ProviderNotFoundError,
} from '../../ports/secondary/provider-port'
import { GitHubApiService } from '../../../github/api-service'
import { GitHubHttpService } from '../../../github/http-service'
import { SecureStoreService } from '../../../github/store-service'
import { AccountId } from '../../../../shared/schemas/account-context'
import {
  GitHubRepository,
  GitHubPullRequest as GitHubPR,
} from '../../../../shared/schemas'
import { GitHubUser } from '../../../../shared/schemas/github/user'
import { Schema as S } from 'effect'
import {
  GitHubAuthError,
  GitHubApiError,
  NotAuthenticatedError,
} from '../../../github/errors'

/**
 * GitHub Provider Adapter
 *
 * Wraps the existing GitHubApiService to implement the ProviderPort interface.
 * This allows the source control domain to interact with GitHub without
 * direct coupling to GitHub-specific implementations.
 *
 * Architecture:
 * - Delegates to GitHubApiService for API operations
 * - Converts GitHub domain types to ProviderPort types
 * - Maps GitHub errors to ProviderPort errors
 * - Handles authentication via SecureStoreService
 */
export class GitHubProviderAdapter extends Effect.Service<GitHubProviderAdapter>()(
  'GitHubProviderAdapter',
  {
    effect: Effect.gen(function* () {
      const githubApi = yield* GitHubApiService
      const httpService = yield* GitHubHttpService
      const storeService = yield* SecureStoreService

      /**
       * Helper: Get authentication token for account
       */
      const getTokenForAccount = (
        accountId: AccountId
      ): Effect.Effect<Redacted.Redacted<string>, ProviderAuthenticationError> =>
        Effect.gen(function* () {
          const authOption = yield* storeService.getAuthForAccount(accountId)

          if (authOption._tag === 'None') {
            return yield* Effect.fail(
              new ProviderAuthenticationError({
                provider: 'github',
                accountId,
                reason: 'Account not authenticated',
              })
            )
          }

          return authOption.value
        }).pipe(
          Effect.catchTag('NotAuthenticatedError', (error) =>
            Effect.fail(
              new ProviderAuthenticationError({
                provider: 'github',
                accountId,
                reason: error.message,
              })
            )
          )
        )

      /**
       * Helper: Convert GitHubRepository to ProviderRepository
       */
      const toProviderRepository = (
        repo: GitHubRepository
      ): ProviderRepository => {
        return new ProviderRepository({
          id: repo.id.toString(),
          owner: repo.owner.login,
          name: repo.name,
          fullName: repo.full_name,
          description: repo.description ?? undefined,
          isPrivate: repo.private,
          isFork: false, // GitHub API doesn't always include this in basic repo info
          defaultBranch: repo.default_branch,
          cloneUrl: repo.clone_url,
          sshUrl: repo.ssh_url,
          language: repo.language ?? undefined,
          stars: repo.stargazers_count,
          forks: repo.forks_count,
          updatedAt: new Date(repo.updated_at),
        })
      }

      /**
       * Helper: Convert GitHubPullRequest to ProviderPullRequest
       */
      const toProviderPullRequest = (pr: GitHubPR): ProviderPullRequest => {
        return new ProviderPullRequest({
          id: pr.id,
          number: pr.number,
          title: pr.title,
          body: pr.body ?? undefined,
          state: pr.state === 'open' ? 'open' : 'closed',
          author: pr.user.login,
          headBranch: pr.head.ref,
          baseBranch: pr.base.ref,
          createdAt: new Date(pr.created_at),
          updatedAt: new Date(pr.updated_at),
          mergedAt: pr.merged_at ? new Date(pr.merged_at) : undefined,
        })
      }

      /**
       * Helper: Convert GitHubUser to ProviderUser
       */
      const toProviderUser = (user: GitHubUser): ProviderUser => {
        return new ProviderUser({
          id: user.id.toString(),
          username: user.login,
          name: user.name ?? undefined,
          email: user.email ?? undefined,
          avatarUrl: user.avatar_url,
        })
      }

      /**
       * Helper: Map GitHub errors to ProviderPort errors
       */
      const mapGitHubError = <E>(
        error: E
      ): ProviderAuthenticationError | ProviderApiError | ProviderNotFoundError => {
        if (error instanceof NotAuthenticatedError) {
          return new ProviderAuthenticationError({
            provider: 'github',
            accountId: 'unknown' as AccountId,
            reason: error.message,
          })
        }

        if (error instanceof GitHubAuthError) {
          return new ProviderAuthenticationError({
            provider: 'github',
            accountId: 'unknown' as AccountId,
            reason: error.message,
          })
        }

        if (error instanceof GitHubApiError) {
          if (error.statusCode === 404) {
            return new ProviderNotFoundError({
              provider: 'github',
              resource: 'repository',
              identifier: error.endpoint,
            })
          }

          return new ProviderApiError({
            provider: 'github',
            endpoint: error.endpoint,
            statusCode: error.statusCode,
            message: error.message,
            cause: error.cause,
          })
        }

        return new ProviderApiError({
          provider: 'github',
          endpoint: 'unknown',
          message: error instanceof Error ? error.message : String(error),
          cause: error,
        })
      }

      /**
       * ProviderPort implementation
       */
      const adapter: ProviderPort = {
        type: 'github' as const,

        authenticate: (accountId: AccountId) => getTokenForAccount(accountId),

        getCurrentUser: (accountId: AccountId) =>
          Effect.gen(function* () {
            const token = yield* getTokenForAccount(accountId)

            const user = yield* httpService.makeAuthenticatedRequest(
              '/user',
              Redacted.value(token),
              GitHubUser
            )

            return toProviderUser(user)
          }).pipe(
            Effect.catchAll((error) => Effect.fail(mapGitHubError(error)))
          ),

        listRepositories: (accountId: AccountId, options) =>
          Effect.gen(function* () {
            const repos = yield* githubApi.getReposForAccount(accountId)
            return repos.map(toProviderRepository)
          }).pipe(
            Effect.catchAll((error) => Effect.fail(mapGitHubError(error)))
          ),

        getRepository: (owner: string, repo: string, accountId) =>
          Effect.gen(function* () {
            if (!accountId) {
              return yield* Effect.fail(
                new ProviderAuthenticationError({
                  provider: 'github',
                  accountId: 'unknown' as AccountId,
                  reason: 'Account ID required for repository access',
                })
              )
            }

            const repository = yield* githubApi.getRepoForAccount(
              accountId,
              owner,
              repo
            )
            return toProviderRepository(repository)
          }).pipe(
            Effect.catchAll((error) => Effect.fail(mapGitHubError(error)))
          ),

        listBranches: (owner: string, repo: string, accountId) =>
          Effect.gen(function* () {
            if (!accountId) {
              return yield* Effect.fail(
                new ProviderAuthenticationError({
                  provider: 'github',
                  accountId: 'unknown' as AccountId,
                  reason: 'Account ID required for branch listing',
                })
              )
            }

            const token = yield* getTokenForAccount(accountId)

            // GitHub API schema for branches
            const GitHubBranch = S.Struct({
              name: S.String,
              commit: S.Struct({
                sha: S.String,
                url: S.String,
              }),
              protected: S.Boolean,
            })

            const branches = yield* httpService.makeAuthenticatedRequest(
              `/repos/${owner}/${repo}/branches`,
              Redacted.value(token),
              S.Array(GitHubBranch)
            )

            return branches.map(
              (branch) =>
                new ProviderBranch({
                  name: branch.name,
                  commit: {
                    sha: branch.commit.sha,
                    message: '',
                    author: '',
                    date: new Date(),
                  },
                  isProtected: branch.protected,
                })
            )
          }).pipe(
            Effect.catchAll((error) => Effect.fail(mapGitHubError(error)))
          ),

        getBranch: (owner: string, repo: string, branch: string, accountId) =>
          Effect.gen(function* () {
            if (!accountId) {
              return yield* Effect.fail(
                new ProviderAuthenticationError({
                  provider: 'github',
                  accountId: 'unknown' as AccountId,
                  reason: 'Account ID required for branch access',
                })
              )
            }

            const token = yield* getTokenForAccount(accountId)

            // GitHub API schema for branch
            const GitHubBranch = S.Struct({
              name: S.String,
              commit: S.Struct({
                sha: S.String,
                url: S.String,
                commit: S.Struct({
                  author: S.Struct({
                    name: S.String,
                    date: S.String,
                  }),
                  message: S.String,
                }),
              }),
              protected: S.Boolean,
            })

            const branchData = yield* httpService.makeAuthenticatedRequest(
              `/repos/${owner}/${repo}/branches/${branch}`,
              Redacted.value(token),
              GitHubBranch
            )

            return new ProviderBranch({
              name: branchData.name,
              commit: {
                sha: branchData.commit.sha,
                message: branchData.commit.commit.message,
                author: branchData.commit.commit.author.name,
                date: new Date(branchData.commit.commit.author.date),
              },
              isProtected: branchData.protected,
            })
          }).pipe(
            Effect.catchAll((error) => Effect.fail(mapGitHubError(error)))
          ),

        listPullRequests: (owner: string, repo: string, accountId, options) =>
          Effect.gen(function* () {
            const state = options?.state ?? 'open'
            const prs = yield* githubApi.getPullRequestsForAccount(
              accountId,
              owner,
              repo,
              state
            )
            return prs.map(toProviderPullRequest)
          }).pipe(
            Effect.catchAll((error) => Effect.fail(mapGitHubError(error)))
          ),

        getPullRequest: (owner: string, repo: string, number: number, accountId) =>
          Effect.gen(function* () {
            const token = yield* getTokenForAccount(accountId)

            const pr = yield* httpService.makeAuthenticatedRequest(
              `/repos/${owner}/${repo}/pulls/${number}`,
              Redacted.value(token),
              GitHubPR
            )

            return toProviderPullRequest(pr)
          }).pipe(
            Effect.catchAll((error) => Effect.fail(mapGitHubError(error)))
          ),

        createPullRequest: (owner: string, repo: string, data, accountId) =>
          Effect.gen(function* () {
            const token = yield* getTokenForAccount(accountId)

            const pr = yield* httpService.makeAuthenticatedRequest(
              `/repos/${owner}/${repo}/pulls`,
              Redacted.value(token),
              GitHubPR,
              {
                method: 'POST',
                body: JSON.stringify({
                  title: data.title,
                  body: data.body,
                  head: data.head,
                  base: data.base,
                }),
              }
            )

            return toProviderPullRequest(pr)
          }).pipe(
            Effect.catchAll((error) => Effect.fail(mapGitHubError(error)))
          ),

        getCommit: (owner: string, repo: string, sha: string, accountId) =>
          Effect.gen(function* () {
            if (!accountId) {
              return yield* Effect.fail(
                new ProviderAuthenticationError({
                  provider: 'github',
                  accountId: 'unknown' as AccountId,
                  reason: 'Account ID required for commit access',
                })
              )
            }

            const token = yield* getTokenForAccount(accountId)

            // GitHub API schema for commit
            const GitHubCommit = S.Struct({
              sha: S.String,
              commit: S.Struct({
                message: S.String,
                author: S.Struct({
                  name: S.String,
                  email: S.String,
                  date: S.String,
                }),
                committer: S.Struct({
                  name: S.String,
                  email: S.String,
                  date: S.String,
                }),
              }),
              parents: S.Array(S.Struct({ sha: S.String })),
              html_url: S.String,
            })

            const commit = yield* httpService.makeAuthenticatedRequest(
              `/repos/${owner}/${repo}/commits/${sha}`,
              Redacted.value(token),
              GitHubCommit
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
              parents: commit.parents.map((p) => p.sha),
              url: commit.html_url,
            })
          }).pipe(
            Effect.catchAll((error) => Effect.fail(mapGitHubError(error)))
          ),

        compareCommits: (
          owner: string,
          repo: string,
          base: string,
          head: string,
          accountId
        ) =>
          Effect.gen(function* () {
            if (!accountId) {
              return yield* Effect.fail(
                new ProviderAuthenticationError({
                  provider: 'github',
                  accountId: 'unknown' as AccountId,
                  reason: 'Account ID required for commit comparison',
                })
              )
            }

            const token = yield* getTokenForAccount(accountId)

            // GitHub API schema for compare
            const GitHubCompare = S.Struct({
              ahead_by: S.Number,
              behind_by: S.Number,
              commits: S.Array(
                S.Struct({
                  sha: S.String,
                  commit: S.Struct({
                    message: S.String,
                    author: S.Struct({
                      name: S.String,
                      email: S.String,
                      date: S.String,
                    }),
                    committer: S.Struct({
                      name: S.String,
                      email: S.String,
                      date: S.String,
                    }),
                  }),
                  parents: S.Array(S.Struct({ sha: S.String })),
                  html_url: S.String,
                })
              ),
            })

            const comparison = yield* httpService.makeAuthenticatedRequest(
              `/repos/${owner}/${repo}/compare/${base}...${head}`,
              Redacted.value(token),
              GitHubCompare
            )

            return {
              aheadBy: comparison.ahead_by,
              behindBy: comparison.behind_by,
              commits: comparison.commits.map(
                (commit) =>
                  new ProviderCommit({
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
                    parents: commit.parents.map((p) => p.sha),
                    url: commit.html_url,
                  })
              ),
            }
          }).pipe(
            Effect.catchAll((error) => Effect.fail(mapGitHubError(error)))
          ),
      }

      return adapter
    }),
    dependencies: [
      GitHubApiService.Default,
      GitHubHttpService.Default,
      SecureStoreService.Default,
    ],
  }
) {}
