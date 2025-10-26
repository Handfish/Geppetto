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
  Branch,
  Remote,
  CommitHash,
  BranchName,
  RemoteName,
  RemoteUrl,
} from '../../../shared/schemas/source-control'
import {
  RepositoryNotFoundError,
  InvalidRepositoryError,
  RepositoryOperationError,
} from '../domain/aggregates/repository'
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
/**
 * Cached repository entry with timestamp
 */
interface CachedRepository {
  repository: Repository
  timestamp: number
}

/**
 * Cache TTL in milliseconds
 * Set to 30 seconds to prevent excessive git command execution
 */
const REPOSITORY_CACHE_TTL_MS = 30000

export class RepositoryService extends Effect.Service<RepositoryService>()('RepositoryService', {
  effect: Effect.gen(function* () {
    const gitRunner = yield* NodeGitCommandRunner
    const fileSystem = yield* NodeFileSystemAdapter

    // Cache for discovered repositories with timestamps
    // Key: repository path, Value: cached repository with timestamp
    const repositoryCache = yield* Ref.make(new Map<string, CachedRepository>())

    // Cache by ID for fast lookups
    // Key: repository ID, Value: repository path
    const idToPathCache = yield* Ref.make(new Map<string, string>())

    // In-flight discovery tracking to prevent concurrent discoveries
    const isDiscovering = yield* Ref.make(false)
    const lastDiscoveryPaths = yield* Ref.make<string[]>([])
    const lastDiscoveryTime = yield* Ref.make(0)

    /**
     * Helper: Check if cached repository is still fresh
     */
    const isCacheFresh = (cached: CachedRepository): boolean => {
      return (Date.now() - cached.timestamp) < REPOSITORY_CACHE_TTL_MS
    }

    /**
     * Helper: Store repository in cache
     */
    const cacheRepository = (repository: Repository) =>
      Effect.gen(function* () {
        const cached: CachedRepository = {
          repository,
          timestamp: Date.now(),
        }
        yield* Ref.update(repositoryCache, (cache) => {
          cache.set(repository.path, cached)
          return cache
        })
        yield* Ref.update(idToPathCache, (cache) => {
          cache.set(repository.id.value, repository.path)
          return cache
        })
      })

    /**
     * Helper: Get cached repository by path
     */
    const getCachedByPath = (path: string) =>
      Effect.gen(function* () {
        const cache = yield* Ref.get(repositoryCache)
        const cached = cache.get(path)
        if (cached && isCacheFresh(cached)) {
          return cached.repository
        }
        return undefined
      })

    /**
     * Helper: Get cached repository by ID
     */
    const getCachedById = (id: RepositoryId) =>
      Effect.gen(function* () {
        const pathCache = yield* Ref.get(idToPathCache)
        const path = pathCache.get(id.value)
        if (!path) return undefined

        return yield* getCachedByPath(path)
      })

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

        const head = headResult ? new CommitHash({ value: headResult }) : undefined

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

        const branch = branchResult ? new BranchName({ value: branchResult }) : undefined
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

          branches.push(
            new Branch({
              name: new BranchName({ value: refname }),
              type: upstream ? 'tracking' : 'local',
              commit: new CommitHash({ value: objectname }),
              upstream: upstream ? new BranchName({ value: upstream }) : undefined,
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
                fetchUrl: new RemoteUrl({ value: fetchUrl }),
                pushUrl: pushUrl && pushUrl !== fetchUrl ? new RemoteUrl({ value: pushUrl }) : undefined,
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
          // Check if we recently discovered these same paths (within 5 seconds)
          const now = Date.now()
          const lastPaths = yield* Ref.get(lastDiscoveryPaths)
          const lastTime = yield* Ref.get(lastDiscoveryTime)
          const discovering = yield* Ref.get(isDiscovering)

          const pathsMatch = JSON.stringify(searchPaths.sort()) === JSON.stringify(lastPaths.sort())
          const recentDiscovery = (now - lastTime) < 5000 // 5 seconds

          // If same paths were recently discovered or discovery is in progress, return cached results
          if ((pathsMatch && recentDiscovery) || discovering) {
            console.log('[RepositoryService] Skipping duplicate discovery, returning cached results')
            const cache = yield* Ref.get(repositoryCache)
            const repos: Repository[] = []
            for (const cached of cache.values()) {
              if (isCacheFresh(cached)) {
                repos.push(cached.repository)
              }
            }
            return repos
          }

          // Mark as discovering
          yield* Ref.set(isDiscovering, true)
          yield* Ref.set(lastDiscoveryPaths, searchPaths)
          yield* Ref.set(lastDiscoveryTime, now)

          console.log('[RepositoryService] Starting discovery for paths:', searchPaths)

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

                // Store in cache with timestamp
                yield* cacheRepository(repo)
              }
            }
          }

          // Mark as complete
          yield* Ref.set(isDiscovering, false)
          console.log('[RepositoryService] Discovery complete, found', allRepos.length, 'repositories')

          return allRepos
        }).pipe(
          Effect.catchAll((error) => {
            // Ensure we clear the discovering flag on error
            return Effect.gen(function* () {
              yield* Ref.set(isDiscovering, false)
              return yield* Effect.fail(
                new RepositoryOperationError({
                  repositoryId: new RepositoryId({ value: crypto.randomUUID() }),
                  operation: 'discoverRepositories',
                  reason: 'Failed to discover repositories',
                  cause: error,
                })
              )
            })
          })
        ),

      getRepository: (path: string) =>
        Effect.gen(function* () {
          // Check cache first - return if fresh
          const cached = yield* getCachedByPath(path)
          if (cached) {
            console.log(`[RepositoryService] Cache HIT for path: ${path}`)
            return cached
          }

          // Cache MISS - fetch fresh data
          console.log(`[RepositoryService] Cache MISS for path: ${path} - executing git commands`)
          const repo = yield* createRepositoryFromPath(path)

          // Store in cache
          yield* cacheRepository(repo)

          return repo
        }),

      getRepositoryById: (repositoryId: RepositoryId) =>
        Effect.gen(function* () {
          // Check cache first - return if fresh
          const cached = yield* getCachedById(repositoryId)
          if (cached) {
            console.log(`[RepositoryService] Cache HIT for id: ${repositoryId.value}`)
            return cached
          }

          // Not found in cache
          console.log(`[RepositoryService] Cache MISS for id: ${repositoryId.value}`)
          return yield* Effect.fail(
            new RepositoryNotFoundError({
              path: `[id: ${repositoryId.value}]`,
              reason: 'Repository not found by ID - not in cache',
            })
          )
        }),

      getRepositoryState: (repositoryId: RepositoryId) =>
        Effect.gen(function* () {
          const repo = yield* getCachedById(repositoryId)
          if (!repo) {
            return yield* Effect.fail(
              new RepositoryNotFoundError({
                path: `[id: ${repositoryId.value}]`,
                reason: 'Repository not found by ID',
              })
            )
          }
          return yield* getRepositoryStateInternal(repo.path)
        }),

      refreshRepository: (repositoryId: RepositoryId) =>
        Effect.gen(function* () {
          const repo = yield* getCachedById(repositoryId)
          if (!repo) {
            return yield* Effect.fail(
              new RepositoryNotFoundError({
                path: `[id: ${repositoryId.value}]`,
                reason: 'Repository not found by ID',
              })
            )
          }
          console.log(`[RepositoryService] Refreshing repository: ${repo.path}`)
          const refreshed = yield* createRepositoryFromPath(repo.path)

          // Update cache with fresh timestamp
          yield* cacheRepository(refreshed)

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
            const repo = yield* getCachedById(repositoryId)
            if (!repo) {
              return yield* Effect.fail(
                new RepositoryNotFoundError({
                  path: `[id: ${repositoryId.value}]`,
                  reason: 'Repository not found by ID',
                })
              )
            }

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
          const repo = yield* getCachedById(repositoryId)
          if (!repo) {
            return yield* Effect.fail(
              new RepositoryNotFoundError({
                path: `[id: ${repositoryId.value}]`,
                reason: 'Repository not found by ID',
              })
            )
          }

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

          // Only return fresh cached entries
          const freshRepos: Repository[] = []
          for (const cached of cache.values()) {
            if (isCacheFresh(cached)) {
              freshRepos.push(cached.repository)
            }
          }

          console.log(`[RepositoryService] getAllRepositories returning ${freshRepos.length} fresh cached repositories`)
          return freshRepos
        }),

      forgetRepository: (repositoryId: RepositoryId) =>
        Effect.gen(function* () {
          const repo = yield* getCachedById(repositoryId)

          if (repo) {
            // Clean up both caches
            yield* Ref.update(repositoryCache, (cache) => {
              cache.delete(repo.path)
              return cache
            })
            yield* Ref.update(idToPathCache, (cache) => {
              cache.delete(repo.id.value)
              return cache
            })
            console.log(`[RepositoryService] Forgot repository: ${repo.path}`)
          }
        }),

      hasUncommittedChanges: (repositoryId: RepositoryId) =>
        Effect.gen(function* () {
          const repo = yield* getCachedById(repositoryId)
          if (!repo) {
            return yield* Effect.fail(
              new RepositoryNotFoundError({
                path: `[id: ${repositoryId.value}]`,
                reason: 'Repository not found by ID',
              })
            )
          }

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
