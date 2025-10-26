import { Schema as S } from 'effect'
import { BranchName } from '../value-objects/branch-name'
import { CommitHash } from '../value-objects/commit-hash'

/**
 * BranchType - Classification of branch types
 */
export const BranchType = S.Literal('local', 'remote', 'tracking').annotations({
  title: 'Branch Type',
  description: 'Git branch type classification',
})

export type BranchType = S.Schema.Type<typeof BranchType>

/**
 * Branch - Entity representing a Git branch
 *
 * A branch is a lightweight movable pointer to a commit. Branches can be:
 * - Local: Exists in the local repository
 * - Remote: Exists in a remote repository (prefixed with remote name)
 * - Tracking: Local branch with an upstream remote branch
 *
 * Domain invariants:
 * - Branch name must be unique within its scope (local vs remote)
 * - Tracking branch must have both local and remote references
 * - HEAD pointer indicates current branch
 */
export class Branch extends S.Class<Branch>('Branch')({
  name: BranchName,
  type: BranchType,
  commit: CommitHash, // Current commit this branch points to
  upstream: S.optional(BranchName), // Remote tracking branch (e.g., origin/main)
  isCurrent: S.Boolean, // Is this the current HEAD
  isDetached: S.Boolean, // Is HEAD detached at this branch
}) {
  /**
   * Check if this is a local branch
   */
  isLocal(): boolean {
    return this.type === 'local'
  }

  /**
   * Check if this is a remote branch
   */
  isRemote(): boolean {
    return this.type === 'remote'
  }

  /**
   * Check if this is a tracking branch (has upstream)
   */
  isTracking(): boolean {
    return this.type === 'tracking' && this.upstream !== undefined
  }

  /**
   * Get the short branch name (without remote prefix)
   */
  getShortName(): string {
    return this.name.getShortName()
  }

  /**
   * Get the remote name if this is a remote or tracking branch
   */
  getRemoteName(): string | undefined {
    if (this.isRemote()) {
      return this.name.getRemoteName()
    }
    if (this.isTracking() && this.upstream) {
      return this.upstream.getRemoteName()
    }
    return undefined
  }

  /**
   * Check if this branch is the main development branch
   */
  isMainBranch(): boolean {
    return this.name.isMainBranch()
  }

  /**
   * Check if this branch is the development branch
   */
  isDevelopBranch(): boolean {
    return this.name.isDevelopBranch()
  }

  /**
   * Compare branches by name for equality
   */
  equals(other: Branch): boolean {
    return this.name.equals(other.name) && this.type === other.type
  }
}

/**
 * BranchState - Additional state information about a branch
 */
export class BranchState extends S.Class<BranchState>('BranchState')({
  branch: Branch,
  aheadCount: S.Number, // Commits ahead of upstream
  behindCount: S.Number, // Commits behind upstream
  hasUnpushedCommits: S.Boolean,
  hasUnpulledCommits: S.Boolean,
}) {
  /**
   * Check if branch is in sync with upstream
   */
  isInSync(): boolean {
    return this.aheadCount === 0 && this.behindCount === 0
  }

  /**
   * Check if branch needs to be pushed
   */
  needsPush(): boolean {
    return this.hasUnpushedCommits && this.aheadCount > 0
  }

  /**
   * Check if branch needs to be pulled
   */
  needsPull(): boolean {
    return this.hasUnpulledCommits && this.behindCount > 0
  }

  /**
   * Check if branch has diverged from upstream
   */
  hasDiverged(): boolean {
    return this.aheadCount > 0 && this.behindCount > 0
  }

  /**
   * Get a human-readable sync status
   */
  getSyncStatus(): string {
    if (this.isInSync()) return 'Up to date'
    if (this.hasDiverged()) return `Diverged (${this.aheadCount} ahead, ${this.behindCount} behind)`
    if (this.needsPush()) return `${this.aheadCount} commit${this.aheadCount === 1 ? '' : 's'} ahead`
    if (this.needsPull()) return `${this.behindCount} commit${this.behindCount === 1 ? '' : 's'} behind`
    return 'Unknown'
  }
}

/**
 * BranchComparison - Compare two branches
 */
export class BranchComparison extends S.Class<BranchComparison>('BranchComparison')({
  base: BranchName,
  compare: BranchName,
  aheadCount: S.Number, // Commits in compare but not in base
  behindCount: S.Number, // Commits in base but not in compare
  commonAncestor: S.optional(CommitHash),
}) {
  /**
   * Check if branches are identical
   */
  areIdentical(): boolean {
    return this.aheadCount === 0 && this.behindCount === 0
  }

  /**
   * Check if compare is ahead of base
   */
  isAhead(): boolean {
    return this.aheadCount > 0 && this.behindCount === 0
  }

  /**
   * Check if compare is behind base
   */
  isBehind(): boolean {
    return this.aheadCount === 0 && this.behindCount > 0
  }

  /**
   * Check if branches have diverged
   */
  haveDiverged(): boolean {
    return this.aheadCount > 0 && this.behindCount > 0
  }

  /**
   * Get comparison summary
   */
  getSummary(): string {
    if (this.areIdentical()) return 'Identical'
    if (this.isAhead()) return `${this.aheadCount} ahead`
    if (this.isBehind()) return `${this.behindCount} behind`
    if (this.haveDiverged()) return `${this.aheadCount} ahead, ${this.behindCount} behind`
    return 'Unknown'
  }
}
