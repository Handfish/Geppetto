/**
 * GitHub Issue IPC Handlers
 *
 * Handles IPC communication for GitHub Issues using the generic registerIpcHandler
 * pattern for type-safe, boilerplate-free handler registration.
 */

import { Effect } from 'effect'
import { GitHubIssueIpcContracts } from '../../shared/ipc-contracts'
import { GitHubApiService } from '../github/api-service'
import { registerIpcHandler } from './ipc-handler-setup'

/**
 * Setup GitHub Issue IPC handlers
 */
export const setupGitHubIssueIpcHandlers = Effect.gen(function* () {
  const apiService = yield* GitHubApiService

  // List issues for a repository
  registerIpcHandler(GitHubIssueIpcContracts['github:list-repository-issues'], (input) =>
    Effect.gen(function* () {
      console.log(`[IPC Handler] list-repository-issues called for ${input.owner}/${input.repo}`)
      const issues = yield* apiService.getIssuesForAccount(
        input.accountId,
        input.owner,
        input.repo,
        input.options
      )
      console.log(`[IPC Handler] list-repository-issues completed: ${issues.length} issues`)
      return issues
    }).pipe(
      Effect.tapError((error) =>
        Effect.sync(() => {
          console.error(`[IPC Handler] list-repository-issues failed for ${input.owner}/${input.repo}`, error)
        })
      )
    )
  )

  // Get a single issue by number
  registerIpcHandler(GitHubIssueIpcContracts['github:get-issue'], (input) =>
    Effect.gen(function* () {
      console.log(`[IPC Handler] get-issue called for ${input.owner}/${input.repo}#${input.issueNumber}`)
      const issue = yield* apiService.getIssueForAccount(
        input.accountId,
        input.owner,
        input.repo,
        input.issueNumber
      )
      console.log(`[IPC Handler] get-issue completed: #${issue.number} - ${issue.title}`)
      return issue
    }).pipe(
      Effect.tapError((error) =>
        Effect.sync(() => {
          console.error(`[IPC Handler] get-issue failed for ${input.owner}/${input.repo}#${input.issueNumber}`, error)
        })
      )
    )
  )

  // Get comments for an issue
  registerIpcHandler(GitHubIssueIpcContracts['github:get-issue-comments'], (input) =>
    Effect.gen(function* () {
      console.log(`[IPC Handler] get-issue-comments called for ${input.owner}/${input.repo}#${input.issueNumber}`)
      const comments = yield* apiService.getIssueCommentsForAccount(
        input.accountId,
        input.owner,
        input.repo,
        input.issueNumber
      )
      console.log(`[IPC Handler] get-issue-comments completed: ${comments.length} comments`)
      return comments
    }).pipe(
      Effect.tapError((error) =>
        Effect.sync(() => {
          console.error(`[IPC Handler] get-issue-comments failed for ${input.owner}/${input.repo}#${input.issueNumber}`, error)
        })
      )
    )
  )
})
