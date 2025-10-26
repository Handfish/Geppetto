import { Effect } from 'effect'
import { RepositoryId, RepositoryNotFoundError } from '../../domain/aggregates/repository'
import {
  WorkingTree,
  WorkingTreeStatus,
  FileChange,
  FilePath,
  MergeConflict,
  WorkingTreeError,
  ConflictResolutionError,
  StagingError,
} from '../../domain/aggregates/working-tree'
import { FileStatus } from '../../domain/value-objects/file-status'

/**
 * StageOptions - Options for staging files
 */
export class StageOptions {
  constructor(
    readonly update?: boolean, // Stage modified/deleted but not new files
    readonly all?: boolean, // Stage all changes including untracked
    readonly force?: boolean, // Stage ignored files
    readonly intent?: boolean // Stage intent to add (no content)
  ) {}
}

/**
 * DiffOptions - Options for generating diffs
 */
export class DiffOptions {
  constructor(
    readonly staged?: boolean, // Diff staged changes vs HEAD
    readonly unified?: number, // Number of context lines
    readonly wordDiff?: boolean, // Show word-level diffs
    readonly ignoreWhitespace?: boolean,
    readonly ignoreBlankLines?: boolean
  ) {}
}

/**
 * ConflictResolutionStrategy - Strategy for resolving conflicts
 */
export type ConflictResolutionStrategy = 'ours' | 'theirs' | 'manual'

/**
 * WorkingTreePort - Primary port for working tree operations
 *
 * This port defines use cases for:
 * - File staging and unstaging
 * - Working tree status
 * - Diff generation
 * - Conflict resolution
 * - Stash operations
 *
 * This is a PRIMARY (driving) port - called by the UI/API layer.
 * Implemented by WorkingTreeService.
 */
export interface WorkingTreePort {
  /**
   * Get working tree status
   *
   * Returns current state of staged, unstaged, and untracked files.
   *
   * @param repositoryId - Repository identifier
   * @returns Working tree aggregate
   */
  getStatus(
    repositoryId: RepositoryId
  ): Effect.Effect<WorkingTree, RepositoryNotFoundError | WorkingTreeError>

  /**
   * Get working tree status summary
   *
   * Returns a quick summary without detailed file information.
   *
   * @param repositoryId - Repository identifier
   * @returns Status summary
   */
  getStatusSummary(
    repositoryId: RepositoryId
  ): Effect.Effect<WorkingTreeStatus, RepositoryNotFoundError | WorkingTreeError>

  /**
   * Refresh working tree status
   *
   * Re-queries Git for current status.
   *
   * @param repositoryId - Repository identifier
   * @returns Updated working tree
   */
  refreshStatus(
    repositoryId: RepositoryId
  ): Effect.Effect<WorkingTree, RepositoryNotFoundError | WorkingTreeError>

  /**
   * Get all file changes
   *
   * Returns all staged, unstaged, and untracked files.
   *
   * @param repositoryId - Repository identifier
   * @returns Array of file changes
   */
  getAllChanges(
    repositoryId: RepositoryId
  ): Effect.Effect<FileChange[], RepositoryNotFoundError | WorkingTreeError>

  /**
   * Get staged changes
   *
   * Returns files that are staged for commit.
   *
   * @param repositoryId - Repository identifier
   * @returns Array of staged file changes
   */
  getStagedChanges(
    repositoryId: RepositoryId
  ): Effect.Effect<FileChange[], RepositoryNotFoundError | WorkingTreeError>

  /**
   * Get unstaged changes
   *
   * Returns modified but not staged files.
   *
   * @param repositoryId - Repository identifier
   * @returns Array of unstaged file changes
   */
  getUnstagedChanges(
    repositoryId: RepositoryId
  ): Effect.Effect<FileChange[], RepositoryNotFoundError | WorkingTreeError>

  /**
   * Get untracked files
   *
   * Returns files not tracked by Git.
   *
   * @param repositoryId - Repository identifier
   * @returns Array of untracked files
   */
  getUntrackedFiles(
    repositoryId: RepositoryId
  ): Effect.Effect<FileChange[], RepositoryNotFoundError | WorkingTreeError>

  /**
   * Get conflicted files
   *
   * Returns files with merge conflicts.
   *
   * @param repositoryId - Repository identifier
   * @returns Array of conflicted files
   */
  getConflictedFiles(
    repositoryId: RepositoryId
  ): Effect.Effect<FileChange[], RepositoryNotFoundError | WorkingTreeError>

  /**
   * Stage files
   *
   * Adds files to the index for commit.
   *
   * @param repositoryId - Repository identifier
   * @param paths - File paths to stage (empty = stage all)
   * @param options - Stage options
   * @returns Updated working tree
   */
  stageFiles(
    repositoryId: RepositoryId,
    paths: FilePath[],
    options?: StageOptions
  ): Effect.Effect<WorkingTree, RepositoryNotFoundError | StagingError>

  /**
   * Unstage files
   *
   * Removes files from the index.
   *
   * @param repositoryId - Repository identifier
   * @param paths - File paths to unstage (empty = unstage all)
   * @returns Updated working tree
   */
  unstageFiles(
    repositoryId: RepositoryId,
    paths: FilePath[]
  ): Effect.Effect<WorkingTree, RepositoryNotFoundError | StagingError>

  /**
   * Discard changes in working directory
   *
   * Reverts files to their state in HEAD.
   * WARNING: This permanently loses changes!
   *
   * @param repositoryId - Repository identifier
   * @param paths - File paths to discard
   * @returns Updated working tree
   */
  discardChanges(
    repositoryId: RepositoryId,
    paths: FilePath[]
  ): Effect.Effect<WorkingTree, RepositoryNotFoundError | WorkingTreeError>

  /**
   * Get diff for a file
   *
   * Returns the diff showing changes in a file.
   *
   * @param repositoryId - Repository identifier
   * @param path - File path
   * @param options - Diff options
   * @returns Diff text
   */
  getDiff(
    repositoryId: RepositoryId,
    path: FilePath,
    options?: DiffOptions
  ): Effect.Effect<string, RepositoryNotFoundError | WorkingTreeError>

  /**
   * Get diff for all changes
   *
   * @param repositoryId - Repository identifier
   * @param options - Diff options
   * @returns Diff text
   */
  getAllDiffs(
    repositoryId: RepositoryId,
    options?: DiffOptions
  ): Effect.Effect<string, RepositoryNotFoundError | WorkingTreeError>

  /**
   * Get merge conflicts
   *
   * Returns detailed conflict information for files.
   *
   * @param repositoryId - Repository identifier
   * @returns Array of merge conflicts
   */
  getConflicts(
    repositoryId: RepositoryId
  ): Effect.Effect<MergeConflict[], RepositoryNotFoundError | WorkingTreeError>

  /**
   * Resolve conflict
   *
   * Resolves a merge conflict using the specified strategy.
   *
   * @param repositoryId - Repository identifier
   * @param path - Conflicted file path
   * @param strategy - Resolution strategy
   * @returns Updated working tree
   */
  resolveConflict(
    repositoryId: RepositoryId,
    path: FilePath,
    strategy: ConflictResolutionStrategy
  ): Effect.Effect<WorkingTree, RepositoryNotFoundError | ConflictResolutionError>

  /**
   * Mark conflict as resolved
   *
   * Stages a file after manual conflict resolution.
   *
   * @param repositoryId - Repository identifier
   * @param path - File path
   * @returns Updated working tree
   */
  markConflictResolved(
    repositoryId: RepositoryId,
    path: FilePath
  ): Effect.Effect<WorkingTree, RepositoryNotFoundError | ConflictResolutionError>

  /**
   * Clean working directory
   *
   * Removes untracked files and directories.
   * WARNING: This permanently deletes files!
   *
   * @param repositoryId - Repository identifier
   * @param removeDirectories - Also remove untracked directories
   * @param force - Force removal of ignored files too
   * @param dryRun - Show what would be removed without removing
   * @returns List of removed files
   */
  clean(
    repositoryId: RepositoryId,
    removeDirectories?: boolean,
    force?: boolean,
    dryRun?: boolean
  ): Effect.Effect<string[], RepositoryNotFoundError | WorkingTreeError>

  /**
   * Create a stash
   *
   * Saves current changes and reverts to clean state.
   *
   * @param repositoryId - Repository identifier
   * @param message - Stash message
   * @param includeUntracked - Include untracked files
   * @param keepIndex - Keep staged changes
   * @returns Stash identifier
   */
  createStash(
    repositoryId: RepositoryId,
    message?: string,
    includeUntracked?: boolean,
    keepIndex?: boolean
  ): Effect.Effect<string, RepositoryNotFoundError | WorkingTreeError>

  /**
   * List stashes
   *
   * @param repositoryId - Repository identifier
   * @returns Array of stash entries
   */
  listStashes(
    repositoryId: RepositoryId
  ): Effect.Effect<
    Array<{ index: number; message: string; date: Date }>,
    RepositoryNotFoundError | WorkingTreeError
  >

  /**
   * Apply a stash
   *
   * Applies stashed changes without removing from stash list.
   *
   * @param repositoryId - Repository identifier
   * @param stashIndex - Stash index (defaults to latest)
   * @returns Updated working tree
   */
  applyStash(
    repositoryId: RepositoryId,
    stashIndex?: number
  ): Effect.Effect<WorkingTree, RepositoryNotFoundError | WorkingTreeError>

  /**
   * Pop a stash
   *
   * Applies and removes stashed changes.
   *
   * @param repositoryId - Repository identifier
   * @param stashIndex - Stash index (defaults to latest)
   * @returns Updated working tree
   */
  popStash(
    repositoryId: RepositoryId,
    stashIndex?: number
  ): Effect.Effect<WorkingTree, RepositoryNotFoundError | WorkingTreeError>

  /**
   * Drop a stash
   *
   * Removes a stash without applying.
   *
   * @param repositoryId - Repository identifier
   * @param stashIndex - Stash index (defaults to latest)
   * @returns void
   */
  dropStash(
    repositoryId: RepositoryId,
    stashIndex?: number
  ): Effect.Effect<void, RepositoryNotFoundError | WorkingTreeError>

  /**
   * Clear all stashes
   *
   * Removes all stashes.
   * WARNING: This cannot be undone!
   *
   * @param repositoryId - Repository identifier
   * @returns void
   */
  clearStashes(
    repositoryId: RepositoryId
  ): Effect.Effect<void, RepositoryNotFoundError | WorkingTreeError>
}

/**
 * Tag for dependency injection
 */
export const WorkingTreePort = Effect.Tag<WorkingTreePort>('WorkingTreePort')
