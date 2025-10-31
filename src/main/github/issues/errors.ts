import { Data } from 'effect'

/**
 * Generic issue operation error
 */
export class IssueError extends Data.TaggedError('IssueError')<{
  readonly message: string
  readonly cause?: unknown
}> {}

/**
 * Issue not found error (404)
 */
export class IssueNotFoundError extends Data.TaggedError('IssueNotFoundError')<{
  readonly issueNumber: number
  readonly owner: string
  readonly repo: string
}> {}

/**
 * Issue access denied error (403)
 */
export class IssueAccessDeniedError extends Data.TaggedError(
  'IssueAccessDeniedError'
)<{
  readonly issueNumber: number
  readonly owner: string
  readonly repo: string
  readonly message: string
}> {}
