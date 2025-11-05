import { useState } from 'react'
import { useAtom } from '@effect-atom/atom-react'
import { createRunnerAtom } from '../atoms/process-runner-atoms'
import { spawnWatcherAtom } from '../atoms/terminal-atoms'
import type { GitHubIssue } from '../../shared/schemas/github/issue'
import type { ProcessRunnerConfig } from '../../shared/schemas/process-runners'
import { SourceControlClient, WorkspaceClient } from '../lib/ipc-client'
import { Effect } from 'effect'
import { toast } from 'sonner'
import { useTerminalType } from '../atoms/terminal-settings-atoms'

/**
 * Hook for launching process runners for GitHub issues
 *
 * Features:
 * - Creates isolated git worktrees per issue
 * - Launches runners with issue context
 * - Sequential launching to avoid git conflicts
 * - Toast notifications for user feedback
 */
export function useProcessRunnerLauncher() {
  const [createResult, createRunner] = useAtom(createRunnerAtom)
  const [spawnResult, spawnWatcher] = useAtom(spawnWatcherAtom)
  const [isCreatingWorktree, setIsCreatingWorktree] = useState(false)
  const { terminalType } = useTerminalType()

  /**
   * Launch a runner for a specific GitHub issue
   *
   * Creates a git worktree in `issue#<number>` branch, then launches process runner in that worktree
   */
  const launchRunnerForIssue = async (
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
      console.log(`[useProcessRunnerLauncher] Checking workspace for ${owner}/${repo}`)

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
      console.log(`[useProcessRunnerLauncher] Using current repository ID: ${currentRepositoryId.value}`)

      // Step 2: Create worktree for the issue
      console.log(`[useProcessRunnerLauncher] Creating worktree for issue #${issue.number}`)

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
        `[useProcessRunnerLauncher] Worktree created: ${worktreeResult.worktreePath}`
      )

      // Only show toast for newly created branches (not existing ones)
      if (!worktreeResult.branchExisted) {
        toast.success(
          `Created new branch '${worktreeResult.branchName}' for issue #${issue.number}`
        )
      }

      // Step 3: Create process runner config with worktree path
      const config: ProcessRunnerConfig = {
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

      // Step 4: Launch the runner (use terminal type preference)
      console.log(`[useProcessRunnerLauncher] Launching ${provider} runner with ${terminalType}`)

      if (terminalType === 'xterm') {
        // Use new xterm.js + node-pty terminal
        spawnWatcher({
          accountId: `${provider}:user`, // TODO: Get actual account ID from context
          agentType: provider === 'claude-code' ? 'claude' : provider === 'codex' ? 'codex' : 'cursor',
          prompt: `Work on issue #${issue.number}: ${issue.title}`,
          issueContext: {
            owner,
            repo,
            issueNumber: issue.number,
            issueTitle: issue.title,
            worktreePath: worktreeResult.worktreePath,
            branchName: worktreeResult.branchName,
          },
        })
      } else {
        // Use traditional tmux terminal
        createRunner(config)
      }

      toast.success(
        `Launched ${provider} for issue #${issue.number} (${terminalType})`,
        {
          duration: 4000,
        }
      )
    } catch (error) {
      console.error('[useProcessRunnerLauncher] Failed to launch runner:', error)

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
   * Launch runners for multiple issues sequentially
   *
   * Sequential launching prevents git worktree conflicts
   */
  const launchRunnersForIssues = async (
    issues: GitHubIssue[],
    provider: 'claude-code' | 'codex' | 'cursor',
    repositoryId: { value: string },
    owner: string,
    repo: string
  ) => {
    for (const issue of issues) {
      await launchRunnerForIssue(issue, provider, repositoryId, owner, repo)
    }
  }

  return {
    launchRunnerForIssue,
    launchRunnersForIssues,
    isLaunching: createResult.waiting || spawnResult.waiting || isCreatingWorktree,
    createResult,
    spawnResult,
    terminalType,
  }
}

// Backwards compatibility alias
export const useAiWatcherLauncher = useProcessRunnerLauncher
