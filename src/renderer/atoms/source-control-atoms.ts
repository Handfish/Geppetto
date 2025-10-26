import { Atom, Result } from '@effect-atom/atom-react'
import { Effect, Duration } from 'effect'
import { SourceControlClient } from '../lib/source-control-client'
import type {
  Repository,
  RepositoryId,
  CommitGraph,
  GraphOptions,
  WorkingTree,
  Commit,
  CommitWithRefs,
} from '../../shared/schemas/source-control'

/**
 * Source Control Atoms
 *
 * Reactive state management for source control operations.
 * Uses @effect-atom/atom-react for Effect-based state management.
 *
 * Architecture:
 * - Data atoms: Fetch and cache data from backend
 * - Mutation atoms: Perform operations with reactivity invalidation
 * - Family atoms: Parameterized atoms for per-repository/per-commit state
 *
 * Reactivity Keys:
 * - 'source-control:repositories' - All repositories
 * - 'source-control:repository:{id}' - Specific repository
 * - 'source-control:graph:{id}' - Commit graph for repository
 * - 'source-control:status:{id}' - Working tree status
 * - 'source-control:commit:{id}:{hash}' - Specific commit
 */

// Create runtime with SourceControlClient dependency
const sourceControlRuntime = Atom.runtime(SourceControlClient.Default)

// ===== Repository Management Atoms =====

/**
 * Discover repositories atom
 * Discovers all Git repositories in the given search paths
 */
export const discoverRepositoriesAtom = Atom.family((searchPaths: string[]) =>
  sourceControlRuntime
    .atom(
      Effect.gen(function* () {
        const client = yield* SourceControlClient
        return yield* client.discoverRepositories(searchPaths)
      })
    )
    .pipe(
      Atom.withReactivity(['source-control:repositories']),
      Atom.setIdleTTL(Duration.seconds(30))
    )
)

/**
 * All repositories atom
 * Gets all known repositories from cache
 */
export const allRepositoriesAtom = sourceControlRuntime
  .atom(
    Effect.gen(function* () {
      const client = yield* SourceControlClient
      return yield* client.getAllRepositories()
    })
  )
  .pipe(
    Atom.withReactivity(['source-control:repositories']),
    Atom.setIdleTTL(Duration.seconds(30))
  )

/**
 * Repository atom (by path)
 * Gets repository information by path
 */
export const repositoryByPathAtom = Atom.family((path: string) =>
  sourceControlRuntime
    .atom(
      Effect.gen(function* () {
        const client = yield* SourceControlClient
        return yield* client.getRepository(path)
      })
    )
    .pipe(
      Atom.withReactivity(['source-control:repositories']),
      Atom.setIdleTTL(Duration.seconds(30))
    )
)

/**
 * Repository atom (by ID)
 * Gets repository information by ID
 */
export const repositoryByIdAtom = Atom.family((repositoryId: RepositoryId) =>
  sourceControlRuntime
    .atom(
      Effect.gen(function* () {
        const client = yield* SourceControlClient
        return yield* client.getRepositoryById(repositoryId)
      })
    )
    .pipe(
      Atom.withReactivity([
        'source-control:repositories',
        `source-control:repository:${repositoryId.value}`,
      ]),
      Atom.setIdleTTL(Duration.seconds(30))
    )
)

/**
 * Refresh repository atom (mutation)
 * Refreshes repository state from disk
 */
export const refreshRepositoryAtom = sourceControlRuntime.fn(
  (repositoryId: RepositoryId) =>
    Effect.gen(function* () {
      const client = yield* SourceControlClient
      return yield* client.refreshRepository(repositoryId)
    }),
  {
    reactivityKeys: (repositoryId: RepositoryId) => [
      'source-control:repositories',
      `source-control:repository:${repositoryId.value}`,
      `source-control:graph:${repositoryId.value}`,
      `source-control:status:${repositoryId.value}`,
    ],
  }
)

/**
 * Validate repository atom
 * Validates repository path
 */
export const validateRepositoryAtom = Atom.family((path: string) =>
  sourceControlRuntime
    .atom(
      Effect.gen(function* () {
        const client = yield* SourceControlClient
        return yield* client.validateRepository(path)
      })
    )
    .pipe(Atom.setIdleTTL(Duration.seconds(10)))
)

/**
 * Repository metadata atom
 * Gets repository metadata (size, commit count, etc.)
 */
export const repositoryMetadataAtom = Atom.family((repositoryId: RepositoryId) =>
  sourceControlRuntime
    .atom(
      Effect.gen(function* () {
        const client = yield* SourceControlClient
        return yield* client.getRepositoryMetadata(repositoryId)
      })
    )
    .pipe(
      Atom.withReactivity([`source-control:repository:${repositoryId.value}`]),
      Atom.setIdleTTL(Duration.minutes(5))
    )
)

/**
 * Forget repository atom (mutation)
 * Removes repository from cache
 */
export const forgetRepositoryAtom = sourceControlRuntime.fn(
  (repositoryId: RepositoryId) =>
    Effect.gen(function* () {
      const client = yield* SourceControlClient
      yield* client.forgetRepository(repositoryId)
    }),
  {
    reactivityKeys: ['source-control:repositories'],
  }
)

// ===== Commit Graph Atoms =====

/**
 * Commit graph atom
 * Builds commit graph for a repository
 */
export const commitGraphAtom = Atom.family(
  (params: { repositoryId: RepositoryId; options?: GraphOptions }) =>
    sourceControlRuntime
      .atom(
        Effect.gen(function* () {
          const client = yield* SourceControlClient
          return yield* client.buildCommitGraph(params.repositoryId, params.options)
        })
      )
      .pipe(
        Atom.withReactivity([
          `source-control:graph:${params.repositoryId.value}`,
          `source-control:repository:${params.repositoryId.value}`,
        ]),
        Atom.setIdleTTL(Duration.seconds(30))
      )
)

/**
 * Commit graph statistics atom
 * Gets commit graph statistics
 */
export const commitGraphStatisticsAtom = Atom.family((repositoryId: RepositoryId) =>
  sourceControlRuntime
    .atom(
      Effect.gen(function* () {
        const client = yield* SourceControlClient
        return yield* client.getCommitGraphStatistics(repositoryId)
      })
    )
    .pipe(
      Atom.withReactivity([`source-control:graph:${repositoryId.value}`]),
      Atom.setIdleTTL(Duration.seconds(30))
    )
)

/**
 * Commit atom
 * Gets a specific commit by hash
 */
export const commitAtom = Atom.family(
  (params: { repositoryId: RepositoryId; commitHash: string }) =>
    sourceControlRuntime
      .atom(
        Effect.gen(function* () {
          const client = yield* SourceControlClient
          return yield* client.getCommit(params.repositoryId, params.commitHash)
        })
      )
      .pipe(
        Atom.withReactivity([
          `source-control:commit:${params.repositoryId.value}:${params.commitHash}`,
        ]),
        Atom.setIdleTTL(Duration.minutes(10))
      )
)

/**
 * Commit with refs atom
 * Gets commit with refs (branches, tags)
 */
export const commitWithRefsAtom = Atom.family(
  (params: { repositoryId: RepositoryId; commitHash: string }) =>
    sourceControlRuntime
      .atom(
        Effect.gen(function* () {
          const client = yield* SourceControlClient
          return yield* client.getCommitWithRefs(params.repositoryId, params.commitHash)
        })
      )
      .pipe(
        Atom.withReactivity([
          `source-control:commit:${params.repositoryId.value}:${params.commitHash}`,
          `source-control:repository:${params.repositoryId.value}`,
        ]),
        Atom.setIdleTTL(Duration.minutes(10))
      )
)

/**
 * Commit history atom
 * Gets commit history for a branch
 */
export const commitHistoryAtom = Atom.family(
  (params: { repositoryId: RepositoryId; branchName: string; maxCount?: number }) =>
    sourceControlRuntime
      .atom(
        Effect.gen(function* () {
          const client = yield* SourceControlClient
          return yield* client.getCommitHistory(
            params.repositoryId,
            params.branchName,
            params.maxCount
          )
        })
      )
      .pipe(
        Atom.withReactivity([
          `source-control:graph:${params.repositoryId.value}`,
          `source-control:repository:${params.repositoryId.value}`,
        ]),
        Atom.setIdleTTL(Duration.seconds(30))
      )
)

// ===== Working Tree Atoms =====

/**
 * Working tree status atom
 * Gets working tree status
 */
export const workingTreeStatusAtom = Atom.family((repositoryId: RepositoryId) =>
  sourceControlRuntime
    .atom(
      Effect.gen(function* () {
        const client = yield* SourceControlClient
        return yield* client.getStatus(repositoryId)
      })
    )
    .pipe(
      Atom.withReactivity([
        `source-control:status:${repositoryId.value}`,
        `source-control:repository:${repositoryId.value}`,
      ]),
      Atom.setIdleTTL(Duration.seconds(5))
    )
)

/**
 * Working tree status summary atom
 * Gets working tree status summary
 */
export const workingTreeStatusSummaryAtom = Atom.family((repositoryId: RepositoryId) =>
  sourceControlRuntime
    .atom(
      Effect.gen(function* () {
        const client = yield* SourceControlClient
        return yield* client.getStatusSummary(repositoryId)
      })
    )
    .pipe(
      Atom.withReactivity([`source-control:status:${repositoryId.value}`]),
      Atom.setIdleTTL(Duration.seconds(5))
    )
)

/**
 * Stage files atom (mutation)
 * Stages files in the working tree
 */
export const stageFilesAtom = sourceControlRuntime.fn(
  (params: { repositoryId: RepositoryId; paths: string[] }) =>
    Effect.gen(function* () {
      const client = yield* SourceControlClient
      return yield* client.stageFiles(params.repositoryId, params.paths)
    }),
  {
    reactivityKeys: (params: { repositoryId: RepositoryId; paths: string[] }) => [
      `source-control:status:${params.repositoryId.value}`,
      `source-control:repository:${params.repositoryId.value}`,
    ],
  }
)

/**
 * Unstage files atom (mutation)
 * Unstages files in the working tree
 */
export const unstageFilesAtom = sourceControlRuntime.fn(
  (params: { repositoryId: RepositoryId; paths: string[] }) =>
    Effect.gen(function* () {
      const client = yield* SourceControlClient
      return yield* client.unstageFiles(params.repositoryId, params.paths)
    }),
  {
    reactivityKeys: (params: { repositoryId: RepositoryId; paths: string[] }) => [
      `source-control:status:${params.repositoryId.value}`,
      `source-control:repository:${params.repositoryId.value}`,
    ],
  }
)

/**
 * Discard changes atom (mutation)
 * Discards changes to files
 */
export const discardChangesAtom = sourceControlRuntime.fn(
  (params: { repositoryId: RepositoryId; paths: string[] }) =>
    Effect.gen(function* () {
      const client = yield* SourceControlClient
      return yield* client.discardChanges(params.repositoryId, params.paths)
    }),
  {
    reactivityKeys: (params: { repositoryId: RepositoryId; paths: string[] }) => [
      `source-control:status:${params.repositoryId.value}`,
      `source-control:repository:${params.repositoryId.value}`,
    ],
  }
)

/**
 * Get diff atom
 * Gets diff for file or commit
 */
export const diffAtom = Atom.family(
  (params: { repositoryId: RepositoryId; options: any }) =>
    sourceControlRuntime
      .atom(
        Effect.gen(function* () {
          const client = yield* SourceControlClient
          return yield* client.getDiff(params.repositoryId, params.options)
        })
      )
      .pipe(Atom.setIdleTTL(Duration.seconds(10)))
)

/**
 * Create stash atom (mutation)
 * Creates a stash
 */
export const createStashAtom = sourceControlRuntime.fn(
  (params: {
    repositoryId: RepositoryId
    message?: string
    includeUntracked?: boolean
  }) =>
    Effect.gen(function* () {
      const client = yield* SourceControlClient
      return yield* client.createStash(
        params.repositoryId,
        params.message,
        params.includeUntracked
      )
    }),
  {
    reactivityKeys: (params: {
      repositoryId: RepositoryId
      message?: string
      includeUntracked?: boolean
    }) => [
      `source-control:status:${params.repositoryId.value}`,
      `source-control:stash:${params.repositoryId.value}`,
    ],
  }
)

/**
 * List stashes atom
 * Lists all stashes for a repository
 */
export const stashesAtom = Atom.family((repositoryId: RepositoryId) =>
  sourceControlRuntime
    .atom(
      Effect.gen(function* () {
        const client = yield* SourceControlClient
        return yield* client.listStashes(repositoryId)
      })
    )
    .pipe(
      Atom.withReactivity([`source-control:stash:${repositoryId.value}`]),
      Atom.setIdleTTL(Duration.seconds(30))
    )
)

/**
 * Pop stash atom (mutation)
 * Pops a stash
 */
export const popStashAtom = sourceControlRuntime.fn(
  (params: { repositoryId: RepositoryId; index?: number }) =>
    Effect.gen(function* () {
      const client = yield* SourceControlClient
      return yield* client.popStash(params.repositoryId, params.index)
    }),
  {
    reactivityKeys: (params: { repositoryId: RepositoryId; index?: number }) => [
      `source-control:status:${params.repositoryId.value}`,
      `source-control:stash:${params.repositoryId.value}`,
      `source-control:repository:${params.repositoryId.value}`,
    ],
  }
)

// ===== Empty/Default Atoms =====

/**
 * Empty repositories atom
 * Returns empty repository array (for fallback)
 */
export const emptyRepositoriesAtom = Atom.make(() =>
  Result.success([] as Repository[])
)

/**
 * Empty commit graph atom
 * Returns null commit graph (for fallback)
 */
export const emptyCommitGraphAtom = Atom.make(() =>
  Result.success(null as CommitGraph | null)
)

/**
 * Empty working tree atom
 * Returns null working tree (for fallback)
 */
export const emptyWorkingTreeAtom = Atom.make(() =>
  Result.success(null as WorkingTree | null)
)
