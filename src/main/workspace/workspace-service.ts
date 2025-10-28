import { Effect, Schema as S } from 'effect'
import { Path } from '@effect/platform'
import Store from 'electron-store'
import { dialog } from 'electron'
import { promises as fs } from 'fs'
import { randomUUID } from 'crypto'
import { WorkspaceConfig } from '../../shared/schemas/workspace'
import { GitCommandService } from '../source-control/git-command-service'
import { GitCommandRequest, GitWorktreeContext, GitCommandId } from '../../shared/schemas/source-control/command'
import { RepositoryService } from '../source-control/services/repository-service'

/**
 * WorkspaceService - Manages workspace directory configuration
 *
 * Stores the current workspace path and recent workspace paths
 * for git operations and repository management.
 */
export class WorkspaceService extends Effect.Service<WorkspaceService>()(
  'WorkspaceService',
  {
    dependencies: [
      GitCommandService.Default,
      RepositoryService.Default,
      Path.layer,
    ],
    effect: Effect.gen(function* () {
      const gitCommandService = yield* GitCommandService
      const repositoryService = yield* RepositoryService
      const path = yield* Path.Path

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
        checkRepositoryInWorkspace: (owner: string, repoName: string, provider: string, defaultBranch: string) =>
          Effect.gen(function* () {
            const currentPath = store.get('currentPath') as string | null | undefined

            if (!currentPath) {
              return {
                inWorkspace: false,
                bareRepoPath: null,
                worktreePath: null,
              }
            }

            // New structure: {owner}-{provider}-{repoName}/
            //   ├── .git (bare repo)
            //   └── {defaultBranch}/ (worktree)
            const repoParentDir = path.join(currentPath, `${owner}-${provider}-${repoName}`)
            const bareRepoPath = path.join(repoParentDir, '.git')
            const worktreePath = path.join(repoParentDir, defaultBranch)

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
         *
         * New structure: {owner}-{provider}-{repoName}/
         *   ├── .git (bare repo cloned here)
         *   └── {defaultBranch}/ (worktree added as sibling)
         */
        cloneToWorkspace: (
          cloneUrl: string,
          repoName: string,
          owner: string,
          defaultBranch: string,
          provider: string
        ) =>
          Effect.gen(function* () {
            const currentPath = store.get('currentPath') as string | null | undefined

            if (!currentPath) {
              return yield* Effect.fail(new Error('No workspace path configured'))
            }

            // Create parent directory: {owner}-{provider}-{repoName}
            const repoParentDir = path.join(currentPath, `${owner}-${provider}-${repoName}`)
            const bareRepoPath = path.join(repoParentDir, '.git')
            const worktreePath = path.join(repoParentDir, defaultBranch)

            console.log('[WorkspaceService] Starting clone:', {
              cloneUrl,
              repoName,
              owner,
              provider,
              defaultBranch,
              repoParentDir,
              bareRepoPath,
              worktreePath,
            })

            // Ensure workspace directory exists (but NOT the repo parent dir - let git create it)
            console.log('[WorkspaceService] Starting clone...')

            // Step 1: Clone with --no-checkout and bare config
            // Git will create the directory for us
            const cloneRequest = new GitCommandRequest({
              id: randomUUID() as GitCommandId,
              binary: 'git',
              args: ['clone', '--no-checkout', '-c', 'core.bare=true', cloneUrl, `${owner}-${provider}-${repoName}`],
              worktree: new GitWorktreeContext({
                repositoryPath: currentPath,  // Run from workspace root, git creates the dir
              }),
            })

            console.log('[WorkspaceService] Clone request:', cloneRequest)
            const cloneResult = yield* gitCommandService.runToCompletion(cloneRequest).pipe(
              Effect.tap(() => Effect.sync(() => console.log('[WorkspaceService] Clone completed successfully'))),
              Effect.tapError((error) => Effect.sync(() => console.error('[WorkspaceService] Clone failed:', error))),
              Effect.timeout('120 seconds')
            )
            console.log('[WorkspaceService] Clone result:', cloneResult)
            if (cloneResult.stdout) {
              console.log('[WorkspaceService] Clone stdout:', cloneResult.stdout)
            }
            if (cloneResult.stderr) {
              console.log('[WorkspaceService] Clone stderr:', cloneResult.stderr)
            }

            // Step 2: cd into directory and add worktree
            console.log('[WorkspaceService] Starting worktree add...')
            const worktreeRequest = new GitCommandRequest({
              id: randomUUID() as GitCommandId,
              binary: 'git',
              args: ['worktree', 'add', defaultBranch, defaultBranch],
              worktree: new GitWorktreeContext({
                repositoryPath: repoParentDir,  // cd into the cloned directory
              }),
            })

            console.log('[WorkspaceService] Worktree request:', worktreeRequest)
            const worktreeResult = yield* gitCommandService.runToCompletion(worktreeRequest).pipe(
              Effect.tap(() => Effect.sync(() => console.log('[WorkspaceService] Worktree completed successfully'))),
              Effect.tapError((error) => Effect.sync(() => console.error('[WorkspaceService] Worktree failed:', error))),
              Effect.timeout('30 seconds')
            )
            console.log('[WorkspaceService] Worktree result:', worktreeResult)
            if (worktreeResult.stdout) {
              console.log('[WorkspaceService] Worktree stdout:', worktreeResult.stdout)
            }
            if (worktreeResult.stderr) {
              console.log('[WorkspaceService] Worktree stderr:', worktreeResult.stderr)
            }

            // Verify the worktree was created
            const worktreeExists = yield* Effect.tryPromise({
              try: () => fs.access(worktreePath),
              catch: () => new Error('Worktree directory was not created'),
            }).pipe(
              Effect.map(() => true),
              Effect.catchAll((error) =>
                Effect.sync(() => {
                  console.error('[WorkspaceService] Worktree verification failed:', error)
                  return false
                })
              )
            )

            if (!worktreeExists) {
              console.error('[WorkspaceService] Worktree was not created at:', worktreePath)
              return yield* Effect.fail(new Error('Failed to create worktree'))
            }

            console.log('[WorkspaceService] Worktree verified at:', worktreePath)

            return {
              bareRepoPath,
              worktreePath,
            }
          }),

        /**
         * Discover all repositories in the current workspace
         *
         * Uses RepositoryService to discover and cache repositories.
         * Returns empty array if no workspace is configured.
         */
        discoverWorkspaceRepositories: Effect.gen(function* () {
          const currentPath = store.get('currentPath') as string | null | undefined

          if (!currentPath) {
            console.log('[WorkspaceService] No workspace configured, skipping discovery')
            return []
          }

          console.log('[WorkspaceService] Discovering repositories in workspace:', currentPath)
          const repositories = yield* repositoryService.discoverRepositories([currentPath])
          console.log('[WorkspaceService] Discovered', repositories.length, 'repositories')

          return repositories
        }),

        /**
         * Get all repositories from cache
         *
         * Returns cached repositories discovered in the workspace.
         * If cache is empty, triggers discovery first.
         */
        getWorkspaceRepositories: Effect.gen(function* () {
          const currentPath = store.get('currentPath') as string | null | undefined

          if (!currentPath) {
            console.log('[WorkspaceService] No workspace configured, returning empty array')
            return []
          }

          // Get cached repositories
          let repositories = yield* repositoryService.getAllRepositories()

          // If cache is empty, trigger discovery
          if (repositories.length === 0) {
            console.log('[WorkspaceService] Cache empty, triggering discovery in workspace:', currentPath)
            repositories = yield* repositoryService.discoverRepositories([currentPath])
            console.log('[WorkspaceService] Discovered', repositories.length, 'repositories')
          } else {
            console.log('[WorkspaceService] Returning', repositories.length, 'cached repositories')
          }

          return repositories
        }),
      }
    }),
  }
) {}
