import { Data } from 'effect'

export class GitHubAuthError extends Data.TaggedError('GitHubAuthError')<{
  readonly message: string
  readonly cause?: unknown
}> {}

export class GitHubAuthTimeout extends Data.TaggedError('GitHubAuthTimeout')<{
  readonly message: string
}> {}

export class GitHubTokenExchangeError extends Data.TaggedError('GitHubTokenExchangeError')<{
  readonly message: string
  readonly code?: string
}> {}

export class GitHubApiError extends Data.TaggedError('GitHubApiError')<{
  readonly message: string
  readonly status?: number
  readonly endpoint?: string
  readonly rateLimitRemaining?: number
  readonly rateLimitReset?: number
  readonly retryAfter?: number
}> {}

export class NotAuthenticatedError extends Data.TaggedError('NotAuthenticatedError')<{
  readonly message: string
}> {}
