import { Effect, Stream, Scope, Schema as S } from 'effect'
import type {
  GitCommandEvent,
  GitCommandResult,
} from '../../shared/schemas/source-control'
import { GitCommandRequest, GitWorktreeContext, GitCommandId } from '../../shared/schemas/source-control'
import type { GitCommandDomainError } from '../../shared/schemas/source-control/errors'
import { NodeGitCommandRunner } from './adapters/git/node-git-command-runner'
import type { GitCommandExecutionHandle } from './ports'
import { RepositoryService } from './services/repository-service'
import { RepositoryId } from './domain/aggregates/repository'
import { NotFoundError, GitOperationError } from '../../shared/schemas/errors'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'

// Helper to create a properly branded GitCommandId
const makeCommandId = (): GitCommandId => {
  return S.decodeSync(GitCommandId)(randomUUID())
}

/**
 * Application service orchestrating command executions via the runner port.
 * Provides higher-level conveniences tailored to the renderer's UX needs.
 */
export class GitCommandService extends Effect.Service<GitCommandService>()(
  'GitCommandService',
  {
    dependencies: [NodeGitCommandRunner.Default, RepositoryService.Default],
    effect: Effect.gen(function* () {
      const runner = yield* NodeGitCommandRunner
      const repositoryService = yield* RepositoryService

      const startExecution = (
        request: GitCommandRequest
      ): Effect.Effect<
        GitCommandExecutionHandle,
        GitCommandDomainError,
        Scope.Scope
      > =>
        runner.execute(request).pipe(
          Effect.map(handle => ({
            ...handle,
            events: handle.events,
          }))
        )

      const runToCompletion = (
        request: GitCommandRequest
      ): Effect.Effect<GitCommandResult, GitCommandDomainError> =>
        Effect.scoped(
          Effect.gen(function* () {
            const execution = yield* startExecution(request)
            return yield* execution.awaitResult
          })
        )

      const streamCommand = (
        request: GitCommandRequest
      ): Effect.Effect<
        Stream.Stream<GitCommandEvent, never, never>,
        GitCommandDomainError
      > =>
        Effect.scoped(
          Effect.gen(function* () {
            const execution = yield* startExecution(request)
            return execution.events
          })
        )

      /**
       * Create a worktree for a GitHub issue
       *
       * This method:
       * 1. Checks if branch `issue#<number>` exists
       * 2. If exists, creates worktree from that branch
       * 3. If not, creates new branch from baseBranch (defaults to default branch)
       * 4. Creates worktree in ../worktree-issue#<number> relative to repo root
       */
      const createWorktreeForIssue = (
        repositoryId: RepositoryId,
        issueNumber: number,
        baseBranch?: string
      ): Effect.Effect<
        { worktreePath: string; branchName: string; branchExisted: boolean },
        NotFoundError | GitOperationError
      > =>
        Effect.gen(function* () {
          // Get repository to access path
          const repo = yield* repositoryService.getRepositoryById(repositoryId).pipe(
            Effect.mapError((error) =>
              new NotFoundError({
                message: `Repository not found: ${repositoryId}`,
                resource: 'repository',
              })
            )
          )

          const branchName = `issue#${issueNumber}`
          const repoPath = repo.path
          // repo.path points to the parent directory (e.g., .../Handfish-github-Basic_React_Application)
          // Create worktree in the same directory as the main worktree
          const worktreePath = path.join(repoPath, branchName)

          // Check if branch exists
          const branchCheckResult = yield* runToCompletion(
            new GitCommandRequest({
              id: makeCommandId(),
              binary: 'git',
              args: ['rev-parse', '--verify', branchName],
              worktree: new GitWorktreeContext({
                repositoryPath: repoPath,
              }),
            })
          ).pipe(
            Effect.map(() => true),
            Effect.catchAll(() => Effect.succeed(false))
          )

          let branchExisted = branchCheckResult

          if (!branchExisted) {
            // Branch doesn't exist - need to create it
            // First, determine base branch if not provided
            let effectiveBaseBranch = baseBranch ?? repo.config?.defaultBranch

            // If still no base branch, detect from git
            if (!effectiveBaseBranch) {
              const defaultBranchResult = yield* runToCompletion(
                new GitCommandRequest({
                  id: makeCommandId(),
                  binary: 'git',
                  args: ['symbolic-ref', 'refs/remotes/origin/HEAD'],
                  worktree: new GitWorktreeContext({
                    repositoryPath: repoPath,
                  }),
                })
              ).pipe(
                Effect.map((result) => {
                  // Output is like "refs/remotes/origin/master"
                  const stdout = result.stdout ?? ''
                  const match = stdout.trim().match(/refs\/remotes\/origin\/(.+)/)
                  return match ? match[1] : 'main'
                }),
                Effect.catchAll(() => Effect.succeed('main'))
              )
              effectiveBaseBranch = defaultBranchResult
            }

            // Create new branch from base branch
            yield* runToCompletion(
              new GitCommandRequest({
                id: makeCommandId(),
                binary: 'git',
                args: ['branch', branchName, String(effectiveBaseBranch)],
                worktree: new GitWorktreeContext({
                  repositoryPath: repoPath,
                }),
              })
            ).pipe(
              Effect.mapError((error) =>
                new GitOperationError({
                  message: `Failed to create branch ${branchName} from ${effectiveBaseBranch}`,
                  stderr: error._tag === 'GitCommandFailedError' ? error.stderr : String(error),
                })
              )
            )
          }

          // Check if worktree already exists and prune if needed
          const existingWorktrees = yield* listWorktrees(repositoryId).pipe(
            Effect.catchAll(() => Effect.succeed([]))
          )

          const existingWorktree = existingWorktrees.find(w => w.branch === branchName)
          if (existingWorktree) {
            // If worktree exists at the correct path, just return it
            if (existingWorktree.path === worktreePath) {
              return {
                worktreePath,
                branchName,
                branchExisted,
              }
            }

            // Otherwise, prune stale worktrees before creating new one
            yield* runToCompletion(
              new GitCommandRequest({
                id: makeCommandId(),
                binary: 'git',
                args: ['worktree', 'prune'],
                worktree: new GitWorktreeContext({
                  repositoryPath: repoPath,
                }),
              })
            ).pipe(
              Effect.catchAll(() => Effect.void) // Ignore prune errors
            )
          }

          // Create worktree
          yield* runToCompletion(
            new GitCommandRequest({
              id: makeCommandId(),
              binary: 'git',
              args: ['worktree', 'add', worktreePath, branchName],
              worktree: new GitWorktreeContext({
                repositoryPath: repoPath,
              }),
            })
          ).pipe(
            Effect.mapError((error) =>
              new GitOperationError({
                message: `Failed to create worktree at ${worktreePath}`,
                stderr: error._tag === 'GitCommandFailedError' ? error.stderr : String(error),
              })
            )
          )

          return {
            worktreePath,
            branchName,
            branchExisted,
          }
        })

      /**
       * Remove a worktree
       */
      const removeWorktree = (
        repositoryId: RepositoryId,
        worktreePath: string
      ): Effect.Effect<void, NotFoundError | GitOperationError> =>
        Effect.gen(function* () {
          const repo = yield* repositoryService.getRepositoryById(repositoryId).pipe(
            Effect.mapError((error) =>
              new NotFoundError({
                message: `Repository not found: ${repositoryId}`,
                resource: 'repository',
              })
            )
          )

          yield* runToCompletion(
            new GitCommandRequest({
              id: makeCommandId(),
              binary: 'git',
              args: ['worktree', 'remove', worktreePath, '--force'],
              worktree: new GitWorktreeContext({
                repositoryPath: repo.path,
              }),
            })
          ).pipe(
            Effect.mapError((error) =>
              new GitOperationError({
                message: `Failed to remove worktree at ${worktreePath}`,
                stderr: error._tag === 'GitCommandFailedError' ? error.stderr : String(error),
              })
            )
          )
        })

      /**
       * List all worktrees for a repository
       */
      const listWorktrees = (
        repositoryId: RepositoryId
      ): Effect.Effect<
        Array<{ path: string; branch: string; isMainWorktree: boolean }>,
        NotFoundError | GitOperationError
      > =>
        Effect.gen(function* () {
          const repo = yield* repositoryService.getRepositoryById(repositoryId).pipe(
            Effect.mapError((error) =>
              new NotFoundError({
                message: `Repository not found: ${repositoryId}`,
                resource: 'repository',
              })
            )
          )

          const result = yield* runToCompletion(
            new GitCommandRequest({
              id: makeCommandId(),
              binary: 'git',
              args: ['worktree', 'list', '--porcelain'],
              worktree: new GitWorktreeContext({
                repositoryPath: repo.path,
              }),
            })
          ).pipe(
            Effect.mapError((error) =>
              new GitOperationError({
                message: 'Failed to list worktrees',
                stderr: error._tag === 'GitCommandFailedError' ? error.stderr : String(error),
              })
            )
          )

          // Parse porcelain output
          const worktrees: Array<{ path: string; branch: string; isMainWorktree: boolean }> = []
          const lines = (result.stdout ?? '').split('\n').filter((line) => line.trim())

          let currentWorktree: { path?: string; branch?: string; isMainWorktree?: boolean } = {}

          for (const line of lines) {
            if (line.startsWith('worktree ')) {
              // Save previous worktree if complete
              if (currentWorktree.path && currentWorktree.branch !== undefined) {
                worktrees.push({
                  path: currentWorktree.path,
                  branch: currentWorktree.branch,
                  isMainWorktree: currentWorktree.isMainWorktree ?? false,
                })
              }
              currentWorktree = { path: line.substring('worktree '.length) }
            } else if (line.startsWith('branch ')) {
              currentWorktree.branch = line.substring('branch refs/heads/'.length)
            } else if (line === 'bare') {
              currentWorktree.isMainWorktree = true
            } else if (line.startsWith('HEAD ')) {
              if (!currentWorktree.branch) {
                currentWorktree.branch = 'HEAD'
              }
            }
          }

          // Save last worktree
          if (currentWorktree.path && currentWorktree.branch !== undefined) {
            worktrees.push({
              path: currentWorktree.path,
              branch: currentWorktree.branch,
              isMainWorktree: currentWorktree.isMainWorktree ?? false,
            })
          }

          return worktrees
        })

      return {
        startExecution,
        runToCompletion,
        streamCommand,
        createWorktreeForIssue,
        removeWorktree,
        listWorktrees,
      }
    }),
  }
) {}
