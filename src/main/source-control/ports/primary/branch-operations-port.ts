import { Effect } from 'effect'
import { RepositoryId, RepositoryNotFoundError } from '../../domain/aggregates/repository'
import {
  Branch,
  BranchState,
  BranchComparison,
  BranchType,
} from '../../domain/entities/branch'
import { Remote } from '../../domain/entities/remote'
import { BranchName } from '../../domain/value-objects/branch-name'
import { CommitHash } from '../../domain/value-objects/commit-hash'
import { Data } from 'effect'

/**
 * Branch operation errors
 */
export class BranchNotFoundError extends Data.TaggedError('BranchNotFoundError')<{
  repositoryId: RepositoryId
  branchName: BranchName
}> {}

export class BranchExistsError extends Data.TaggedError('BranchExistsError')<{
  repositoryId: RepositoryId
  branchName: BranchName
}> {}

export class BranchOperationError extends Data.TaggedError('BranchOperationError')<{
  repositoryId: RepositoryId
  operation: string
  branchName?: BranchName
  reason: string
  cause?: unknown
}> {}

export class MergeConflictError extends Data.TaggedError('MergeConflictError')<{
  repositoryId: RepositoryId
  sourceBranch: BranchName
  targetBranch: BranchName
  conflictedFiles: string[]
}> {}

/**
 * Merge options
 */
export class MergeOptions {
  constructor(
    readonly noFastForward?: boolean,
    readonly fastForwardOnly?: boolean,
    readonly squash?: boolean,
    readonly message?: string,
    readonly strategy?: 'ort' | 'recursive' | 'octopus' | 'ours' | 'subtree'
  ) {}
}

/**
 * Rebase options
 */
export class RebaseOptions {
  constructor(
    readonly interactive?: boolean,
    readonly preserve?: boolean, // Preserve merges
    readonly autosquash?: boolean,
    readonly onto?: CommitHash
  ) {}
}

/**
 * BranchOperationsPort - Primary port for branch operations
 *
 * This port defines use cases for:
 * - Branch listing and information
 * - Branch creation and deletion
 * - Branch checkout and switching
 * - Merge and rebase operations
 * - Branch tracking and upstream management
 *
 * This is a PRIMARY (driving) port - called by the UI/API layer.
 * Implemented by BranchService.
 */
export interface BranchOperationsPort {
  /**
   * List all branches in a repository
   *
   * Returns local, remote, and tracking branches.
   *
   * @param repositoryId - Repository identifier
   * @param type - Filter by branch type
   * @returns Array of branches
   */
  listBranches(
    repositoryId: RepositoryId,
    type?: BranchType
  ): Effect.Effect<Branch[], RepositoryNotFoundError | BranchOperationError>

  /**
   * Get a specific branch
   *
   * @param repositoryId - Repository identifier
   * @param branchName - Branch name
   * @returns Branch entity
   */
  getBranch(
    repositoryId: RepositoryId,
    branchName: BranchName
  ): Effect.Effect<Branch, RepositoryNotFoundError | BranchNotFoundError>

  /**
   * Get branch state with sync information
   *
   * Returns branch with ahead/behind counts relative to upstream.
   *
   * @param repositoryId - Repository identifier
   * @param branchName - Branch name
   * @returns Branch state
   */
  getBranchState(
    repositoryId: RepositoryId,
    branchName: BranchName
  ): Effect.Effect<
    BranchState,
    RepositoryNotFoundError | BranchNotFoundError | BranchOperationError
  >

  /**
   * Get the current branch
   *
   * Returns the branch currently checked out (HEAD points to).
   *
   * @param repositoryId - Repository identifier
   * @returns Current branch (undefined if detached HEAD)
   */
  getCurrentBranch(
    repositoryId: RepositoryId
  ): Effect.Effect<Branch | undefined, RepositoryNotFoundError | BranchOperationError>

  /**
   * Create a new branch
   *
   * Creates a branch at the specified commit (defaults to HEAD).
   *
   * @param repositoryId - Repository identifier
   * @param branchName - New branch name
   * @param startPoint - Commit to create branch from (defaults to HEAD)
   * @param checkout - Whether to checkout the new branch
   * @returns Newly created branch
   */
  createBranch(
    repositoryId: RepositoryId,
    branchName: BranchName,
    startPoint?: CommitHash,
    checkout?: boolean
  ): Effect.Effect<
    Branch,
    RepositoryNotFoundError | BranchExistsError | BranchOperationError
  >

  /**
   * Delete a branch
   *
   * Deletes a local branch.
   *
   * @param repositoryId - Repository identifier
   * @param branchName - Branch to delete
   * @param force - Force deletion even if not fully merged
   * @returns Deleted branch information
   */
  deleteBranch(
    repositoryId: RepositoryId,
    branchName: BranchName,
    force?: boolean
  ): Effect.Effect<
    Branch,
    RepositoryNotFoundError | BranchNotFoundError | BranchOperationError
  >

  /**
   * Rename a branch
   *
   * Renames a local branch.
   *
   * @param repositoryId - Repository identifier
   * @param oldName - Current branch name
   * @param newName - New branch name
   * @param force - Force rename even if newName exists
   * @returns Renamed branch
   */
  renameBranch(
    repositoryId: RepositoryId,
    oldName: BranchName,
    newName: BranchName,
    force?: boolean
  ): Effect.Effect<
    Branch,
    RepositoryNotFoundError | BranchNotFoundError | BranchExistsError | BranchOperationError
  >

  /**
   * Checkout a branch
   *
   * Switches to a different branch.
   *
   * @param repositoryId - Repository identifier
   * @param branchName - Branch to checkout
   * @param createIfMissing - Create branch if it doesn't exist
   * @returns Checked out branch
   */
  checkoutBranch(
    repositoryId: RepositoryId,
    branchName: BranchName,
    createIfMissing?: boolean
  ): Effect.Effect<
    Branch,
    RepositoryNotFoundError | BranchNotFoundError | BranchOperationError
  >

  /**
   * Checkout a specific commit (detached HEAD)
   *
   * @param repositoryId - Repository identifier
   * @param commitHash - Commit to checkout
   * @returns Commit hash
   */
  checkoutCommit(
    repositoryId: RepositoryId,
    commitHash: CommitHash
  ): Effect.Effect<CommitHash, RepositoryNotFoundError | BranchOperationError>

  /**
   * Merge a branch into current branch
   *
   * @param repositoryId - Repository identifier
   * @param sourceBranch - Branch to merge from
   * @param options - Merge options
   * @returns Merge commit hash (undefined if fast-forward)
   */
  mergeBranch(
    repositoryId: RepositoryId,
    sourceBranch: BranchName,
    options?: MergeOptions
  ): Effect.Effect<
    CommitHash | undefined,
    RepositoryNotFoundError | BranchNotFoundError | MergeConflictError | BranchOperationError
  >

  /**
   * Abort an in-progress merge
   *
   * @param repositoryId - Repository identifier
   * @returns void
   */
  abortMerge(
    repositoryId: RepositoryId
  ): Effect.Effect<void, RepositoryNotFoundError | BranchOperationError>

  /**
   * Continue a merge after resolving conflicts
   *
   * @param repositoryId - Repository identifier
   * @param message - Merge commit message
   * @returns Merge commit hash
   */
  continueMerge(
    repositoryId: RepositoryId,
    message?: string
  ): Effect.Effect<CommitHash, RepositoryNotFoundError | BranchOperationError>

  /**
   * Rebase current branch onto another branch
   *
   * @param repositoryId - Repository identifier
   * @param targetBranch - Branch to rebase onto
   * @param options - Rebase options
   * @returns New HEAD commit
   */
  rebaseBranch(
    repositoryId: RepositoryId,
    targetBranch: BranchName,
    options?: RebaseOptions
  ): Effect.Effect<
    CommitHash,
    RepositoryNotFoundError | BranchNotFoundError | MergeConflictError | BranchOperationError
  >

  /**
   * Abort an in-progress rebase
   *
   * @param repositoryId - Repository identifier
   * @returns void
   */
  abortRebase(
    repositoryId: RepositoryId
  ): Effect.Effect<void, RepositoryNotFoundError | BranchOperationError>

  /**
   * Continue a rebase after resolving conflicts
   *
   * @param repositoryId - Repository identifier
   * @returns New HEAD commit
   */
  continueRebase(
    repositoryId: RepositoryId
  ): Effect.Effect<CommitHash, RepositoryNotFoundError | BranchOperationError>

  /**
   * Set upstream branch for tracking
   *
   * @param repositoryId - Repository identifier
   * @param branchName - Local branch
   * @param upstream - Remote branch to track
   * @returns Updated branch
   */
  setUpstream(
    repositoryId: RepositoryId,
    branchName: BranchName,
    upstream: BranchName
  ): Effect.Effect<
    Branch,
    RepositoryNotFoundError | BranchNotFoundError | BranchOperationError
  >

  /**
   * Unset upstream tracking
   *
   * @param repositoryId - Repository identifier
   * @param branchName - Local branch
   * @returns Updated branch
   */
  unsetUpstream(
    repositoryId: RepositoryId,
    branchName: BranchName
  ): Effect.Effect<
    Branch,
    RepositoryNotFoundError | BranchNotFoundError | BranchOperationError
  >

  /**
   * Compare two branches
   *
   * Returns commits that differ between branches.
   *
   * @param repositoryId - Repository identifier
   * @param baseBranch - Base branch for comparison
   * @param compareBranch - Branch to compare
   * @returns Comparison result
   */
  compareBranches(
    repositoryId: RepositoryId,
    baseBranch: BranchName,
    compareBranch: BranchName
  ): Effect.Effect<
    BranchComparison,
    RepositoryNotFoundError | BranchNotFoundError | BranchOperationError
  >

  /**
   * Get all remotes for a repository
   *
   * @param repositoryId - Repository identifier
   * @returns Array of remotes
   */
  listRemotes(
    repositoryId: RepositoryId
  ): Effect.Effect<Remote[], RepositoryNotFoundError | BranchOperationError>

  /**
   * Fetch from remote
   *
   * Updates remote tracking branches.
   *
   * @param repositoryId - Repository identifier
   * @param remoteName - Remote to fetch from (defaults to all)
   * @param prune - Remove stale remote tracking branches
   * @returns void
   */
  fetch(
    repositoryId: RepositoryId,
    remoteName?: string,
    prune?: boolean
  ): Effect.Effect<void, RepositoryNotFoundError | BranchOperationError>

  /**
   * Pull from upstream
   *
   * Fetches and merges upstream into current branch.
   *
   * @param repositoryId - Repository identifier
   * @param remote - Remote name (defaults to upstream remote)
   * @param rebase - Use rebase instead of merge
   * @returns New HEAD commit
   */
  pull(
    repositoryId: RepositoryId,
    remote?: string,
    rebase?: boolean
  ): Effect.Effect<
    CommitHash,
    RepositoryNotFoundError | MergeConflictError | BranchOperationError
  >

  /**
   * Push to remote
   *
   * Pushes current branch to remote.
   *
   * @param repositoryId - Repository identifier
   * @param remote - Remote name (defaults to upstream remote)
   * @param force - Force push
   * @param setUpstream - Set upstream tracking
   * @returns void
   */
  push(
    repositoryId: RepositoryId,
    remote?: string,
    force?: boolean,
    setUpstream?: boolean
  ): Effect.Effect<void, RepositoryNotFoundError | BranchOperationError>
}

/**
 * Tag for dependency injection
 */
export const BranchOperationsPort = Effect.Tag<BranchOperationsPort>('BranchOperationsPort')
