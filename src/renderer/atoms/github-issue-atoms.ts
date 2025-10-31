import { Atom } from '@effect-atom/atom-react'
import { Effect, Duration } from 'effect'
import type { AccountId } from '../../shared/schemas/account-context'
import { GitHubIssueClient } from '../lib/ipc-client'

/**
 * GitHub Issue Atoms - Reactive state management for GitHub Issues
 *
 * Provides atoms for:
 * - Listing repository issues with filtering
 * - Getting individual issue details
 * - Fetching issue comments
 */

const issueRuntime = Atom.runtime(GitHubIssueClient.Default)

/**
 * List issues for a repository
 * Refreshes every 5 minutes
 */
export const repositoryIssuesAtom = Atom.family(
  (params: {
    accountId: AccountId
    owner: string
    repo: string
    options?: {
      state?: 'open' | 'closed' | 'all'
      labels?: string[]
      assignee?: string
      limit?: number
    }
  }) =>
    issueRuntime
      .atom(
        Effect.gen(function* () {
          console.log(
            `[repositoryIssuesAtom] Fetching issues for ${params.owner}/${params.repo}`
          )
          const client = yield* GitHubIssueClient
          const issues = yield* client.listRepositoryIssues(params)
          console.log(
            `[repositoryIssuesAtom] Fetched ${issues.length} issues for ${params.owner}/${params.repo}`
          )
          return issues
        })
      )
      .pipe(
        Atom.withReactivity([
          'github:issues',
          params.accountId,
          params.owner,
          params.repo,
        ]),
        Atom.setIdleTTL(Duration.minutes(5))
      )
)

/**
 * Get specific issue details
 * Refreshes every 10 minutes
 */
export const issueDetailsAtom = Atom.family(
  (params: {
    accountId: AccountId
    owner: string
    repo: string
    issueNumber: number
  }) =>
    issueRuntime
      .atom(
        Effect.gen(function* () {
          console.log(
            `[issueDetailsAtom] Fetching issue ${params.owner}/${params.repo}#${params.issueNumber}`
          )
          const client = yield* GitHubIssueClient
          const issue = yield* client.getIssue(params)
          console.log(
            `[issueDetailsAtom] Fetched issue #${issue.number}: ${issue.title}`
          )
          return issue
        })
      )
      .pipe(
        Atom.withReactivity([
          'github:issue',
          params.accountId,
          params.owner,
          params.repo,
          params.issueNumber,
        ]),
        Atom.setIdleTTL(Duration.minutes(10))
      )
)

/**
 * Get comments for an issue
 * Manual refresh only - no auto-refresh TTL
 */
export const issueCommentsAtom = Atom.family(
  (params: {
    accountId: AccountId
    owner: string
    repo: string
    issueNumber: number
  }) =>
    issueRuntime
      .atom(
        Effect.gen(function* () {
          console.log(
            `[issueCommentsAtom] Fetching comments for ${params.owner}/${params.repo}#${params.issueNumber}`
          )
          const client = yield* GitHubIssueClient
          const comments = yield* client.getIssueComments(params)
          console.log(
            `[issueCommentsAtom] Fetched ${comments.length} comments for issue #${params.issueNumber}`
          )
          return comments
        })
      )
      .pipe(
        Atom.withReactivity([
          'github:issue:comments',
          params.accountId,
          params.owner,
          params.repo,
          params.issueNumber,
        ])
        // No TTL - manual refresh controlled by components
      )
)
