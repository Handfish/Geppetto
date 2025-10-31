import { Effect } from 'effect'
import type { GitHubIssue, GitHubIssueComment } from '../../../shared/schemas/github/issue'
import type { IssueError, IssueNotFoundError, IssueAccessDeniedError } from './errors'

/**
 * Issue Port - Abstract interface for GitHub Issues operations
 *
 * Implementations must handle:
 * - Fetching repository issues with filtering
 * - Getting individual issue details
 * - Fetching issue comments
 * - Proper error mapping to domain errors
 */
export interface IssuePort {
  /**
   * List issues for a repository
   */
  listIssues(params: {
    owner: string
    repo: string
    state?: 'open' | 'closed' | 'all'
    labels?: readonly string[]
    assignee?: string
    limit?: number
  }): Effect.Effect<readonly GitHubIssue[], IssueError>

  /**
   * Get a specific issue by number
   */
  getIssue(params: {
    owner: string
    repo: string
    issueNumber: number
  }): Effect.Effect<
    GitHubIssue,
    IssueError | IssueNotFoundError | IssueAccessDeniedError
  >

  /**
   * List comments for an issue
   */
  listComments(params: {
    owner: string
    repo: string
    issueNumber: number
  }): Effect.Effect<readonly GitHubIssueComment[], IssueError>
}
