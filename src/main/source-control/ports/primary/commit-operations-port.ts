import { Effect, Context } from 'effect'
import { RepositoryId, RepositoryNotFoundError } from '../../domain/aggregates/repository'
import {
  CommitGraph,
  GraphOptions,
  GraphUpdateResult,
  CommitGraphNode,
  GraphStatistics,
  GraphBuildError,
  GraphUpdateError,
} from '../../domain/aggregates/commit-graph'
import { Commit, CommitWithRefs, CommitRange } from '../../domain/entities/commit'
import { CommitHash } from '../../domain/value-objects/commit-hash'
import { BranchName } from '../../domain/value-objects/branch-name'

/**
 * CommitAuthorInfo - Information for creating commits
 */
export class CommitAuthorInfo {
  constructor(
    readonly name: string,
    readonly email: string
  ) {}
}

/**
 * CommitOptions - Options for creating commits
 */
export class CommitOptions {
  constructor(
    readonly message: string,
    readonly author?: CommitAuthorInfo,
    readonly amend?: boolean,
    readonly allowEmpty?: boolean,
    readonly signOff?: boolean
  ) {}
}

/**
 * CherryPickOptions - Options for cherry-pick operations
 */
export class CherryPickOptions {
  constructor(
    readonly noCommit?: boolean,
    readonly mainline?: number // For cherry-picking merge commits
  ) {}
}

/**
 * RevertOptions - Options for revert operations
 */
export class RevertOptions {
  constructor(
    readonly noCommit?: boolean,
    readonly mainline?: number
  ) {}
}

/**
 * CommitOperationsPort - Primary port for commit-related operations
 *
 * This port defines use cases for:
 * - Commit graph building and visualization
 * - Commit creation
 * - Commit history traversal
 * - Cherry-pick and revert operations
 *
 * This is a PRIMARY (driving) port - called by the UI/API layer.
 * Implemented by CommitGraphService and related application services.
 */
export interface CommitOperationsPort {
  /**
   * Build a commit graph for a repository
   *
   * Parses commit history and constructs a directed acyclic graph (DAG).
   * Includes layout information for visualization.
   *
   * @param repositoryId - Repository identifier
   * @param options - Graph building options (max commits, branches, etc.)
   * @returns Commit graph with nodes and edges
   */
  buildCommitGraph(
    repositoryId: RepositoryId,
    options?: GraphOptions
  ): Effect.Effect<CommitGraph, RepositoryNotFoundError | GraphBuildError>

  /**
   * Refresh commit graph with new commits
   *
   * Incrementally updates an existing graph with new commits.
   * More efficient than rebuilding entire graph.
   *
   * @param repositoryId - Repository identifier
   * @param existingGraph - Existing commit graph
   * @returns Updated graph and change summary
   */
  refreshCommitGraph(
    repositoryId: RepositoryId,
    existingGraph: CommitGraph
  ): Effect.Effect<GraphUpdateResult, RepositoryNotFoundError | GraphUpdateError>

  /**
   * Get commit graph statistics
   *
   * Returns metadata about the commit graph without building full graph.
   *
   * @param repositoryId - Repository identifier
   * @returns Graph statistics
   */
  getCommitGraphStatistics(
    repositoryId: RepositoryId
  ): Effect.Effect<GraphStatistics, RepositoryNotFoundError | GraphBuildError>

  /**
   * Get a specific commit by hash
   *
   * Retrieves full commit information including message, author, parents.
   *
   * @param repositoryId - Repository identifier
   * @param commitHash - Commit hash
   * @returns Commit entity
   */
  getCommit(
    repositoryId: RepositoryId,
    commitHash: CommitHash
  ): Effect.Effect<Commit, RepositoryNotFoundError | GraphBuildError>

  /**
   * Get commit with reference information
   *
   * Returns commit along with branches/tags that point to it.
   *
   * @param repositoryId - Repository identifier
   * @param commitHash - Commit hash
   * @returns Commit with refs
   */
  getCommitWithRefs(
    repositoryId: RepositoryId,
    commitHash: CommitHash
  ): Effect.Effect<CommitWithRefs, RepositoryNotFoundError | GraphBuildError>

  /**
   * Get commit history for a branch
   *
   * Returns commits reachable from the branch tip.
   *
   * @param repositoryId - Repository identifier
   * @param branchName - Branch name
   * @param maxCount - Maximum number of commits to return
   * @returns Array of commits
   */
  getCommitHistory(
    repositoryId: RepositoryId,
    branchName: BranchName,
    maxCount?: number
  ): Effect.Effect<Commit[], RepositoryNotFoundError | GraphBuildError>

  /**
   * Get commits in a range
   *
   * Returns commits between two commits (from..to).
   *
   * @param repositoryId - Repository identifier
   * @param range - Commit range
   * @returns Array of commits in range
   */
  getCommitsInRange(
    repositoryId: RepositoryId,
    range: CommitRange
  ): Effect.Effect<Commit[], RepositoryNotFoundError | GraphBuildError>

  /**
   * Get commits by author
   *
   * Returns commits authored by the specified author.
   *
   * @param repositoryId - Repository identifier
   * @param authorEmail - Author email
   * @param maxCount - Maximum number of commits
   * @returns Array of commits
   */
  getCommitsByAuthor(
    repositoryId: RepositoryId,
    authorEmail: string,
    maxCount?: number
  ): Effect.Effect<Commit[], RepositoryNotFoundError | GraphBuildError>

  /**
   * Create a new commit
   *
   * Creates a commit with staged changes.
   *
   * @param repositoryId - Repository identifier
   * @param options - Commit options (message, author, etc.)
   * @returns Newly created commit hash
   */
  createCommit(
    repositoryId: RepositoryId,
    options: CommitOptions
  ): Effect.Effect<CommitHash, RepositoryNotFoundError | GraphBuildError>

  /**
   * Amend the last commit
   *
   * Modifies the most recent commit with new changes or message.
   *
   * @param repositoryId - Repository identifier
   * @param message - New commit message (if changing)
   * @returns Amended commit hash
   */
  amendCommit(
    repositoryId: RepositoryId,
    message?: string
  ): Effect.Effect<CommitHash, RepositoryNotFoundError | GraphBuildError>

  /**
   * Cherry-pick a commit
   *
   * Applies changes from a commit onto current branch.
   *
   * @param repositoryId - Repository identifier
   * @param commitHash - Commit to cherry-pick
   * @param options - Cherry-pick options
   * @returns New commit hash (if committed)
   */
  cherryPickCommit(
    repositoryId: RepositoryId,
    commitHash: CommitHash,
    options?: CherryPickOptions
  ): Effect.Effect<CommitHash | undefined, RepositoryNotFoundError | GraphBuildError>

  /**
   * Revert a commit
   *
   * Creates a new commit that undoes changes from a previous commit.
   *
   * @param repositoryId - Repository identifier
   * @param commitHash - Commit to revert
   * @param options - Revert options
   * @returns New revert commit hash
   */
  revertCommit(
    repositoryId: RepositoryId,
    commitHash: CommitHash,
    options?: RevertOptions
  ): Effect.Effect<CommitHash, RepositoryNotFoundError | GraphBuildError>

  /**
   * Get parent commits
   *
   * Returns direct parent commits of a commit.
   *
   * @param repositoryId - Repository identifier
   * @param commitHash - Commit hash
   * @returns Array of parent commits
   */
  getParentCommits(
    repositoryId: RepositoryId,
    commitHash: CommitHash
  ): Effect.Effect<Commit[], RepositoryNotFoundError | GraphBuildError>

  /**
   * Get child commits
   *
   * Returns commits that have this commit as a parent.
   *
   * @param repositoryId - Repository identifier
   * @param commitHash - Commit hash
   * @returns Array of child commits
   */
  getChildCommits(
    repositoryId: RepositoryId,
    commitHash: CommitHash
  ): Effect.Effect<Commit[], RepositoryNotFoundError | GraphBuildError>

  /**
   * Check if commit is ancestor of another
   *
   * Returns true if ancestorHash is reachable from descendantHash.
   *
   * @param repositoryId - Repository identifier
   * @param ancestorHash - Potential ancestor commit
   * @param descendantHash - Potential descendant commit
   * @returns True if ancestor relationship exists
   */
  isAncestor(
    repositoryId: RepositoryId,
    ancestorHash: CommitHash,
    descendantHash: CommitHash
  ): Effect.Effect<boolean, RepositoryNotFoundError | GraphBuildError>

  /**
   * Find merge base between commits
   *
   * Returns the best common ancestor of two commits.
   *
   * @param repositoryId - Repository identifier
   * @param commit1 - First commit
   * @param commit2 - Second commit
   * @returns Merge base commit
   */
  findMergeBase(
    repositoryId: RepositoryId,
    commit1: CommitHash,
    commit2: CommitHash
  ): Effect.Effect<CommitHash, RepositoryNotFoundError | GraphBuildError>

  /**
   * Get files changed in a commit
   *
   * Returns list of files with their change status and line counts.
   *
   * @param repositoryId - Repository identifier
   * @param commitHash - Commit hash
   * @returns Array of file changes with status and stats
   */
  getCommitFiles(
    repositoryId: RepositoryId,
    commitHash: CommitHash
  ): Effect.Effect<
    Array<{
      path: string
      status: 'modified' | 'added' | 'deleted' | 'renamed' | 'copied' | 'unmodified' | 'untracked' | 'ignored' | 'conflicted'
      staged: boolean
      oldPath?: string
      additions?: number
      deletions?: number
    }>,
    RepositoryNotFoundError | GraphBuildError
  >
}

/**
 * Tag for dependency injection
 */
export const CommitOperationsPort = Context.GenericTag<CommitOperationsPort>('CommitOperationsPort')
