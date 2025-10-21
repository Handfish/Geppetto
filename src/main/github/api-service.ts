import { Effect, Option, Redacted, Schema as S } from 'effect'
import { NotAuthenticatedError } from './errors'
import { GitHubRepository, GitHubIssue } from '../../shared/schemas'
import { GitHubHttpService } from './http-service'
import { SecureStoreService } from './store-service'

export class GitHubApiService extends Effect.Service<GitHubApiService>()('GitHubApiService', {
  dependencies: [GitHubHttpService.Default, SecureStoreService.Default],
  effect: Effect.gen(function* () {
    const httpService = yield* GitHubHttpService
    const storeService = yield* SecureStoreService

    const getToken = Effect.gen(function* () {
      const auth = yield* storeService.getAuth

      return yield* Option.match(auth, {
        onNone: () =>
          Effect.fail(
            new NotAuthenticatedError({
              message: 'User is not authenticated',
            })
          ),
        onSome: (stored) => Effect.succeed(Redacted.value(stored.token)),
      })
    })

    return {
      getRepos: (username?: string) =>
        Effect.gen(function* () {
          const token = yield* getToken
          const endpoint = username ? `/users/${username}/repos` : '/user/repos'

          return yield* httpService.makeAuthenticatedRequest(endpoint, token, S.Array(GitHubRepository))
        }),

      getRepo: (owner: string, repo: string) =>
        Effect.gen(function* () {
          const token = yield* getToken

          return yield* httpService.makeAuthenticatedRequest(
            `/repos/${owner}/${repo}`,
            token,
            GitHubRepository
          )
        }),

      getIssues: (owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'open') =>
        Effect.gen(function* () {
          const token = yield* getToken

          return yield* httpService.makeAuthenticatedRequest(
            `/repos/${owner}/${repo}/issues?state=${state}`,
            token,
            S.Array(GitHubIssue)
          )
        }),

      getPullRequests: (owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'open') =>
        Effect.gen(function* () {
          const token = yield* getToken

          return yield* httpService.makeAuthenticatedRequest(
            `/repos/${owner}/${repo}/pulls?state=${state}`,
            token,
            S.Array(S.Any)
          )
        }),

      checkAuth: Effect.gen(function* () {
        const auth = yield* storeService.getAuth
        return Option.match(auth, {
          onNone: () => ({ authenticated: false as const }),
          onSome: (stored) => ({ authenticated: true as const, user: stored.user }),
        })
      }),

      signOut: Effect.gen(function* () {
        yield* storeService.clearAuth
      }),
    }
  }),
}) {}

