import { Effect, Option, Redacted, Schema as S } from 'effect'
import { NotAuthenticatedError } from './errors'
import {
  GitHubRepository,
  GitHubIssue,
  GitHubPullRequest,
} from '../../shared/schemas'
import { GitHubHttpService } from './http-service'
import { SecureStoreService } from './store-service'
import type { AccountId } from '../../shared/schemas/account-context'

export class GitHubApiService extends Effect.Service<GitHubApiService>()(
  'GitHubApiService',
  {
    dependencies: [GitHubHttpService.Default, SecureStoreService.Default],
    effect: Effect.gen(function* () {
      const httpService = yield* GitHubHttpService
      const storeService = yield* SecureStoreService

      const getTokenForAccount = (accountId: AccountId) =>
        Effect.gen(function* () {
          const auth = yield* storeService.getAuthForAccount(accountId)

          return yield* Option.match(auth, {
            onNone: () =>
              Effect.fail(
                new NotAuthenticatedError({
                  message: `Account ${accountId} is not authenticated`,
                })
              ),
            onSome: stored => Effect.succeed(Redacted.value(stored)),
          })
        })

      return {
        getReposForAccount: (accountId: AccountId, username?: string) =>
          Effect.gen(function* () {
            const token = yield* getTokenForAccount(accountId)
            const endpoint = username
              ? `/users/${username}/repos`
              : '/user/repos'

            return yield* httpService.makeAuthenticatedRequest(
              endpoint,
              token,
              S.Array(GitHubRepository)
            )
          }),

        getRepoForAccount: (
          accountId: AccountId,
          owner: string,
          repo: string
        ) =>
          Effect.gen(function* () {
            const token = yield* getTokenForAccount(accountId)

            return yield* httpService.makeAuthenticatedRequest(
              `/repos/${owner}/${repo}`,
              token,
              GitHubRepository
            )
          }),

        getIssuesForAccount: (
          accountId: AccountId,
          owner: string,
          repo: string,
          state: 'open' | 'closed' | 'all' = 'open'
        ) =>
          Effect.gen(function* () {
            const token = yield* getTokenForAccount(accountId)

            return yield* httpService.makeAuthenticatedRequest(
              `/repos/${owner}/${repo}/issues?state=${state}`,
              token,
              S.Array(GitHubIssue)
            )
          }),

        getPullRequestsForAccount: (
          accountId: AccountId,
          owner: string,
          repo: string,
          state: 'open' | 'closed' | 'all' = 'open'
        ) =>
          Effect.gen(function* () {
            const token = yield* getTokenForAccount(accountId)

            return yield* httpService.makeAuthenticatedRequest(
              `/repos/${owner}/${repo}/pulls?state=${state}`,
              token,
              S.Array(GitHubPullRequest)
            )
          }),
      }
    }),
  }
) {}
