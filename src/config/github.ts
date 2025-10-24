import { Config } from 'effect'

export const GitHubRateLimitDefaults = {
  requestsPerSecond: 4,
  requestsPerMinute: 60,
  maxRetries: 5,
  backoffBaseMs: 250,
  maxBackoffSeconds: 30,
} as const

const positiveInteger = (name: string, fallback: number) =>
  Config.withDefault(
    Config.map(Config.integer(name), value => (value > 0 ? value : fallback)),
    fallback
  )

const nonNegativeInteger = (name: string, fallback: number) =>
  Config.withDefault(
    Config.map(Config.integer(name), value => (value >= 0 ? value : fallback)),
    fallback
  )

export const GitHubRateLimitConfig = Config.all({
  requestsPerSecond: positiveInteger(
    'GITHUB_REQUESTS_PER_SECOND',
    GitHubRateLimitDefaults.requestsPerSecond
  ),
  requestsPerMinute: positiveInteger(
    'GITHUB_REQUESTS_PER_MINUTE',
    GitHubRateLimitDefaults.requestsPerMinute
  ),
  maxRetries: nonNegativeInteger(
    'GITHUB_MAX_RETRIES',
    GitHubRateLimitDefaults.maxRetries
  ),
  backoffBaseMs: positiveInteger(
    'GITHUB_BACKOFF_BASE_MS',
    GitHubRateLimitDefaults.backoffBaseMs
  ),
  maxBackoffSeconds: positiveInteger(
    'GITHUB_BACKOFF_MAX_SECONDS',
    GitHubRateLimitDefaults.maxBackoffSeconds
  ),
})

export type GitHubRateLimitSettings = Config.Success<
  typeof GitHubRateLimitConfig
>
