import { Effect, Schema as S } from 'effect'
import { ElectronIpcClient } from './ipc-client'
import { IpcContracts } from '../../shared/ipc-contracts'

/**
 * SourceControlClient
 *
 * Renderer-side client for source control operations.
 * Provides type-safe wrappers around IPC contracts for:
 * - Repository management (discovery, access, metadata)
 * - Commit graph operations (building, querying)
 * - Working tree operations (status, staging, diffs)
 *
 * Usage:
 * ```typescript
 * const client = yield* SourceControlClient
 * const repos = yield* client.discoverRepositories(['/workspace'])
 * const graph = yield* client.buildCommitGraph(repositoryId, options)
 * ```
 *
 * All methods return Effect types with proper error handling.
 * Results are validated using Effect Schema at the IPC boundary.
 */
export class SourceControlClient extends Effect.Service<SourceControlClient>()(
  'SourceControlClient',
  {
    dependencies: [ElectronIpcClient.Default],
    effect: Effect.gen(function* () {
      const ipc = yield* ElectronIpcClient

      // Type helpers for input schemas
      type DiscoverRepositoriesInput = S.Schema.Type<
        (typeof IpcContracts)['source-control:discover-repositories']['input']
      >
      type GetRepositoryInput = S.Schema.Type<
        (typeof IpcContracts)['source-control:get-repository']['input']
      >
      type GetRepositoryByIdInput = S.Schema.Type<
        (typeof IpcContracts)['source-control:get-repository-by-id']['input']
      >
      type RefreshRepositoryInput = S.Schema.Type<
        (typeof IpcContracts)['source-control:refresh-repository']['input']
      >
      type ValidateRepositoryInput = S.Schema.Type<
        (typeof IpcContracts)['source-control:validate-repository']['input']
      >
      type GetRepositoryMetadataInput = S.Schema.Type<
        (typeof IpcContracts)['source-control:get-repository-metadata']['input']
      >
      type ForgetRepositoryInput = S.Schema.Type<
        (typeof IpcContracts)['source-control:forget-repository']['input']
      >
      type BuildCommitGraphInput = S.Schema.Type<
        (typeof IpcContracts)['source-control:build-commit-graph']['input']
      >
      type GetCommitGraphStatisticsInput = S.Schema.Type<
        (typeof IpcContracts)['source-control:get-commit-graph-statistics']['input']
      >
      type GetCommitInput = S.Schema.Type<
        (typeof IpcContracts)['source-control:get-commit']['input']
      >
      type GetCommitWithRefsInput = S.Schema.Type<
        (typeof IpcContracts)['source-control:get-commit-with-refs']['input']
      >
      type GetCommitHistoryInput = S.Schema.Type<
        (typeof IpcContracts)['source-control:get-commit-history']['input']
      >
      type GetStatusInput = S.Schema.Type<
        (typeof IpcContracts)['source-control:get-status']['input']
      >
      type GetStatusSummaryInput = S.Schema.Type<
        (typeof IpcContracts)['source-control:get-status-summary']['input']
      >
      type StageFilesInput = S.Schema.Type<
        (typeof IpcContracts)['source-control:stage-files']['input']
      >
      type UnstageFilesInput = S.Schema.Type<
        (typeof IpcContracts)['source-control:unstage-files']['input']
      >
      type DiscardChangesInput = S.Schema.Type<
        (typeof IpcContracts)['source-control:discard-changes']['input']
      >
      type GetDiffInput = S.Schema.Type<
        (typeof IpcContracts)['source-control:get-diff']['input']
      >
      type CreateStashInput = S.Schema.Type<
        (typeof IpcContracts)['source-control:create-stash']['input']
      >
      type PopStashInput = S.Schema.Type<
        (typeof IpcContracts)['source-control:pop-stash']['input']
      >

      return {
        // ===== Repository Management Operations =====

        /**
         * Discover all Git repositories in the specified search paths
         */
        discoverRepositories: (searchPaths: DiscoverRepositoriesInput['searchPaths']) =>
          ipc.invoke('source-control:discover-repositories', { searchPaths }),

        /**
         * Get repository information by path
         */
        getRepository: (path: GetRepositoryInput['path']) =>
          ipc.invoke('source-control:get-repository', { path }),

        /**
         * Get repository information by ID
         */
        getRepositoryById: (repositoryId: GetRepositoryByIdInput['repositoryId']) =>
          ipc.invoke('source-control:get-repository-by-id', { repositoryId }),

        /**
         * Refresh repository state (re-read from disk)
         */
        refreshRepository: (repositoryId: RefreshRepositoryInput['repositoryId']) =>
          ipc.invoke('source-control:refresh-repository', { repositoryId }),

        /**
         * Validate repository path
         */
        validateRepository: (path: ValidateRepositoryInput['path']) =>
          ipc.invoke('source-control:validate-repository', { path }),

        /**
         * Get repository metadata (size, commit count, etc.)
         */
        getRepositoryMetadata: (repositoryId: GetRepositoryMetadataInput['repositoryId']) =>
          ipc.invoke('source-control:get-repository-metadata', { repositoryId }),

        /**
         * Get all known repositories
         */
        getAllRepositories: () => ipc.invoke('source-control:get-all-repositories', {}),

        /**
         * Forget a repository (remove from cache)
         */
        forgetRepository: (repositoryId: ForgetRepositoryInput['repositoryId']) =>
          ipc.invoke('source-control:forget-repository', { repositoryId }),

        // ===== Commit Graph Operations =====

        /**
         * Build commit graph for a repository
         */
        buildCommitGraph: (
          repositoryId: BuildCommitGraphInput['repositoryId'],
          options?: BuildCommitGraphInput['options']
        ) =>
          ipc.invoke('source-control:build-commit-graph', {
            repositoryId,
            options,
          }),

        /**
         * Get commit graph statistics
         */
        getCommitGraphStatistics: (
          repositoryId: GetCommitGraphStatisticsInput['repositoryId']
        ) =>
          ipc.invoke('source-control:get-commit-graph-statistics', {
            repositoryId,
          }),

        /**
         * Get a specific commit by hash
         */
        getCommit: (
          repositoryId: GetCommitInput['repositoryId'],
          commitHash: GetCommitInput['commitHash']
        ) =>
          ipc.invoke('source-control:get-commit', {
            repositoryId,
            commitHash,
          }),

        /**
         * Get commit with refs (branches, tags)
         */
        getCommitWithRefs: (
          repositoryId: GetCommitWithRefsInput['repositoryId'],
          commitHash: GetCommitWithRefsInput['commitHash']
        ) =>
          ipc.invoke('source-control:get-commit-with-refs', {
            repositoryId,
            commitHash,
          }),

        /**
         * Get commit history for a branch
         */
        getCommitHistory: (
          repositoryId: GetCommitHistoryInput['repositoryId'],
          branchName: GetCommitHistoryInput['branchName'],
          maxCount?: GetCommitHistoryInput['maxCount']
        ) =>
          ipc.invoke('source-control:get-commit-history', {
            repositoryId,
            branchName,
            maxCount,
          }),

        // ===== Working Tree Operations =====

        /**
         * Get working tree status
         */
        getStatus: (repositoryId: GetStatusInput['repositoryId']) =>
          ipc.invoke('source-control:get-status', { repositoryId }),

        /**
         * Get working tree status summary
         */
        getStatusSummary: (repositoryId: GetStatusSummaryInput['repositoryId']) =>
          ipc.invoke('source-control:get-status-summary', { repositoryId }),

        /**
         * Stage files
         */
        stageFiles: (
          repositoryId: StageFilesInput['repositoryId'],
          paths: StageFilesInput['paths']
        ) =>
          ipc.invoke('source-control:stage-files', {
            repositoryId,
            paths,
          }),

        /**
         * Unstage files
         */
        unstageFiles: (
          repositoryId: UnstageFilesInput['repositoryId'],
          paths: UnstageFilesInput['paths']
        ) =>
          ipc.invoke('source-control:unstage-files', {
            repositoryId,
            paths,
          }),

        /**
         * Discard changes to files
         */
        discardChanges: (
          repositoryId: DiscardChangesInput['repositoryId'],
          paths: DiscardChangesInput['paths']
        ) =>
          ipc.invoke('source-control:discard-changes', {
            repositoryId,
            paths,
          }),

        /**
         * Get diff for file or commit
         */
        getDiff: (
          repositoryId: GetDiffInput['repositoryId'],
          options: GetDiffInput['options']
        ) =>
          ipc.invoke('source-control:get-diff', {
            repositoryId,
            options,
          }),

        /**
         * Create stash
         */
        createStash: (
          repositoryId: CreateStashInput['repositoryId'],
          message?: CreateStashInput['message'],
          includeUntracked?: CreateStashInput['includeUntracked']
        ) =>
          ipc.invoke('source-control:create-stash', {
            repositoryId,
            message,
            includeUntracked,
          }),

        /**
         * List stashes
         */
        listStashes: (repositoryId: GetStatusInput['repositoryId']) =>
          ipc.invoke('source-control:list-stashes', { repositoryId }),

        /**
         * Pop stash
         */
        popStash: (
          repositoryId: PopStashInput['repositoryId'],
          index?: PopStashInput['index']
        ) =>
          ipc.invoke('source-control:pop-stash', {
            repositoryId,
            index,
          }),
      } as const
    }),
  }
) {}
