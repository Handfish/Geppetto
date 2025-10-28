import {
  useAtom,
  useAtomRefresh,
  useAtomSet,
  useAtomValue,
  Result,
} from '@effect-atom/atom-react'
import type {
  Repository,
  RepositoryId,
  CommitGraph,
  GraphOptions,
  WorkingTree,
  Commit,
  CommitWithRefs,
} from '../../shared/schemas/source-control'
import {
  allRepositoriesAtom,
  discoverRepositoriesAtom,
  repositoryByPathAtom,
  repositoryByIdAtom,
  refreshRepositoryAtom,
  validateRepositoryAtom,
  repositoryMetadataAtom,
  forgetRepositoryAtom,
  commitGraphAtom,
  commitGraphStatisticsAtom,
  commitAtom,
  commitWithRefsAtom,
  commitHistoryAtom,
  workingTreeStatusAtom,
  workingTreeStatusSummaryAtom,
  stageFilesAtom,
  unstageFilesAtom,
  discardChangesAtom,
  diffAtom,
  createStashAtom,
  stashesAtom,
  popStashAtom,
  emptyRepositoriesAtom,
  emptyCommitGraphAtom,
  emptyWorkingTreeAtom,
  emptyNullAtom,
  emptyCommitAtom,
  emptyCommitWithRefsAtom,
  emptyCommitsArrayAtom,
} from '../atoms/source-control-atoms'

/**
 * Source Control Hooks
 *
 * React hooks for source control operations.
 * Follow the Result.builder pattern for exhaustive error handling.
 *
 * Usage:
 * ```typescript
 * const { repositoriesResult } = useRepositories(searchPaths)
 * return Result.builder(repositoriesResult)
 *   .onInitial(() => <Loading />)
 *   .onErrorTag('NetworkError', () => <Error />)
 *   .onSuccess((repos) => <List repos={repos} />)
 *   .render()
 * ```
 */

// ===== Repository Management Hooks =====

/**
 * Hook for discovering repositories
 *
 * Returns full Result for exhaustive error handling.
 * Use Result.builder in components to handle all states.
 */
export function useDiscoverRepositories(searchPaths: string[]) {
  const repositoriesResult = useAtomValue(discoverRepositoriesAtom(searchPaths))
  const refresh = useAtomRefresh(discoverRepositoriesAtom(searchPaths))

  const repositories = Result.getOrElse(repositoriesResult, () => [])

  return {
    // Primary: Full Result for exhaustive error handling
    repositoriesResult,

    // Actions
    refresh,

    // Computed convenience properties
    repositories,
    isLoading:
      repositoriesResult._tag === 'Initial' && repositoriesResult.waiting,
  }
}

/**
 * Hook for all repositories
 *
 * Returns full Result for exhaustive error handling.
 */
export function useAllRepositories() {
  const repositoriesResult = useAtomValue(allRepositoriesAtom)
  const refresh = useAtomRefresh(allRepositoriesAtom)

  const repositories = Result.getOrElse(repositoriesResult, () => [])

  return {
    // Primary: Full Result for exhaustive error handling
    repositoriesResult,

    // Actions
    refresh,

    // Computed convenience properties
    repositories,
    isLoading:
      repositoriesResult._tag === 'Initial' && repositoriesResult.waiting,
  }
}

/**
 * Hook for repository by path
 *
 * Returns full Result for exhaustive error handling.
 */
export function useRepositoryByPath(path: string) {
  const repositoryResult = useAtomValue(repositoryByPathAtom(path))
  const refresh = useAtomRefresh(repositoryByPathAtom(path))

  const repository = Result.getOrElse(repositoryResult, () => null)

  return {
    // Primary: Full Result for exhaustive error handling
    repositoryResult,

    // Actions
    refresh,

    // Computed convenience properties
    repository,
    isLoading:
      repositoryResult._tag === 'Initial' && repositoryResult.waiting,
  }
}

/**
 * Hook for repository by ID
 *
 * Returns full Result for exhaustive error handling.
 */
export function useRepositoryById(repositoryId: RepositoryId | null) {
  const atom = repositoryId
    ? repositoryByIdAtom(repositoryId)
    : (emptyRepositoriesAtom as unknown as ReturnType<typeof repositoryByIdAtom>)

  const repositoryResult = useAtomValue(
    repositoryId
      ? repositoryByIdAtom(repositoryId)
      : (emptyRepositoriesAtom as unknown as ReturnType<typeof repositoryByIdAtom>)
  )

  const refresh = repositoryId
    ? useAtomRefresh(repositoryByIdAtom(repositoryId))
    : () => {}

  const repository = Result.match(repositoryResult, {
    onSuccess: (data) =>
      Array.isArray(data.value) ? data.value[0] : data.value,
    onFailure: () => null,
    onInitial: () => null,
  })

  return {
    // Primary: Full Result for exhaustive error handling
    repositoryResult,

    // Actions
    refresh,

    // Computed convenience properties
    repository,
    isLoading: repositoryId
      ? repositoryResult._tag === 'Initial' && repositoryResult.waiting
      : false,
  }
}

/**
 * Hook for refreshing repository
 *
 * Returns mutation atom for refreshing repository state.
 */
export function useRefreshRepository() {
  const [refreshResult, refresh] = useAtom(refreshRepositoryAtom)

  return {
    // Primary: Full Result for exhaustive error handling
    refreshResult,

    // Actions
    refresh,

    // Computed convenience properties
    isRefreshing: refreshResult.waiting,
  }
}

/**
 * Hook for validating repository
 *
 * Returns full Result for exhaustive error handling.
 */
export function useValidateRepository(path: string) {
  const validationResult = useAtomValue(validateRepositoryAtom(path))

  return {
    // Primary: Full Result for exhaustive error handling
    validationResult,

    // Computed convenience properties
    isValidating:
      validationResult._tag === 'Initial' && validationResult.waiting,
  }
}

/**
 * Hook for repository metadata
 *
 * Returns full Result for exhaustive error handling.
 */
export function useRepositoryMetadata(repositoryId: RepositoryId | null) {
  const metadataResult = useAtomValue(
    repositoryId
      ? repositoryMetadataAtom(repositoryId)
      : (emptyNullAtom as unknown as ReturnType<typeof repositoryMetadataAtom>)
  )

  const metadata = Result.getOrElse(metadataResult, () => null)

  return {
    // Primary: Full Result for exhaustive error handling
    metadataResult,

    // Computed convenience properties
    metadata,
    isLoading: repositoryId
      ? metadataResult._tag === 'Initial' && metadataResult.waiting
      : false,
  }
}

/**
 * Hook for forgetting repository
 *
 * Returns mutation atom for removing repository from cache.
 */
export function useForgetRepository() {
  const runForget = useAtomSet(forgetRepositoryAtom)

  return {
    // Actions
    forget: runForget,
  }
}

// ===== Commit Graph Hooks =====

/**
 * Hook for commit graph
 *
 * Returns full Result for exhaustive error handling.
 */
export function useCommitGraph(
  repositoryId: RepositoryId | null,
  options?: GraphOptions
) {
  const graphResult = useAtomValue(
    repositoryId
      ? commitGraphAtom({ repositoryId, options })
      : (emptyCommitGraphAtom as unknown as ReturnType<typeof commitGraphAtom>)
  )

  const refresh = repositoryId
    ? useAtomRefresh(commitGraphAtom({ repositoryId, options }))
    : () => {}

  const graph = Result.getOrElse(graphResult, () => null)

  return {
    // Primary: Full Result for exhaustive error handling
    graphResult,

    // Actions
    refresh,

    // Computed convenience properties
    graph,
    isLoading: repositoryId
      ? graphResult._tag === 'Initial' && graphResult.waiting
      : false,
  }
}

/**
 * Hook for commit graph statistics
 *
 * Returns full Result for exhaustive error handling.
 */
export function useCommitGraphStatistics(repositoryId: RepositoryId | null) {
  const statisticsResult = useAtomValue(
    repositoryId
      ? commitGraphStatisticsAtom(repositoryId)
      : (emptyNullAtom as unknown as ReturnType<typeof commitGraphStatisticsAtom>)
  )

  const statistics = Result.getOrElse(statisticsResult, () => null)

  return {
    // Primary: Full Result for exhaustive error handling
    statisticsResult,

    // Computed convenience properties
    statistics,
    isLoading: repositoryId
      ? statisticsResult._tag === 'Initial' && statisticsResult.waiting
      : false,
  }
}

/**
 * Hook for specific commit
 *
 * Returns full Result for exhaustive error handling.
 */
export function useCommit(
  repositoryId: RepositoryId | null,
  commitHash: string | null
) {
  const commitResult = useAtomValue(
    repositoryId && commitHash
      ? commitAtom({ repositoryId, commitHash })
      : (emptyCommitAtom as unknown as ReturnType<typeof commitAtom>)
  )

  const commit = Result.getOrElse(commitResult, () => null)

  return {
    // Primary: Full Result for exhaustive error handling
    commitResult,

    // Computed convenience properties
    commit,
    isLoading:
      repositoryId && commitHash
        ? commitResult._tag === 'Initial' && commitResult.waiting
        : false,
  }
}

/**
 * Hook for commit with refs
 *
 * Returns full Result for exhaustive error handling.
 */
export function useCommitWithRefs(
  repositoryId: RepositoryId | null,
  commitHash: string | null
) {
  const commitWithRefsResult = useAtomValue(
    repositoryId && commitHash
      ? commitWithRefsAtom({ repositoryId, commitHash })
      : (emptyCommitWithRefsAtom as unknown as ReturnType<typeof commitWithRefsAtom>)
  )

  const commitWithRefs = Result.getOrElse(commitWithRefsResult, () => null)

  return {
    // Primary: Full Result for exhaustive error handling
    commitWithRefsResult,

    // Computed convenience properties
    commitWithRefs,
    isLoading:
      repositoryId && commitHash
        ? commitWithRefsResult._tag === 'Initial' &&
          commitWithRefsResult.waiting
        : false,
  }
}

/**
 * Hook for commit history
 *
 * Returns full Result for exhaustive error handling.
 */
export function useCommitHistory(
  repositoryId: RepositoryId | null,
  branchName: string | null,
  maxCount?: number
) {
  const historyResult = useAtomValue(
    repositoryId && branchName
      ? commitHistoryAtom({ repositoryId, branchName, maxCount })
      : (emptyCommitsArrayAtom as unknown as ReturnType<typeof commitHistoryAtom>)
  )

  const history = Result.getOrElse(historyResult, () => [])

  return {
    // Primary: Full Result for exhaustive error handling
    historyResult,

    // Computed convenience properties
    history,
    isLoading:
      repositoryId && branchName
        ? historyResult._tag === 'Initial' && historyResult.waiting
        : false,
  }
}

// ===== Working Tree Hooks =====

/**
 * Hook for working tree status
 *
 * Returns full Result for exhaustive error handling.
 */
export function useWorkingTreeStatus(repositoryId: RepositoryId | null) {
  const statusResult = useAtomValue(
    repositoryId
      ? workingTreeStatusAtom(repositoryId)
      : (emptyWorkingTreeAtom as unknown as ReturnType<typeof workingTreeStatusAtom>)
  )

  const refresh = repositoryId
    ? useAtomRefresh(workingTreeStatusAtom(repositoryId))
    : () => {}

  const status = Result.getOrElse(statusResult, () => null)

  return {
    // Primary: Full Result for exhaustive error handling
    statusResult,

    // Actions
    refresh,

    // Computed convenience properties
    status,
    isLoading: repositoryId
      ? statusResult._tag === 'Initial' && statusResult.waiting
      : false,
  }
}

/**
 * Hook for working tree status summary
 *
 * Returns full Result for exhaustive error handling.
 */
export function useWorkingTreeStatusSummary(repositoryId: RepositoryId | null) {
  const summaryResult = useAtomValue(
    repositoryId
      ? workingTreeStatusSummaryAtom(repositoryId)
      : (emptyNullAtom as unknown as ReturnType<typeof workingTreeStatusSummaryAtom>)
  )

  const summary = Result.getOrElse(summaryResult, () => null)

  return {
    // Primary: Full Result for exhaustive error handling
    summaryResult,

    // Computed convenience properties
    summary,
    isLoading: repositoryId
      ? summaryResult._tag === 'Initial' && summaryResult.waiting
      : false,
  }
}

/**
 * Hook for staging files
 *
 * Returns mutation atom for staging files.
 */
export function useStageFiles() {
  const [stageResult, stage] = useAtom(stageFilesAtom)

  return {
    // Primary: Full Result for exhaustive error handling
    stageResult,

    // Actions
    stage,

    // Computed convenience properties
    isStaging: stageResult.waiting,
  }
}

/**
 * Hook for unstaging files
 *
 * Returns mutation atom for unstaging files.
 */
export function useUnstageFiles() {
  const [unstageResult, unstage] = useAtom(unstageFilesAtom)

  return {
    // Primary: Full Result for exhaustive error handling
    unstageResult,

    // Actions
    unstage,

    // Computed convenience properties
    isUnstaging: unstageResult.waiting,
  }
}

/**
 * Hook for discarding changes
 *
 * Returns mutation atom for discarding changes.
 */
export function useDiscardChanges() {
  const [discardResult, discard] = useAtom(discardChangesAtom)

  return {
    // Primary: Full Result for exhaustive error handling
    discardResult,

    // Actions
    discard,

    // Computed convenience properties
    isDiscarding: discardResult.waiting,
  }
}

/**
 * Hook for diff
 *
 * Returns full Result for exhaustive error handling.
 */
export function useDiff(repositoryId: RepositoryId | null, options: { path: string; staged?: boolean }) {
  const diffResult = useAtomValue(
    repositoryId
      ? diffAtom({ repositoryId, options })
      : (emptyNullAtom as unknown as ReturnType<typeof diffAtom>)
  )

  const diff = Result.getOrElse(diffResult, () => null)

  return {
    // Primary: Full Result for exhaustive error handling
    diffResult,

    // Computed convenience properties
    diff,
    isLoading: repositoryId
      ? diffResult._tag === 'Initial' && diffResult.waiting
      : false,
  }
}

/**
 * Hook for creating stash
 *
 * Returns mutation atom for creating stash.
 */
export function useCreateStash() {
  const [createStashResult, createStash] = useAtom(createStashAtom)

  return {
    // Primary: Full Result for exhaustive error handling
    createStashResult,

    // Actions
    createStash,

    // Computed convenience properties
    isCreatingStash: createStashResult.waiting,
  }
}

/**
 * Hook for stashes
 *
 * Returns full Result for exhaustive error handling.
 */
export function useStashes(repositoryId: RepositoryId | null) {
  const stashesResult = useAtomValue(
    repositoryId
      ? stashesAtom(repositoryId)
      : (emptyNullAtom as unknown as ReturnType<typeof stashesAtom>)
  )

  const stashes = Result.getOrElse(stashesResult, () => [])

  return {
    // Primary: Full Result for exhaustive error handling
    stashesResult,

    // Computed convenience properties
    stashes,
    isLoading: repositoryId
      ? stashesResult._tag === 'Initial' && stashesResult.waiting
      : false,
  }
}

/**
 * Hook for popping stash
 *
 * Returns mutation atom for popping stash.
 */
export function usePopStash() {
  const [popStashResult, popStash] = useAtom(popStashAtom)

  return {
    // Primary: Full Result for exhaustive error handling
    popStashResult,

    // Actions
    popStash,

    // Computed convenience properties
    isPoppingStash: popStashResult.waiting,
  }
}
