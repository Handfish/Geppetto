import { Effect, Ref, Stream, Scope, Schema as S } from 'effect'
import { RepositoryManagementPort } from '../ports/primary/repository-management-port'
import { NodeFileSystemAdapter } from '../adapters/file-system/node-file-system-adapter'
import { NodeGitCommandRunner } from '../node-git-command-runner'
import {
  Repository,
  RepositoryId,
  RepositoryState,
  RepositoryMetadata,
  RepositoryDiscoveryInfo,
  RepositoryConfig,
  RepositoryNotFoundError,
  InvalidRepositoryError,
  RepositoryOperationError,
} from '../domain/aggregates/repository'
import { Branch, BranchType } from '../domain/entities/branch'
import { Remote, RemoteName, RefSpec } from '../domain/entities/remote'
import { BranchName, makeBranchName } from '../domain/value-objects/branch-name'
import { CommitHash, makeCommitHash } from '../domain/value-objects/commit-hash'
import { RemoteUrl, makeRemoteUrl } from '../domain/value-objects/remote-url'
import {
  GitCommandRequest,
  GitWorktreeContext,
  GitCommandId,
} from '../../../shared/schemas/source-control'
import type { AnyRepositoryEvent } from '../domain/events/repository-events'
import { RepositoryDiscovered, RepositoryRefreshed } from '../domain/events/repository-events'

/**
 * RepositoryService - Application service for repository management
 *
 * Implements RepositoryManagementPort using GitCommandRunnerPort and FileSystemPort.
 * Provides repository discovery, state management, and caching.
 *
 * Dependencies:
 * - GitCommandRunnerPort: For executing git commands
 * - FileSystemPort: For file system operations and repository discovery
 */
export class RepositoryService extends Effect.Service<RepositoryService>()('RepositoryService', {
  effect: Effect.gen(function* () {
    const gitRunner = yield* NodeGitCommandRunner
    const fileSystem = yield* NodeFileSystemAdapter

    // Cache for discovered repositories
    const repositoryCache = yield* Ref.make(new Map<string, Repository>())

    /**
     * Helper: Create a Repository aggregate from a path
     */
    const createRepositoryFromPath = (repoPath: string): Effect.Effect<Repository, RepositoryNotFoundError | RepositoryOperationError> =>
      Effect.gen(function* () {
        // Get .git directory
        const gitDir = yield* fileSystem.getGitDirectory(repoPath).pipe(
          Effect.mapError((error) =>
            new RepositoryNotFoundError({
              path: repoPath,
              reason: `Not a valid Git repository: ${error.message ?? 'Unknown error'}`,
            })
          )
        )

        // Get repository name (directory name)
        const name = yield* fileSystem.basename(repoPath)

        // Get current state
        const state = yield* getRepositoryStateInternal(repoPath)

        // Get branches
        const branches = yield* listBranchesInternal(repoPath)

        // Get remotes
        const remotes = yield* listRemotesInternal(repoPath)

        // Get config
        const config = yield* getRepositoryConfigInternal(repoPath)

        // Create repository aggregate
        return new Repository({
          id: new RepositoryId({ value: crypto.randomUUID() }),
          path: repoPath,
          name,
          state,
          branches,
          remotes,
          config,
          gitDir,
        })
      })

    /**
     * Helper: Get repository state by executing git commands
     */
    const getRepositoryStateInternal = (repoPath: string): Effect.Effect<RepositoryState, RepositoryOperationError> =>
      Effect.gen(function* () {
        // Get current HEAD
        const headResult = yield* Effect.scoped(
          Effect.gen(function* () {
            const request = new GitCommandRequest({
              id: crypto.randomUUID() as GitCommandId,
              args: ['rev-parse', 'HEAD'],
              worktree: new GitWorktreeContext({ repositoryPath: repoPath }),
            })

            const handle = yield* gitRunner.execute(request)
            const result = yield* handle.awaitResult

            return result.stdout?.trim()
          })
        ).pipe(
          Effect.catchAll(() => Effect.succeed(undefined))
        )

        const head = headResult ? makeCommitHash(headResult) : undefined

        // Get current branch (symbolic-ref HEAD)
        const branchResult = yield* Effect.scoped(
          Effect.gen(function* () {
            const request = new GitCommandRequest({
              id: crypto.randomUUID() as GitCommandId,
              args: ['symbolic-ref', '--short', 'HEAD'],
              worktree: new GitWorktreeContext({ repositoryPath: repoPath }),
            })

            const handle = yield* gitRunner.execute(request)
            const result = yield* handle.awaitResult

            return result.stdout?.trim()
          })
        ).pipe(
          Effect.catchAll(() => Effect.succeed(undefined))
        )

        const branch = branchResult ? makeBranchName(branchResult) : undefined
        const isDetached = branch === undefined && head !== undefined

        // Check for special states
        const mergeHeadExists = yield* fileSystem.fileExists(`${repoPath}/.git/MERGE_HEAD`)
        const rebaseHeadExists = yield* fileSystem.fileExists(`${repoPath}/.git/REBASE_HEAD`)
        const cherryPickHeadExists = yield* fileSystem.fileExists(`${repoPath}/.git/CHERRY_PICK_HEAD`)
        const bisectLogExists = yield* fileSystem.fileExists(`${repoPath}/.git/BISECT_LOG`)
        const revertHeadExists = yield* fileSystem.fileExists(`${repoPath}/.git/REVERT_HEAD`)

        return new RepositoryState({
          head,
          branch,
          isDetached,
          isMerging: mergeHeadExists,
          isRebasing: rebaseHeadExists,
          isCherryPicking: cherryPickHeadExists,
          isBisecting: bisectLogExists,
          isReverting: revertHeadExists,
        })
      }).pipe(
        Effect.catchAll((error) =>
          Effect.fail(
            new RepositoryOperationError({
              repositoryId: new RepositoryId({ value: crypto.randomUUID() }),
              operation: 'getState',
              reason: 'Failed to get repository state',
              cause: error,
            })
          )
        )
      )

    /**
     * Helper: List all branches
     */
    const listBranchesInternal = (repoPath: string): Effect.Effect<Branch[], RepositoryOperationError> =>
      Effect.gen(function* () {
        // Get current branch for marking
        const currentBranch = yield* Effect.scoped(
          Effect.gen(function* () {
            const request = new GitCommandRequest({
              id: crypto.randomUUID() as GitCommandId,
              args: ['rev-parse', '--abbrev-ref', 'HEAD'],
              worktree: new GitWorktreeContext({ repositoryPath: repoPath }),
            })

            const handle = yield* gitRunner.execute(request)
            const result = yield* handle.awaitResult

            return result.stdout?.trim()
          })
        ).pipe(Effect.catchAll(() => Effect.succeed(undefined)))

        // List branches with format: <refname>|<objectname>|<upstream>
        const branchesOutput = yield* Effect.scoped(
          Effect.gen(function* () {
            const request = new GitCommandRequest({
              id: crypto.randomUUID() as GitCommandId,
              args: [
                'for-each-ref',
                '--format=%(refname:short)|%(objectname)|%(upstream:short)',
                'refs/heads/',
              ],
              worktree: new GitWorktreeContext({ repositoryPath: repoPath }),
            })

            const handle = yield* gitRunner.execute(request)
            const result = yield* handle.awaitResult

            return result.stdout?.trim() ?? ''
          })
        )

        const branches: Branch[] = []

        for (const line of branchesOutput.split('\n')) {
          if (!line) continue

          const [refname, objectname, upstream] = line.split('|')
          if (!refname || !objectname) continue

          const branchName = makeBranchName(refname)
          const commitHash = makeCommitHash(objectname)
          const upstreamBranch = upstream ? makeBranchName(upstream) : undefined

          branches.push(
            new Branch({
              name: branchName,
              type: upstreamBranch ? 'tracking' : 'local',
              commit: commitHash,
              upstream: upstreamBranch,
              isCurrent: refname === currentBranch,
              isDetached: false,
            })
          )
        }

        return branches
      }).pipe(
        Effect.catchAll((error) =>
          Effect.fail(
            new RepositoryOperationError({
              repositoryId: new RepositoryId({ value: crypto.randomUUID() }),
              operation: 'listBranches',
              reason: 'Failed to list branches',
              cause: error,
            })
          )
        )
      )

    /**
     * Helper: List all remotes
     */
    const listRemotesInternal = (repoPath: string): Effect.Effect<Remote[], RepositoryOperationError> =>
      Effect.gen(function* () {
        // List remote names
        const remotesOutput = yield* Effect.scoped(
          Effect.gen(function* () {
            const request = new GitCommandRequest({
              id: crypto.randomUUID() as GitCommandId,
              args: ['remote'],
              worktree: new GitWorktreeContext({ repositoryPath: repoPath }),
            })

            const handle = yield* gitRunner.execute(request)
            const result = yield* handle.awaitResult

            return result.stdout?.trim() ?? ''
          })
        )

        const remotes: Remote[] = []

        for (const remoteName of remotesOutput.split('\n')) {
          if (!remoteName) continue

          // Get fetch URL
          const fetchUrl = yield* Effect.scoped(
            Effect.gen(function* () {
              const request = new GitCommandRequest({
                id: crypto.randomUUID() as GitCommandId,
                args: ['remote', 'get-url', remoteName],
                worktree: new GitWorktreeContext({ repositoryPath: repoPath }),
              })

              const handle = yield* gitRunner.execute(request)
              const result = yield* handle.awaitResult

              return result.stdout?.trim() ?? ''
            })
          )

          // Get push URL (may be same as fetch)
          const pushUrl = yield* Effect.scoped(
            Effect.gen(function* () {
              const request = new GitCommandRequest({
                id: crypto.randomUUID() as GitCommandId,
                args: ['remote', 'get-url', '--push', remoteName],
                worktree: new GitWorktreeContext({ repositoryPath: repoPath }),
              })

              const handle = yield* gitRunner.execute(request)
              const result = yield* handle.awaitResult

              return result.stdout?.trim() ?? ''
            })
          )

          if (fetchUrl) {
            remotes.push(
              new Remote({
                name: new RemoteName({ value: remoteName }),
                fetchUrl: makeRemoteUrl(fetchUrl),
                pushUrl: pushUrl && pushUrl !== fetchUrl ? makeRemoteUrl(pushUrl) : undefined,
                fetchRefSpecs: [], // Would need to parse from .git/config
                pushRefSpecs: [],
              })
            )
          }
        }

        return remotes
      }).pipe(
        Effect.catchAll((error) =>
          Effect.fail(
            new RepositoryOperationError({
              repositoryId: new RepositoryId({ value: crypto.randomUUID() }),
              operation: 'listRemotes',
              reason: 'Failed to list remotes',
              cause: error,
            })
          )
        )
      )

    /**
     * Helper: Get repository config
     */
    const getRepositoryConfigInternal = (repoPath: string): Effect.Effect<RepositoryConfig | undefined, never> =>
      Effect.gen(function* () {
        // Get user.name
        const userName = yield* Effect.scoped(
          Effect.gen(function* () {
            const request = new GitCommandRequest({
              id: crypto.randomUUID() as GitCommandId,
              args: ['config', 'user.name'],
              worktree: new GitWorktreeContext({ repositoryPath: repoPath }),
            })

            const handle = yield* gitRunner.execute(request)
            const result = yield* handle.awaitResult

            return result.stdout?.trim()
          })
        ).pipe(Effect.catchAll(() => Effect.succeed(undefined)))

        // Get user.email
        const userEmail = yield* Effect.scoped(
          Effect.gen(function* () {
            const request = new GitCommandRequest({
              id: crypto.randomUUID() as GitCommandId,
              args: ['config', 'user.email'],
              worktree: new GitWorktreeContext({ repositoryPath: repoPath }),
            })

            const handle = yield* gitRunner.execute(request)
            const result = yield* handle.awaitResult

            return result.stdout?.trim()
          })
        ).pipe(Effect.catchAll(() => Effect.succeed(undefined)))

        return new RepositoryConfig({
          userName,
          userEmail,
          core: {},
        })
      })

    // Implementation of RepositoryManagementPort
    const port: RepositoryManagementPort = {
      discoverRepositories: (searchPaths: string[]) =>
        Effect.gen(function* () {
          const allRepos: Repository[] = []

          for (const searchPath of searchPaths) {
            const repoPaths = yield* fileSystem.findGitRepositories(searchPath).pipe(
              Effect.catchAll((error) =>
                // Log error but continue with other paths
                Effect.succeed([])
              )
            )

            for (const repoPath of repoPaths) {
              const repo = yield* createRepositoryFromPath(repoPath).pipe(
                Effect.catchAll((error) =>
                  // Skip invalid repositories
                  Effect.succeed(undefined as Repository | undefined)
                )
              )

              if (repo) {
                allRepos.push(repo)

                // Update cache
                yield* Ref.update(repositoryCache, (cache) => {
                  cache.set(repo.path, repo)
                  return cache
                })
              }
            }
          }

          return allRepos
        }).pipe(
          Effect.catchAll((error) =>
            Effect.fail(
              new RepositoryOperationError({
                repositoryId: new RepositoryId({ value: crypto.randomUUID() }),
                operation: 'discoverRepositories',
                reason: 'Failed to discover repositories',
                cause: error,
              })
            )
          )
        ),

      getRepository: (path: string) =>
        Effect.gen(function* () {
          // Check cache first
          const cache = yield* Ref.get(repositoryCache)
          const cached = cache.get(path)

          if (cached) {
            return cached
          }

          // Not in cache - create new
          const repo = yield* createRepositoryFromPath(path)

          // Add to cache
          yield* Ref.update(repositoryCache, (cache) => {
            cache.set(path, repo)
            return cache
          })

          return repo
        }),

      getRepositoryById: (repositoryId: RepositoryId) =>
        Effect.gen(function* () {
          const cache = yield* Ref.get(repositoryCache)

          for (const repo of cache.values()) {
            if (repo.id.equals(repositoryId)) {
              return repo
            }
          }

          return yield* Effect.fail(
            new RepositoryNotFoundError({
              path: `[id: ${repositoryId.value}]`,
              reason: 'Repository not found by ID',
            })
          )
        }),

      getRepositoryState: (repositoryId: RepositoryId) =>
        Effect.gen(function* () {
          const repo = yield* port.getRepositoryById(repositoryId)
          return yield* getRepositoryStateInternal(repo.path)
        }),

      refreshRepository: (repositoryId: RepositoryId) =>
        Effect.gen(function* () {
          const repo = yield* port.getRepositoryById(repositoryId)
          const refreshed = yield* createRepositoryFromPath(repo.path)

          // Update cache
          yield* Ref.update(repositoryCache, (cache) => {
            cache.set(refreshed.path, refreshed)
            return cache
          })

          return refreshed
        }),

      validateRepository: (path: string) =>
        Effect.gen(function* () {
          const isValid = yield* fileSystem.isGitRepository(path)

          if (!isValid) {
            return new RepositoryDiscoveryInfo({
              path,
              gitDir: '',
              isValid: false,
              isBare: false,
              error: 'Not a valid Git repository',
            })
          }

          const gitDir = yield* fileSystem.getGitDirectory(path).pipe(
            Effect.catchAll(() => Effect.succeed(''))
          )

          const isBare = gitDir === path

          return new RepositoryDiscoveryInfo({
            path,
            gitDir,
            isValid: true,
            isBare,
          })
        }),

      watchRepository: (repositoryId: RepositoryId) =>
        Stream.unwrapScoped(
          Effect.gen(function* () {
            const repo = yield* port.getRepositoryById(repositoryId)

            // Watch .git directory for changes
            return fileSystem.watchDirectory(`${repo.path}/.git`).pipe(
              Stream.map(
                (fsEvent) =>
                  new RepositoryRefreshed({
                    repositoryId: repo.id,
                    timestamp: fsEvent.timestamp,
                  }) as AnyRepositoryEvent
              )
            )
          })
        ),

      getRepositoryMetadata: (repositoryId: RepositoryId) =>
        Effect.gen(function* () {
          const repo = yield* port.getRepositoryById(repositoryId)

          // Count commits
          const commitCount = yield* Effect.scoped(
            Effect.gen(function* () {
              const request = new GitCommandRequest({
                id: crypto.randomUUID() as GitCommandId,
                args: ['rev-list', '--count', 'HEAD'],
                worktree: new GitWorktreeContext({ repositoryPath: repo.path }),
              })

              const handle = yield* gitRunner.execute(request)
              const result = yield* handle.awaitResult

              return parseInt(result.stdout?.trim() ?? '0', 10)
            })
          ).pipe(Effect.catchAll(() => Effect.succeed(0)))

          return new RepositoryMetadata({
            repositoryId: repo.id,
            size: 0, // Would need to calculate
            commitCount,
            branchCount: repo.branches.length,
            remoteCount: repo.remotes.length,
          })
        }),

      getAllRepositories: () =>
        Effect.gen(function* () {
          const cache = yield* Ref.get(repositoryCache)
          return Array.from(cache.values())
        }),

      forgetRepository: (repositoryId: RepositoryId) =>
        Effect.gen(function* () {
          const repo = yield* port.getRepositoryById(repositoryId).pipe(
            Effect.catchAll(() => Effect.succeed(undefined as Repository | undefined))
          )

          if (repo) {
            yield* Ref.update(repositoryCache, (cache) => {
              cache.delete(repo.path)
              return cache
            })
          }
        }),

      hasUncommittedChanges: (repositoryId: RepositoryId) =>
        Effect.gen(function* () {
          const repo = yield* port.getRepositoryById(repositoryId)

          // Quick check using git diff-index
          const hasChanges = yield* Effect.scoped(
            Effect.gen(function* () {
              const request = new GitCommandRequest({
                id: crypto.randomUUID() as GitCommandId,
                args: ['diff-index', '--quiet', 'HEAD', '--'],
                worktree: new GitWorktreeContext({ repositoryPath: repo.path }),
              })

              const handle = yield* gitRunner.execute(request)
              const result = yield* handle.awaitResult

              // Exit code 0 = no changes, 1 = has changes
              return result.exitCode !== 0
            })
          ).pipe(Effect.catchAll(() => Effect.succeed(false)))

          return hasChanges
        }),

      isCleanState: (repositoryId: RepositoryId) =>
        Effect.gen(function* () {
          const state = yield* port.getRepositoryState(repositoryId)
          const hasChanges = yield* port.hasUncommittedChanges(repositoryId)

          return state.isClean() && !state.isDetached && !hasChanges
        }),
    }

    return port
  }),
  dependencies: [NodeGitCommandRunner.Default, NodeFileSystemAdapter.Default],
}) {}
