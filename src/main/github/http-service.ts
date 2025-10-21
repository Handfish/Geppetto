import { Effect, Schema as S } from 'effect'
import { GitHubApiError, GitHubTokenExchangeError } from './errors'
import { GitHubUser } from '../../shared/schemas'
import { GitHubTokenResponse } from './schemas'

export class GitHubHttpService extends Effect.Service<GitHubHttpService>()('GitHubHttpService', {
  sync: () => ({
    makeAuthenticatedRequest: <A>(
      endpoint: string,
      token: string,
      schema: S.Schema<A, unknown>
    ): Effect.Effect<A, GitHubApiError> =>
      Effect.gen(function* () {
        const response = yield* Effect.tryPromise({
          try: () =>
            fetch(`https://api.github.com${endpoint}`, {
              headers: {
                Authorization: `Bearer ${token}`,
                'User-Agent': 'GitHub-Desktop-Clone',
                Accept: 'application/vnd.github.v3+json',
              },
            }),
          catch: (error) =>
            new GitHubApiError({
              message: error instanceof Error ? error.message : 'Request failed',
              endpoint,
            }),
        })

        if (!response.ok) {
          const errorText = yield* Effect.tryPromise({
            try: () => response.text(),
            catch: () => 'Unknown error',
          })
          
          return yield* Effect.fail(
            new GitHubApiError({
              message: `GitHub API error: ${response.status} ${response.statusText} - ${errorText}`,
              status: response.status,
              endpoint,
            })
          )
        }

        const data = yield* Effect.tryPromise({
          try: () => response.json(),
          catch: (error) =>
            new GitHubApiError({
              message: error instanceof Error ? error.message : 'Failed to parse response',
              endpoint,
            }),
        })

        return yield* S.decodeUnknown(schema)(data).pipe(
          Effect.mapError(
            (error) =>
              new GitHubApiError({
                message: `Schema validation failed: ${error.message}`,
                endpoint,
              })
          )
        )
      }),

    exchangeCodeForToken: (code: string): Effect.Effect<string, GitHubTokenExchangeError> =>
      Effect.gen(function* () {
        const clientId = process.env.GITHUB_CLIENT_ID || 'your-client-id'
        const clientSecret = process.env.GITHUB_CLIENT_SECRET || 'your-client-secret'

        const response = yield* Effect.tryPromise({
          try: () =>
            fetch('https://github.com/login/oauth/access_token', {
              method: 'POST',
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                client_id: clientId,
                client_secret: clientSecret,
                code,
              }),
            }),
          catch: (error) =>
            new GitHubTokenExchangeError({
              message: error instanceof Error ? error.message : 'Token exchange failed',
              code,
            }),
        })

        if (!response.ok) {
          return yield* Effect.fail(
            new GitHubTokenExchangeError({
              message: `Token exchange failed: ${response.status} ${response.statusText}`,
              code,
            })
          )
        }

        const data = yield* Effect.tryPromise({
          try: () => response.json(),
          catch: () =>
            new GitHubTokenExchangeError({
              message: 'Failed to parse token response',
              code,
            }),
        })

        console.log('[Token Exchange] Response data:', JSON.stringify(data, null, 2))

        // Check if GitHub returned an error response
        if (data.error) {
          return yield* Effect.fail(
            new GitHubTokenExchangeError({
              message: `GitHub OAuth error: ${data.error}${data.error_description ? ` - ${data.error_description}` : ''}`,
              code,
            })
          )
        }

        const tokenResponse = yield* S.decodeUnknown(GitHubTokenResponse)(data).pipe(
          Effect.mapError(
            (error) =>
              new GitHubTokenExchangeError({
                message: `Invalid token response format: ${JSON.stringify(data)}. Schema error: ${error.message}`,
                code,
              })
          )
        )

        return tokenResponse.access_token
      }),

    fetchUser: (token: string): Effect.Effect<GitHubUser, GitHubApiError> =>
      Effect.gen(function* () {
        return yield* GitHubHttpService.makeAuthenticatedRequest('/user', token, GitHubUser)
      }),
  }),
}) {}

