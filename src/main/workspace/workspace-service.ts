import { Effect, Schema as S } from 'effect'
import Store from 'electron-store'
import { dialog } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { WorkspaceConfig } from '../../shared/schemas/workspace'
import { GitCommandService } from '../source-control/git-command-service'
import { GitCommandRequest, GitWorktreeContext } from '../../shared/schemas/source-control/command'

/**
 * WorkspaceService - Manages workspace directory configuration
 *
 * Stores the current workspace path and recent workspace paths
 * for git operations and repository management.
 */
export class WorkspaceService extends Effect.Service<WorkspaceService>()(
  'WorkspaceService',
  {
    dependencies: [GitCommandService.Default],
    effect: Effect.gen(function* () {
      const gitCommandService = yield* GitCommandService

      const store = new Store({
        name: 'workspace-config',
        clearInvalidConfig: true,
      })

      return {
        /**
         * Get the current workspace configuration
         */
        getConfig: Effect.sync(() => {
          const currentPath = store.get('currentPath') as string | null | undefined
          const recentPaths = (store.get('recentPaths') as string[] | undefined) ?? []

          return new WorkspaceConfig({
            currentPath: currentPath ?? null,
            recentPaths,
          })
        }),

        /**
         * Set the workspace path
         */
        setWorkspacePath: (path: string) =>
          Effect.sync(() => {
            const recentPaths = (store.get('recentPaths') as string[] | undefined) ?? []

            // Add to recent paths if not already there
            const updatedRecentPaths = [
              path,
              ...recentPaths.filter(p => p !== path)
            ].slice(0, 10) // Keep only last 10

            store.set('currentPath', path)
            store.set('recentPaths', updatedRecentPaths)
          }),

        /**
         * Open directory picker dialog and return selected path
         */
        selectDirectory: Effect.promise(async () => {
          const result = await dialog.showOpenDialog({
            properties: ['openDirectory', 'createDirectory'],
            title: 'Select Workspace Directory',
            buttonLabel: 'Select Workspace',
          })

          if (result.canceled || result.filePaths.length === 0) {
            return null
          }

          return result.filePaths[0]
        }),

        /**
         * Clear the current workspace path
         */
        clearWorkspacePath: Effect.sync(() => {
          store.delete('currentPath')
        }),

        /**
         * Check if a repository is already cloned in the workspace
         */
        checkRepositoryInWorkspace: (owner: string, repoName: string) =>
          Effect.gen(function* () {
            const currentPath = store.get('currentPath') as string | null | undefined

            if (!currentPath) {
              return {
                inWorkspace: false,
                bareRepoPath: null,
                worktreePath: null,
              }
            }

            const bareRepoPath = path.join(currentPath, 'repos', `${owner}_${repoName}.git`)
            const worktreePath = path.join(currentPath, 'worktrees', `${owner}_${repoName}`)

            // Check if both paths exist, catching errors gracefully
            const checkPath = (pathToCheck: string) =>
              Effect.tryPromise({
                try: () => fs.access(pathToCheck),
                catch: () => new Error('Path does not exist'),
              }).pipe(
                Effect.map(() => true),
                Effect.catchAll(() => Effect.succeed(false))
              )

            const bareRepoExists = yield* checkPath(bareRepoPath)
            const worktreeExists = yield* checkPath(worktreePath)

            if (bareRepoExists && worktreeExists) {
              return {
                inWorkspace: true,
                bareRepoPath,
                worktreePath,
              }
            }

            return {
              inWorkspace: false,
              bareRepoPath: null,
              worktreePath: null,
            }
          }),

        /**
         * Clone repository to workspace using bare repo + worktree pattern
         */
        cloneToWorkspace: (
          cloneUrl: string,
          repoName: string,
          owner: string,
          defaultBranch: string
        ) =>
          Effect.gen(function* () {
            const currentPath = store.get('currentPath') as string | null | undefined

            if (!currentPath) {
              return yield* Effect.fail(new Error('No workspace path configured'))
            }

            // Create directory structure
            const reposDir = path.join(currentPath, 'repos')
            const worktreesDir = path.join(currentPath, 'worktrees')
            const bareRepoPath = path.join(reposDir, `${owner}_${repoName}.git`)
            const worktreePath = path.join(worktreesDir, `${owner}_${repoName}`)

            console.log('[WorkspaceService] Starting clone:', {
              cloneUrl,
              repoName,
              owner,
              defaultBranch,
              bareRepoPath,
              worktreePath,
            })

            // Ensure directories exist
            yield* Effect.promise(() => fs.mkdir(reposDir, { recursive: true }))
            yield* Effect.promise(() => fs.mkdir(worktreesDir, { recursive: true }))

            console.log('[WorkspaceService] Directories created, starting bare clone...')

            // Step 1: Clone bare repository
            // Run from reposDir as working directory
            const cloneRequest = new GitCommandRequest({
              id: S.UUID.make(randomUUID()),
              binary: 'git',
              args: ['clone', '--bare', cloneUrl, bareRepoPath],
              worktree: new GitWorktreeContext({
                repositoryPath: reposDir,  // cwd for the clone command
              }),
            })

            console.log('[WorkspaceService] Clone request:', cloneRequest)
            const cloneResult = yield* gitCommandService.runToCompletion(cloneRequest).pipe(
              Effect.tap(() => Effect.sync(() => console.log('[WorkspaceService] Clone completed successfully'))),
              Effect.tapError((error) => Effect.sync(() => console.error('[WorkspaceService] Clone failed:', error))),
              Effect.timeout('60 seconds')
            )
            console.log('[WorkspaceService] Clone result:', cloneResult)

            // Step 2: Add worktree for default branch
            // Run from bare repo directory (must be inside git repo)
            console.log('[WorkspaceService] Starting worktree add...')
            const worktreeRequest = new GitCommandRequest({
              id: S.UUID.make(randomUUID()),
              binary: 'git',
              args: ['worktree', 'add', worktreePath, defaultBranch],
              worktree: new GitWorktreeContext({
                repositoryPath: bareRepoPath,  // cwd must be the bare repo
              }),
            })

            console.log('[WorkspaceService] Worktree request:', worktreeRequest)
            const worktreeResult = yield* gitCommandService.runToCompletion(worktreeRequest)
            console.log('[WorkspaceService] Worktree result:', worktreeResult)

            return {
              bareRepoPath,
              worktreePath,
            }
          }),
      }
    }),
  }
) {}
