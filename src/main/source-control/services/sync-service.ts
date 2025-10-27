import { Effect, Scope, Stream, pipe } from 'effect'
import { NodeGitCommandRunner } from '../adapters/git/node-git-command-runner'
import { RepositoryService } from './repository-service'
import { RepositoryId, RepositoryNotFoundError } from '../domain/aggregates/repository'
import { RemoteUrl } from '../domain/value-objects/remote-url'
import { BranchName } from '../domain/value-objects/branch-name'
import { GitCommandRequest, GitCommandId, GitWorktreeContext } from '../../../shared/schemas/source-control'
import { GitCommandDomainError } from '../../../shared/schemas/source-control/errors'
import { ProviderType } from '../../../shared/schemas/account-context'
import { Data } from 'effect'
import { ProviderPortFactory } from '../ports/secondary/provider-port'

/**
 * Sync operation errors
 */
export class SyncOperationError extends Data.TaggedError('SyncOperationError')<{
  operation: 'fetch' | 'pull' | 'push' | 'sync' | 'git'
  repositoryId: RepositoryId
  message: string
  cause?: unknown
}> {}

export class RemoteNotFoundError extends Data.TaggedError('RemoteNotFoundError')<{
  repositoryId: RepositoryId
  remoteName: string
}> {}

export class ProviderSyncError extends Data.TaggedError('ProviderSyncError')<{
  repositoryId: RepositoryId
  provider: ProviderType
  message: string
  cause?: unknown
}> {}

/**
 * Sync result information
 */
export class SyncResult extends Data.TaggedClass('SyncResult')<{
  operation: 'fetch' | 'pull' | 'push'
  remote: string
  branch?: string
  success: boolean
  message: string
  timestamp: Date
}> {}

/**
 * Provider sync result
 */
export class ProviderSyncResult extends Data.TaggedClass('ProviderSyncResult')<{
  provider: ProviderType
  owner: string
  repo: string
  defaultBranch: string
  localUpdated: boolean
  remoteMetadata: {
    stars: number
    forks: number
    updatedAt: Date
  }
  timestamp: Date
}> {}

/**
 * SyncService
 *
 * Handles synchronization between local Git repositories and remote providers.
 * Provides operations for:
 * - Fetch: Download objects and refs from remote
 * - Pull: Fetch and integrate changes
 * - Push: Upload local commits to remote
 * - Provider sync: Sync with provider metadata
 *
 * Architecture:
 * - Uses GitCommandRunnerPort for git operations
 * - Uses ProviderFactory for provider integration
 * - Uses RepositoryManagementPort for repository access
 *
 * Usage:
 * ```typescript
 * const syncService = yield* SyncService
 * const result = yield* syncService.fetch(repositoryId, 'origin')
 * ```
 */
export class SyncService extends Effect.Service<SyncService>()('SyncService', {
  effect: Effect.gen(function* () {
    const gitRunner = yield* NodeGitCommandRunner
    const providerFactory = yield* ProviderPortFactory
    const repoManagement = yield* RepositoryService

    return {
      /**
       * Fetch objects and refs from remote
       */
      fetch: (
        repositoryId: RepositoryId,
        remoteName: string = 'origin',
        options?: {
          prune?: boolean
          tags?: boolean
        }
      ): Effect.Effect<SyncResult, RepositoryNotFoundError | SyncOperationError | GitCommandDomainError | RemoteNotFoundError, Scope.Scope> =>
        Effect.gen(function* () {
          const repo = yield* repoManagement.getRepositoryById(repositoryId)

          // Check if remote exists
          const remote = repo.remotes.find((r) => r.name.value === remoteName)
          if (!remote) {
            return yield* Effect.fail(
              new RemoteNotFoundError({
                repositoryId,
                remoteName,
              })
            )
          }

          // Build fetch args
          const args = ['fetch', remoteName]
          if (options?.prune) args.push('--prune')
          if (options?.tags) args.push('--tags')

          // Execute fetch command
          yield* Effect.scoped(
            Effect.gen(function* () {
              const request = new GitCommandRequest({
                id: crypto.randomUUID() as GitCommandId,
                args,
                worktree: new GitWorktreeContext({ repositoryPath: repo.path }),
              })

              const handle = yield* gitRunner.execute(request)
              const result = yield* handle.awaitResult

              if (result.exitCode !== 0) {
                return yield* Effect.fail(
                  new SyncOperationError({
                    operation: 'fetch',
                    repositoryId,
                    message: `Fetch failed: ${result.stderr ?? 'Unknown error'}`,
                    cause: result.stderr,
                  })
                )
              }
            })
          )

          return new SyncResult({
            operation: 'fetch',
            remote: remoteName,
            success: true,
            message: `Successfully fetched from ${remoteName}`,
            timestamp: new Date(),
          })
        }),

      /**
       * Pull changes from remote (fetch + merge)
       */
      pull: (
        repositoryId: RepositoryId,
        remoteName: string = 'origin',
        branchName?: BranchName,
        options?: {
          rebase?: boolean
          ff?: 'only' | 'no'
        }
      ): Effect.Effect<SyncResult, RepositoryNotFoundError | SyncOperationError | GitCommandDomainError | RemoteNotFoundError, Scope.Scope> =>
        Effect.gen(function* () {
          const repo = yield* repoManagement.getRepositoryById(repositoryId)

          // Check if remote exists
          const remote = repo.remotes.find((r) => r.name.value === remoteName)
          if (!remote) {
            return yield* Effect.fail(
              new RemoteNotFoundError({
                repositoryId,
                remoteName,
              })
            )
          }

          // Build pull args
          const args = ['pull', remoteName]
          if (branchName) args.push(branchName.value)
          if (options?.rebase) args.push('--rebase')
          if (options?.ff === 'only') args.push('--ff-only')
          if (options?.ff === 'no') args.push('--no-ff')

          // Execute pull command
          yield* Effect.scoped(
            Effect.gen(function* () {
              const request = new GitCommandRequest({
                id: crypto.randomUUID() as GitCommandId,
                args,
                worktree: new GitWorktreeContext({ repositoryPath: repo.path }),
              })

              const handle = yield* gitRunner.execute(request)
              const result = yield* handle.awaitResult

              if (result.exitCode !== 0) {
                return yield* Effect.fail(
                  new SyncOperationError({
                    operation: 'pull',
                    repositoryId,
                    message: `Pull failed: ${result.stderr ?? 'Unknown error'}`,
                    cause: result.stderr,
                  })
                )
              }
            })
          )

          return new SyncResult({
            operation: 'pull',
            remote: remoteName,
            branch: branchName?.value,
            success: true,
            message: `Successfully pulled from ${remoteName}${branchName ? `/${branchName.value}` : ''}`,
            timestamp: new Date(),
          })
        }),

      /**
       * Push local commits to remote
       */
      push: (
        repositoryId: RepositoryId,
        remoteName: string = 'origin',
        branchName?: BranchName,
        options?: {
          force?: boolean
          setUpstream?: boolean
          tags?: boolean
        }
      ): Effect.Effect<SyncResult, RepositoryNotFoundError | SyncOperationError | GitCommandDomainError | RemoteNotFoundError, Scope.Scope> =>
        Effect.gen(function* () {
          const repo = yield* repoManagement.getRepositoryById(repositoryId)

          // Check if remote exists
          const remote = repo.remotes.find((r) => r.name.value === remoteName)
          if (!remote) {
            return yield* Effect.fail(
              new RemoteNotFoundError({
                repositoryId,
                remoteName,
              })
            )
          }

          // Build push args
          const args = ['push', remoteName]
          if (branchName) args.push(branchName.value)
          if (options?.force) args.push('--force')
          if (options?.setUpstream) args.push('--set-upstream')
          if (options?.tags) args.push('--tags')

          // Execute push command
          yield* Effect.scoped(
            Effect.gen(function* () {
              const request = new GitCommandRequest({
                id: crypto.randomUUID() as GitCommandId,
                args,
                worktree: new GitWorktreeContext({ repositoryPath: repo.path }),
              })

              const handle = yield* gitRunner.execute(request)
              const result = yield* handle.awaitResult

              if (result.exitCode !== 0) {
                return yield* Effect.fail(
                  new SyncOperationError({
                    operation: 'push',
                    repositoryId,
                    message: `Push failed: ${result.stderr ?? 'Unknown error'}`,
                    cause: result.stderr,
                  })
                )
              }
            })
          )

          return new SyncResult({
            operation: 'push',
            remote: remoteName,
            branch: branchName?.value,
            success: true,
            message: `Successfully pushed to ${remoteName}${branchName ? `/${branchName.value}` : ''}`,
            timestamp: new Date(),
          })
        }),

      /**
       * Sync repository with provider metadata
       * Fetches latest metadata from the hosting provider and syncs local repository
       */
      syncWithProvider: (
        repositoryId: RepositoryId,
        providerType: ProviderType,
        remoteName: string = 'origin'
      ): Effect.Effect<ProviderSyncResult, RepositoryNotFoundError | ProviderSyncError | SyncOperationError | GitCommandDomainError | RemoteNotFoundError, Scope.Scope> =>
        Effect.gen(function* () {
          const repo = yield* repoManagement.getRepositoryById(repositoryId)

          // Get remote URL
          const remote = repo.remotes.find((r) => r.name.value === remoteName)
          if (!remote) {
            return yield* Effect.fail(
              new RemoteNotFoundError({
                repositoryId,
                remoteName,
              })
            )
          }

          // Parse remote URL to get owner/repo
          const remoteUrl = remote.fetchUrl
          const ownerAndRepo = remoteUrl.getOwnerAndRepo()
          if (!ownerAndRepo) {
            return yield* Effect.fail(
              new ProviderSyncError({
                repositoryId,
                provider: providerType,
                message: `Could not parse owner/repo from URL: ${remoteUrl.value}`,
              })
            )
          }

          const { owner, repo: repoName } = ownerAndRepo

          // Get provider implementation via factory
          const provider = yield* providerFactory.getProvider(providerType).pipe(
            Effect.catchAll((error) =>
              Effect.fail(
                new ProviderSyncError({
                  repositoryId,
                  provider: providerType,
                  message: `Provider ${providerType} not supported: ${error.message ?? 'Unknown error'}`,
                  cause: error,
                })
              )
            )
          )

          // Fetch repository metadata from provider
          const providerRepo = yield* provider.getRepository(owner, repoName).pipe(
            Effect.catchAll((error) =>
              Effect.fail(
                new ProviderSyncError({
                  repositoryId,
                  provider: providerType,
                  message: 'Failed to fetch repository metadata from provider',
                  cause: error,
                })
              )
            )
          )

          // Extract metadata from provider response
          const metadata = {
            defaultBranch: providerRepo.defaultBranch,
            stars: providerRepo.stars ?? 0,
            forks: providerRepo.forks ?? 0,
            updatedAt: providerRepo.updatedAt,
          }

          // Fetch latest changes from remote (best effort - don't fail if this fails)
          const localUpdated = yield* Effect.scoped(
            Effect.gen(function* () {
              const request = new GitCommandRequest({
                id: crypto.randomUUID() as GitCommandId,
                args: ['fetch', remoteName],
                worktree: new GitWorktreeContext({ repositoryPath: repo.path }),
              })

              const handle = yield* gitRunner.execute(request)
              const result = yield* handle.awaitResult

              return result.exitCode === 0
            })
          ).pipe(
            Effect.catchAll(() => Effect.succeed(false)) // If fetch fails, still return metadata
          )

          return new ProviderSyncResult({
            provider: providerType,
            owner,
            repo: repoName,
            defaultBranch: metadata.defaultBranch,
            localUpdated,
            remoteMetadata: {
              stars: metadata.stars ?? 0,
              forks: metadata.forks ?? 0,
              updatedAt: metadata.updatedAt,
            },
            timestamp: new Date(),
          })
        }),

      /**
       * Fetch all remotes in repository
       */
      fetchAll: (
        repositoryId: RepositoryId,
        options?: {
          prune?: boolean
        }
      ): Effect.Effect<SyncResult[], RepositoryNotFoundError | SyncOperationError | GitCommandDomainError, Scope.Scope> =>
        Effect.gen(function* () {
          const repo = yield* repoManagement.getRepositoryById(repositoryId)

          // Build args for fetch --all
          const args = ['fetch', '--all']
          if (options?.prune) args.push('--prune')

          // Execute fetch --all command
          yield* Effect.scoped(
            Effect.gen(function* () {
              const request = new GitCommandRequest({
                id: crypto.randomUUID() as GitCommandId,
                args,
                worktree: new GitWorktreeContext({ repositoryPath: repo.path }),
              })

              const handle = yield* gitRunner.execute(request)
              const result = yield* handle.awaitResult

              if (result.exitCode !== 0) {
                return yield* Effect.fail(
                  new SyncOperationError({
                    operation: 'fetch',
                    repositoryId,
                    message: `Fetch all failed: ${result.stderr ?? 'Unknown error'}`,
                    cause: result.stderr,
                  })
                )
              }
            })
          )

          return repo.remotes.map(
            (remote) =>
              new SyncResult({
                operation: 'fetch',
                remote: remote.name.value,
                success: true,
                message: `Fetched from ${remote.name.value}`,
                timestamp: new Date(),
              })
          )
        }),

      /**
       * Check if local branch is ahead/behind remote
       */
      getTrackingStatus: (
        repositoryId: RepositoryId,
        branchName: BranchName
      ): Effect.Effect<
        { ahead: number; behind: number },
        RepositoryNotFoundError | SyncOperationError | GitCommandDomainError,
        Scope.Scope
      > =>
        Effect.gen(function* () {
          const repo = yield* repoManagement.getRepositoryById(repositoryId)

          // Get tracking information
          const output = yield* Effect.scoped(
            Effect.gen(function* () {
              const request = new GitCommandRequest({
                id: crypto.randomUUID() as GitCommandId,
                args: ['rev-list', '--left-right', '--count', `${branchName.value}...@{u}`],
                worktree: new GitWorktreeContext({ repositoryPath: repo.path }),
              })

              const handle = yield* gitRunner.execute(request)
              const result = yield* handle.awaitResult

              if (result.exitCode !== 0) {
                return yield* Effect.fail(
                  new SyncOperationError({
                    operation: 'sync',
                    repositoryId,
                    message: `Failed to get tracking status: ${result.stderr ?? 'Unknown error'}`,
                    cause: result.stderr,
                  })
                )
              }

              return result.stdout ?? ''
            })
          )

          // Parse output: "ahead\tbehind"
          const [ahead, behind] = output.trim().split('\t').map(Number)

          return { ahead, behind }
        }),
    }
  }),
  dependencies: [
    NodeGitCommandRunner.Default,
    RepositoryService.Default,
    // ProviderPortFactory is provided by VcsSourceControlAdaptersLayer in main/index.ts
  ],
}) {}
