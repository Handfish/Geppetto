import { useState } from 'react'
import { useAtom } from '@effect-atom/atom-react'
import { createWatcherAtom } from '../atoms/ai-watcher-atoms'
import type { GitHubIssue } from '../../shared/schemas/github/issue'
import type { AiWatcherConfig } from '../../main/ai-watchers/schemas'
import { SourceControlClient, WorkspaceClient } from '../lib/ipc-client'
import { Effect } from 'effect'
import { toast } from 'sonner'

/**
 * Hook for launching AI watchers for GitHub issues
 *
 * Features:
 * - Creates isolated git worktrees per issue
 * - Launches watchers with issue context
 * - Sequential launching to avoid git conflicts
 * - Toast notifications for user feedback
 */
export function useAiWatcherLauncher() {
  const [createResult, createWatcher] = useAtom(createWatcherAtom)
  const [isCreatingWorktree, setIsCreatingWorktree] = useState(false)

  /**
   * Launch a watcher for a specific GitHub issue
   *
   * Creates a git worktree in `issue#<number>` branch, then launches AI watcher in that worktree
   */
  const launchWatcherForIssue = async (
    issue: GitHubIssue,
    provider: 'claude-code' | 'codex' | 'cursor',
    repositoryId: { value: string } | null,
    owner: string,
    repo: string,
    repoProvider: string = 'github',
    defaultBranch: string = 'main'
  ) => {
    setIsCreatingWorktree(true)

    try {
      // Step 1: Get fresh repository ID from workspace (handles cache invalidation)
      console.log(`[useAiWatcherLauncher] Checking workspace for ${owner}/${repo}`)

      const workspaceCheck = await Effect.runPromise(
        Effect.gen(function* () {
          const client = yield* WorkspaceClient
          return yield* client.checkRepositoryInWorkspace({
            owner,
            repoName: repo,
            provider: repoProvider,
            defaultBranch,
          })
        }).pipe(Effect.provide(WorkspaceClient.Default))
      )

      if (!workspaceCheck.inWorkspace || !workspaceCheck.repositoryId) {
        throw new Error(`Repository ${owner}/${repo} not found in workspace`)
      }

      const currentRepositoryId = workspaceCheck.repositoryId
      console.log(`[useAiWatcherLauncher] Using current repository ID: ${currentRepositoryId.value}`)

      // Step 2: Create worktree for the issue
      console.log(`[useAiWatcherLauncher] Creating worktree for issue #${issue.number}`)

      const worktreeResult = await Effect.runPromise(
        Effect.gen(function* () {
          const client = yield* SourceControlClient
          return yield* client.createWorktreeForIssue({
            repositoryId: currentRepositoryId,
            issueNumber: issue.number,
          })
        }).pipe(Effect.provide(SourceControlClient.Default))
      )

      console.log(
        `[useAiWatcherLauncher] Worktree created: ${worktreeResult.worktreePath}`
      )

      // Only show toast for newly created branches (not existing ones)
      if (!worktreeResult.branchExisted) {
        toast.success(
          `Created new branch '${worktreeResult.branchName}' for issue #${issue.number}`
        )
      }

      // Step 3: Create AI watcher config with worktree path
      const config: AiWatcherConfig = {
        type: provider,
        name: `${provider}: #${issue.number} ${issue.title}`,
        workingDirectory: worktreeResult.worktreePath,
        issueContext: {
          owner,
          repo,
          issueNumber: issue.number,
          issueTitle: issue.title,
        },
      }

      // Step 4: Launch the watcher
      console.log(`[useAiWatcherLauncher] Launching ${provider} watcher`)
      createWatcher(config)

      toast.success(
        `Launched ${provider} for issue #${issue.number}`,
        {
          duration: 4000,
        }
      )
    } catch (error) {
      console.error('[useAiWatcherLauncher] Failed to launch watcher:', error)

      // Extract error message and stderr if available
      const errorMessage = error instanceof Error ? error.message : String(error)
      const stderr = (error as any)?.stderr || (error as any)?.error?.stderr

      const fullMessage = stderr
        ? `${errorMessage}\n\nGit output:\n${stderr}`
        : errorMessage

      toast.error(`Failed to create worktree: ${fullMessage}`, {
        duration: 8000, // Longer for stderr
      })
      throw error
    } finally {
      setIsCreatingWorktree(false)
    }
  }

  /**
   * Launch watchers for multiple issues sequentially
   *
   * Sequential launching prevents git worktree conflicts
   */
  const launchWatchersForIssues = async (
    issues: GitHubIssue[],
    provider: 'claude-code' | 'codex' | 'cursor',
    repositoryId: { value: string },
    owner: string,
    repo: string
  ) => {
    for (const issue of issues) {
      await launchWatcherForIssue(issue, provider, repositoryId, owner, repo)
    }
  }

  return {
    launchWatcherForIssue,
    launchWatchersForIssues,
    isLaunching: createResult.waiting || isCreatingWorktree,
    createResult,
  }
}
