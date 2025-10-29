import { useMemo } from "react";
import {
  useAtom,
  useAtomRefresh,
  useAtomSet,
  useAtomValue,
  Result,
} from "@effect-atom/atom-react";
import type {
  RepositoryId,
  GraphOptions,
} from "../../shared/schemas/source-control";
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
  commitFilesAtom,
  workingTreeStatusAtom,
  workingTreeStatusSummaryAtom,
  stageFilesAtom,
  unstageFilesAtom,
  discardChangesAtom,
  diffAtom,
  createStashAtom,
  stashesAtom,
  popStashAtom,
} from "../atoms/source-control-atoms";

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
  const repositoriesResult = useAtomValue(
    discoverRepositoriesAtom(searchPaths),
  );
  const refresh = useAtomRefresh(discoverRepositoriesAtom(searchPaths));

  const repositories = Result.getOrElse(repositoriesResult, () => []);

  return {
    // Primary: Full Result for exhaustive error handling
    repositoriesResult,

    // Actions
    refresh,

    // Computed convenience properties
    repositories,
    isLoading:
      repositoriesResult._tag === "Initial" && repositoriesResult.waiting,
  };
}

/**
 * Hook for all repositories
 *
 * Returns full Result for exhaustive error handling.
 */
export function useAllRepositories() {
  const repositoriesResult = useAtomValue(allRepositoriesAtom);
  const refresh = useAtomRefresh(allRepositoriesAtom);

  const repositories = Result.getOrElse(repositoriesResult, () => []);

  return {
    // Primary: Full Result for exhaustive error handling
    repositoriesResult,

    // Actions
    refresh,

    // Computed convenience properties
    repositories,
    isLoading:
      repositoriesResult._tag === "Initial" && repositoriesResult.waiting,
  };
}

/**
 * Hook for repository by path
 *
 * Returns full Result for exhaustive error handling.
 */
export function useRepositoryByPath(path: string) {
  const repositoryResult = useAtomValue(repositoryByPathAtom(path));
  const refresh = useAtomRefresh(repositoryByPathAtom(path));

  const repository = Result.getOrElse(repositoryResult, () => null);

  return {
    // Primary: Full Result for exhaustive error handling
    repositoryResult,

    // Actions
    refresh,

    // Computed convenience properties
    repository,
    isLoading: repositoryResult._tag === "Initial" && repositoryResult.waiting,
  };
}

/**
 * Hook for repository by ID
 *
 * Returns full Result for exhaustive error handling.
 *
 * **IMPORTANT**: This hook requires a non-null repositoryId.
 * Components should handle null with early returns before calling this hook.
 */
export function useRepositoryById(repositoryId: RepositoryId) {
  const repositoryResult = useAtomValue(repositoryByIdAtom(repositoryId));
  const refresh = useAtomRefresh(repositoryByIdAtom(repositoryId));

  const repository = Result.match(repositoryResult, {
    onSuccess: (data) =>
      Array.isArray(data.value) ? data.value[0] : data.value,
    onFailure: () => null,
    onInitial: () => null,
  });

  return {
    // Primary: Full Result for exhaustive error handling
    repositoryResult,

    // Actions
    refresh,

    // Computed convenience properties
    repository,
    isLoading: repositoryResult._tag === "Initial" && repositoryResult.waiting,
  };
}

/**
 * Hook for refreshing repository
 *
 * Returns mutation atom for refreshing repository state.
 */
export function useRefreshRepository() {
  const [refreshResult, refresh] = useAtom(refreshRepositoryAtom);

  return {
    // Primary: Full Result for exhaustive error handling
    refreshResult,

    // Actions
    refresh,

    // Computed convenience properties
    isRefreshing: refreshResult.waiting,
  };
}

/**
 * Hook for validating repository
 *
 * Returns full Result for exhaustive error handling.
 */
export function useValidateRepository(path: string) {
  const validationResult = useAtomValue(validateRepositoryAtom(path));

  return {
    // Primary: Full Result for exhaustive error handling
    validationResult,

    // Computed convenience properties
    isValidating:
      validationResult._tag === "Initial" && validationResult.waiting,
  };
}

/**
 * Hook for repository metadata
 *
 * Returns full Result for exhaustive error handling.
 *
 * **IMPORTANT**: This hook requires a non-null repositoryId.
 * Components should handle null with early returns before calling this hook.
 */
export function useRepositoryMetadata(repositoryId: RepositoryId) {
  const metadataResult = useAtomValue(repositoryMetadataAtom(repositoryId));

  const metadata = Result.getOrElse(metadataResult, () => null);

  return {
    // Primary: Full Result for exhaustive error handling
    metadataResult,

    // Computed convenience properties
    metadata,
    isLoading: metadataResult._tag === "Initial" && metadataResult.waiting,
  };
}

/**
 * Hook for forgetting repository
 *
 * Returns mutation atom for removing repository from cache.
 */
export function useForgetRepository() {
  const runForget = useAtomSet(forgetRepositoryAtom);

  return {
    // Actions
    forget: runForget,
  };
}

// ===== Commit Graph Hooks =====

/**
 * Hook for commit graph
 *
 * Returns full Result for exhaustive error handling.
 *
 * **IMPORTANT**: This hook requires a non-null repositoryId.
 * Components should handle null with early returns before calling this hook.
 *
 * **NOTE**: The `options` parameter should be memoized or defined as a constant
 * to prevent atom family from creating new subscriptions. See SourceControlDevPanel
 * for an example of proper memoization.
 */
export function useCommitGraph(
  repositoryId: RepositoryId,
  options?: GraphOptions,
) {
  // Memoize params to prevent atom family from creating new subscriptions on every render
  // IMPORTANT: Callers must memoize the options object to ensure this works correctly
  const params = useMemo(
    () => ({ repositoryId, options }),
    [repositoryId.value, options]
  );

  const graphResult = useAtomValue(commitGraphAtom(params));
  const refresh = useAtomRefresh(commitGraphAtom(params));

  const graph = Result.getOrElse(graphResult, () => null);

  return {
    // Primary: Full Result for exhaustive error handling
    graphResult,

    // Actions
    refresh,

    // Computed convenience properties
    graph,
    isLoading: graphResult._tag === "Initial" && graphResult.waiting,
  };
}

/**
 * Hook for commit graph statistics
 *
 * Returns full Result for exhaustive error handling.
 *
 * **IMPORTANT**: This hook requires a non-null repositoryId.
 * Components should handle null with early returns before calling this hook.
 */
export function useCommitGraphStatistics(repositoryId: RepositoryId) {
  const statisticsResult = useAtomValue(
    commitGraphStatisticsAtom(repositoryId),
  );

  const statistics = Result.getOrElse(statisticsResult, () => null);

  return {
    // Primary: Full Result for exhaustive error handling
    statisticsResult,

    // Computed convenience properties
    statistics,
    isLoading: statisticsResult._tag === "Initial" && statisticsResult.waiting,
  };
}

/**
 * Hook for specific commit
 *
 * Returns full Result for exhaustive error handling.
 *
 * **IMPORTANT**: This hook requires non-null repositoryId and commitHash.
 * Components should handle null with early returns before calling this hook.
 */
export function useCommit(repositoryId: RepositoryId, commitHash: string) {
  // Memoize params to prevent atom family from creating new subscriptions on every render
  const params = useMemo(
    () => ({ repositoryId, commitHash }),
    [repositoryId.value, commitHash]
  );

  const commitResult = useAtomValue(commitAtom(params));
  const refresh = useAtomRefresh(commitAtom(params));

  const commit = Result.getOrElse(commitResult, () => null);

  return {
    // Primary: Full Result for exhaustive error handling
    commitResult,

    // Actions
    refresh,

    // Computed convenience properties
    commit,
    isLoading: commitResult._tag === "Initial" && commitResult.waiting,
  };
}

/**
 * Hook for commit with refs
 *
 * Returns full Result for exhaustive error handling.
 *
 * **IMPORTANT**: This hook requires non-null repositoryId and commitHash.
 * Components should handle null with early returns before calling this hook.
 */
export function useCommitWithRefs(
  repositoryId: RepositoryId,
  commitHash: string,
) {
  // Memoize params to prevent atom family from creating new subscriptions on every render
  const params = useMemo(
    () => ({ repositoryId, commitHash }),
    [repositoryId.value, commitHash]
  );

  const commitWithRefsResult = useAtomValue(commitWithRefsAtom(params));

  const commitWithRefs = Result.getOrElse(commitWithRefsResult, () => null);

  return {
    // Primary: Full Result for exhaustive error handling
    commitWithRefsResult,

    // Computed convenience properties
    commitWithRefs,
    isLoading:
      commitWithRefsResult._tag === "Initial" && commitWithRefsResult.waiting,
  };
}

/**
 * Hook for commit history
 *
 * Returns full Result for exhaustive error handling.
 *
 * **IMPORTANT**: This hook requires non-null repositoryId and branchName.
 * Components should handle null with early returns before calling this hook.
 */
export function useCommitHistory(
  repositoryId: RepositoryId,
  branchName: string,
  maxCount?: number,
) {
  // Memoize params to prevent atom family from creating new subscriptions on every render
  const params = useMemo(
    () => ({ repositoryId, branchName, maxCount }),
    [repositoryId.value, branchName, maxCount]
  );

  const historyResult = useAtomValue(commitHistoryAtom(params));

  const history = Result.getOrElse(historyResult, () => []);

  return {
    // Primary: Full Result for exhaustive error handling
    historyResult,

    // Computed convenience properties
    history,
    isLoading: historyResult._tag === "Initial" && historyResult.waiting,
  };
}

/**
 * Hook for commit files
 *
 * Returns full Result for exhaustive error handling.
 *
 * **IMPORTANT**: This hook requires non-null repositoryId and commitHash.
 * Components should handle null with early returns before calling this hook.
 */
export function useCommitFiles(
  repositoryId: RepositoryId,
  commitHash: string,
) {
  // Memoize params to prevent atom family from creating new subscriptions on every render
  const params = useMemo(
    () => ({ repositoryId, commitHash }),
    [repositoryId.value, commitHash]
  );

  const filesResult = useAtomValue(commitFilesAtom(params));

  const files = Result.getOrElse(filesResult, () => []);

  return {
    // Primary: Full Result for exhaustive error handling
    filesResult,

    // Computed convenience properties
    files,
    isLoading: filesResult._tag === "Initial" && filesResult.waiting,
  };
}

// ===== Working Tree Hooks =====

/**
 * Hook for working tree status
 *
 * Returns full Result for exhaustive error handling.
 *
 * **IMPORTANT**: This hook requires a non-null repositoryId.
 * Components should handle null with early returns before calling this hook.
 */
export function useWorkingTreeStatus(repositoryId: RepositoryId) {
  const statusResult = useAtomValue(workingTreeStatusAtom(repositoryId));
  const refresh = useAtomRefresh(workingTreeStatusAtom(repositoryId));

  const status = Result.getOrElse(statusResult, () => null);

  return {
    // Primary: Full Result for exhaustive error handling
    statusResult,

    // Actions
    refresh,

    // Computed convenience properties
    status,
    isLoading: statusResult._tag === "Initial" && statusResult.waiting,
  };
}

/**
 * Hook for working tree status summary
 *
 * Returns full Result for exhaustive error handling.
 *
 * **IMPORTANT**: This hook requires a non-null repositoryId.
 * Components should handle null with early returns before calling this hook.
 */
export function useWorkingTreeStatusSummary(repositoryId: RepositoryId) {
  const summaryResult = useAtomValue(
    workingTreeStatusSummaryAtom(repositoryId),
  );

  const summary = Result.getOrElse(summaryResult, () => null);

  return {
    // Primary: Full Result for exhaustive error handling
    summaryResult,

    // Computed convenience properties
    summary,
    isLoading: summaryResult._tag === "Initial" && summaryResult.waiting,
  };
}

/**
 * Hook for staging files
 *
 * Returns mutation atom for staging files.
 */
export function useStageFiles() {
  const [stageResult, stage] = useAtom(stageFilesAtom);

  return {
    // Primary: Full Result for exhaustive error handling
    stageResult,

    // Actions
    stage,

    // Computed convenience properties
    isStaging: stageResult.waiting,
  };
}

/**
 * Hook for unstaging files
 *
 * Returns mutation atom for unstaging files.
 */
export function useUnstageFiles() {
  const [unstageResult, unstage] = useAtom(unstageFilesAtom);

  return {
    // Primary: Full Result for exhaustive error handling
    unstageResult,

    // Actions
    unstage,

    // Computed convenience properties
    isUnstaging: unstageResult.waiting,
  };
}

/**
 * Hook for discarding changes
 *
 * Returns mutation atom for discarding changes.
 */
export function useDiscardChanges() {
  const [discardResult, discard] = useAtom(discardChangesAtom);

  return {
    // Primary: Full Result for exhaustive error handling
    discardResult,

    // Actions
    discard,

    // Computed convenience properties
    isDiscarding: discardResult.waiting,
  };
}

/**
 * Hook for diff
 *
 * Returns full Result for exhaustive error handling.
 *
 * **IMPORTANT**: This hook requires a non-null repositoryId.
 * Components should handle null with early returns before calling this hook.
 */
export function useDiff(
  repositoryId: RepositoryId,
  options: { path: string; staged?: boolean },
) {
  // Memoize params to prevent atom family from creating new subscriptions on every render
  const params = useMemo(
    () => ({ repositoryId, options }),
    [repositoryId.value, options.path, options.staged]
  );

  const diffResult = useAtomValue(diffAtom(params));

  const diff = Result.getOrElse(diffResult, () => null);

  return {
    // Primary: Full Result for exhaustive error handling
    diffResult,

    // Computed convenience properties
    diff,
    isLoading: diffResult._tag === "Initial" && diffResult.waiting,
  };
}

/**
 * Hook for creating stash
 *
 * Returns mutation atom for creating stash.
 */
export function useCreateStash() {
  const [createStashResult, createStash] = useAtom(createStashAtom);

  return {
    // Primary: Full Result for exhaustive error handling
    createStashResult,

    // Actions
    createStash,

    // Computed convenience properties
    isCreatingStash: createStashResult.waiting,
  };
}

/**
 * Hook for stashes
 *
 * Returns full Result for exhaustive error handling.
 *
 * **IMPORTANT**: This hook requires a non-null repositoryId.
 * Components should handle null with early returns before calling this hook.
 */
export function useStashes(repositoryId: RepositoryId) {
  const stashesResult = useAtomValue(stashesAtom(repositoryId));

  const stashes = Result.getOrElse(stashesResult, () => []);

  return {
    // Primary: Full Result for exhaustive error handling
    stashesResult,

    // Computed convenience properties
    stashes,
    isLoading: stashesResult._tag === "Initial" && stashesResult.waiting,
  };
}

/**
 * Hook for popping stash
 *
 * Returns mutation atom for popping stash.
 */
export function usePopStash() {
  const [popStashResult, popStash] = useAtom(popStashAtom);

  return {
    // Primary: Full Result for exhaustive error handling
    popStashResult,

    // Actions
    popStash,

    // Computed convenience properties
    isPoppingStash: popStashResult.waiting,
  };
}
