import {
  Duration,
  Effect,
  RateLimiter,
  Schedule,
  Schema as S,
  Console,
} from 'effect'
import { pipe } from 'effect/Function'
import { GitHubApiError, GitHubTokenExchangeError } from './errors'
import { GitHubUser } from '../../shared/schemas'
import { GitHubTokenResponse } from './schemas'
import { GitHubRateLimitConfig } from '../../config'

const NonNegativeIntFromString = pipe(
  S.NumberFromString,
  S.int(),
  S.nonNegative()
)

const decodeOptionalHeaderInt = (value: string | null) => {
  const sanitized = value?.trim()
  if (!sanitized) {
    return Effect.succeed<number | undefined>(undefined)
  }

  return pipe(
    sanitized,
    S.decodeUnknown(NonNegativeIntFromString),
    Effect.orElse(() => Effect.succeed<number | undefined>(undefined))
  )
}

const isRetriableApiError = (error: GitHubApiError) => {
  if (error.retryAfter && error.retryAfter > 0) {
    return true
  }

  if (
    typeof error.rateLimitRemaining === 'number' &&
    error.rateLimitRemaining <= 0
  ) {
    return true
  }

  if (error.status === 429 || error.status === 503) {
    return true
  }

  if (
    error.status === 403 &&
    typeof error.rateLimitRemaining === 'number' &&
    error.rateLimitRemaining <= 0
  ) {
    return true
  }

  return false
}

export class GitHubHttpService extends Effect.Service<GitHubHttpService>()(
  'GitHubHttpService',
  {
    effect: Effect.scoped(
      Effect.gen(function* () {
        yield* Console.log('[GitHubHttpService] Initializing service...')
        yield* Console.log('[GitHubHttpService] Loading config...')
        const config = yield* GitHubRateLimitConfig
        yield* Console.log('[GitHubHttpService] Config loaded:', config)
        const {
          requestsPerSecond,
          requestsPerMinute,
          maxRetries,
          backoffBaseMs,
          maxBackoffSeconds,
        } = config

        console.log(`[GitHubHttpService] Creating rate limiters: ${requestsPerSecond} req/sec, ${requestsPerMinute} req/min`)
        const perSecondLimiter = yield* RateLimiter.make({
          limit: requestsPerSecond,
          interval: Duration.seconds(1),
        })
        console.log('[GitHubHttpService] Per-second limiter created')
        const perMinuteLimiter = yield* RateLimiter.make({
          limit: requestsPerMinute,
          interval: Duration.minutes(1),
        })
        console.log('[GitHubHttpService] Per-minute limiter created')

        const applyRateLimit = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
          Effect.gen(function* () {
            console.log('[applyRateLimit] Entering per-second limiter...')
            const result = yield* perSecondLimiter(
              Effect.gen(function* () {
                console.log('[applyRateLimit] Passed per-second, entering per-minute limiter...')
                return yield* perMinuteLimiter(
                  Effect.gen(function* () {
                    console.log('[applyRateLimit] Passed per-minute, executing effect...')
                    return yield* effect
                  })
                )
              })
            )
            console.log('[applyRateLimit] Effect completed')
            return result
          })

        const maxBackoffMillis = Duration.toMillis(
          Duration.seconds(maxBackoffSeconds)
        )

        const baseBackoffSchedule = pipe(
          Schedule.exponential(Duration.millis(backoffBaseMs)),
          Schedule.modifyDelay((_, duration) => {
            const capped = Math.min(
              Duration.toMillis(duration),
              maxBackoffMillis
            )
            return Duration.millis(capped)
          }),
          Schedule.jittered,
          Schedule.intersect(Schedule.recurs(maxRetries))
        )

        const apiRetrySchedule = pipe(
          baseBackoffSchedule,
          Schedule.whileInput(isRetriableApiError)
        )

        const makeAuthenticatedRequest = <A, I = unknown, R = never>(
          endpoint: string,
          token: string,
          schema: S.Schema<A, I, R>
        ): Effect.Effect<A, GitHubApiError, R> => {
          const requestEffect = Effect.gen(function* () {
            console.log(`[makeAuthenticatedRequest] Starting request to ${endpoint}`)
            console.log('[makeAuthenticatedRequest] Applying rate limit...')
            const response = yield* applyRateLimit(
              Effect.tryPromise({
                try: () => {
                  console.log(`[makeAuthenticatedRequest] Making fetch to https://api.github.com${endpoint}`)
                  return fetch(`https://api.github.com${endpoint}`, {
                    headers: {
                      Authorization: `Bearer ${token}`,
                      'User-Agent': 'GitHub-Desktop-Clone',
                      Accept: 'application/vnd.github.v3+json',
                    },
                  })
                },
                catch: error =>
                  new GitHubApiError({
                    message:
                      error instanceof Error ? error.message : 'Request failed',
                    endpoint,
                  }),
              })
            )
            console.log(`[makeAuthenticatedRequest] Received response, status: ${response.status}`)

            if (!response.ok) {
              const errorText = yield* Effect.tryPromise({
                try: () => response.text(),
                catch: () =>
                  new GitHubApiError({
                    message: 'Unknown error',
                    endpoint,
                    status: response.status,
                  }),
              })

              const remaining = yield* decodeOptionalHeaderInt(
                response.headers.get('x-ratelimit-remaining')
              )
              const reset = yield* decodeOptionalHeaderInt(
                response.headers.get('x-ratelimit-reset')
              )
              const retryAfter = yield* decodeOptionalHeaderInt(
                response.headers.get('retry-after')
              )

              const rateLimited =
                response.status === 429 ||
                (response.status === 403 &&
                  (remaining === 0 || /rate limit/i.test(errorText))) ||
                (typeof remaining === 'number' && remaining <= 0)

              if (rateLimited) {
                const nowSeconds = Math.floor(Date.now() / 1000)
                const secondsUntilReset =
                  typeof reset === 'number'
                    ? Math.max(reset - nowSeconds, 0)
                    : undefined

                yield* Effect.sync(() => {
                  console.warn(
                    `[GitHubHttpService] Rate limit encountered on ${endpoint}. retryAfter=${retryAfter ?? 'n/a'}s, resetIn=${secondsUntilReset ?? 'n/a'}s`
                  )
                })

                if (retryAfter && retryAfter > 0) {
                  yield* Effect.sleep(Duration.seconds(retryAfter))
                }
              }

              return yield* Effect.fail(
                new GitHubApiError({
                  message: rateLimited
                    ? `GitHub rate limit reached for ${endpoint}. ${
                        retryAfter
                          ? `Retry after ${retryAfter} seconds.`
                          : 'Please wait before retrying.'
                      }`
                    : `GitHub API error: ${response.status} ${response.statusText} - ${errorText}`,
                  status: response.status,
                  endpoint,
                  rateLimitRemaining: remaining,
                  rateLimitReset: reset,
                  retryAfter,
                })
              )
            }

            console.log('[makeAuthenticatedRequest] Parsing JSON response...')
            const data = yield* Effect.tryPromise({
              try: () => response.json(),
              catch: error =>
                new GitHubApiError({
                  message:
                    error instanceof Error
                      ? error.message
                      : 'Failed to parse response',
                  endpoint,
                }),
            })
            console.log('[makeAuthenticatedRequest] JSON parsed, validating schema...')

            const result = yield* S.decodeUnknown(schema)(data).pipe(
              Effect.mapError(
                error =>
                  new GitHubApiError({
                    message: `Schema validation failed: ${error.message}`,
                    endpoint,
                  })
              )
            )
            console.log('[makeAuthenticatedRequest] Schema validation successful')
            return result
          })

          return Effect.retry(requestEffect, apiRetrySchedule)
        }

        return {
          makeAuthenticatedRequest,

          exchangeCodeForToken: (
            code: string
          ): Effect.Effect<string, GitHubTokenExchangeError> =>
            Effect.gen(function* () {
              const clientId = process.env.GITHUB_CLIENT_ID || 'your-client-id'
              const clientSecret =
                process.env.GITHUB_CLIENT_SECRET || 'your-client-secret'

              const response = yield* applyRateLimit(
                Effect.tryPromise({
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
                  catch: error =>
                    new GitHubTokenExchangeError({
                      message:
                        error instanceof Error
                          ? error.message
                          : 'Token exchange failed',
                      code,
                    }),
                })
              )

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

              console.log(
                '[Token Exchange] Response data:',
                JSON.stringify(data, null, 2)
              )

              if (data.error) {
                return yield* Effect.fail(
                  new GitHubTokenExchangeError({
                    message: `GitHub OAuth error: ${data.error}${data.error_description ? ` - ${data.error_description}` : ''}`,
                    code,
                  })
                )
              }

              const tokenResponse = yield* S.decodeUnknown(GitHubTokenResponse)(
                data
              ).pipe(
                Effect.mapError(
                  error =>
                    new GitHubTokenExchangeError({
                      message: `Invalid token response format: ${JSON.stringify(data)}. Schema error: ${error.message}`,
                      code,
                    })
                )
              )

              return tokenResponse.access_token
            }),

          fetchUser: (
            token: string
          ): Effect.Effect<GitHubUser, GitHubApiError> =>
            makeAuthenticatedRequest('/user', token, GitHubUser),
        }
      })
    ),
  }
) {}
