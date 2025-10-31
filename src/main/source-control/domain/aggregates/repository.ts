import { Schema as S } from 'effect'
import { Data } from 'effect'
import { CommitHash } from '../value-objects/commit-hash'
import { BranchName } from '../value-objects/branch-name'
import { Branch } from '../entities/branch'
import { Remote } from '../entities/remote'
import { RepositoryId } from '../../../../shared/schemas/source-control/repository'

/**
 * RepositoryId - Re-exported from shared schemas for consistency
 * Uses the shared schema RepositoryId with branded UUID for type safety
 */
export { RepositoryId }

/**
 * RepositoryState - Current state of the repository
 *
 * Represents the Git working directory state including:
 * - Current HEAD position
 * - Current branch (if not detached)
 * - Special states (merging, rebasing, cherry-picking)
 */
export class RepositoryState extends S.Class<RepositoryState>('RepositoryState')({
  head: S.optional(CommitHash), // Current HEAD commit
  branch: S.optional(BranchName), // Current branch (undefined if detached)
  isDetached: S.Boolean, // Is HEAD detached?
  isMerging: S.Boolean, // Currently in merge state?
  isRebasing: S.Boolean, // Currently rebasing?
  isCherryPicking: S.Boolean, // Currently cherry-picking?
  isBisecting: S.Boolean, // Currently bisecting?
  isReverting: S.Boolean, // Currently reverting?
}) {
  /**
   * Check if repository is in a clean state (no special operations)
   */
  isClean(): boolean {
    return (
      !this.isMerging &&
      !this.isRebasing &&
      !this.isCherryPicking &&
      !this.isBisecting &&
      !this.isReverting
    )
  }

  /**
   * Check if repository is in any special state
   */
  hasSpecialState(): boolean {
    return !this.isClean()
  }

  /**
   * Get description of current state
   */
  getStateDescription(): string {
    if (this.isDetached) return 'Detached HEAD'
    if (this.isMerging) return 'Merging'
    if (this.isRebasing) return 'Rebasing'
    if (this.isCherryPicking) return 'Cherry-picking'
    if (this.isBisecting) return 'Bisecting'
    if (this.isReverting) return 'Reverting'
    if (this.branch) return `On branch ${this.branch.value}`
    return 'Unknown state'
  }
}

/**
 * RepositoryConfig - Repository configuration
 */
export class RepositoryConfig extends S.Class<RepositoryConfig>('RepositoryConfig')({
  userName: S.optional(S.String), // user.name config
  userEmail: S.optional(S.String), // user.email config
  defaultBranch: S.optional(BranchName), // Default branch (init.defaultBranch)
  core: S.Record({ key: S.String, value: S.String }), // Core Git config
}) {
  /**
   * Check if user identity is configured
   */
  hasUserIdentity(): boolean {
    return this.userName !== undefined && this.userEmail !== undefined
  }

  /**
   * Get user identity string
   */
  getUserIdentity(): string | undefined {
    if (!this.hasUserIdentity()) return undefined
    return `${this.userName} <${this.userEmail}>`
  }
}

/**
 * Repository - Aggregate root representing a Git repository
 *
 * A repository is the main aggregate in the source control domain.
 * It contains all the information about a Git repository including:
 * - Identity and location
 * - Current state (HEAD, branch, special states)
 * - Branches
 * - Remotes
 * - Configuration
 *
 * Domain invariants:
 * - Repository must have a valid path
 * - Repository must have a valid Git directory (.git)
 * - At most one branch can be current
 * - HEAD must exist (except for newly initialized repos)
 *
 * This is the aggregate root for repository management.
 */
export class Repository extends S.Class<Repository>('Repository')({
  id: RepositoryId,
  path: S.String.pipe(
    S.nonEmptyString(),
    S.annotations({
      description: 'Absolute path to repository working directory',
    })
  ),
  name: S.String.pipe(
    S.nonEmptyString(),
    S.annotations({
      description: 'Repository name (directory name)',
    })
  ),
  state: RepositoryState,
  branches: S.Array(Branch),
  remotes: S.Array(Remote),
  config: S.optional(RepositoryConfig),
  gitDir: S.String.pipe(
    S.nonEmptyString(),
    S.annotations({
      description: 'Path to .git directory',
    })
  ),
}) {
  /**
   * Check if HEAD is detached
   */
  isDetached(): boolean {
    return this.state.isDetached
  }

  /**
   * Get the current branch
   */
  getCurrentBranch(): Branch | undefined {
    if (!this.state.branch) return undefined
    return this.branches.find((b) => b.name.equals(this.state.branch!))
  }

  /**
   * Get all local branches
   */
  getLocalBranches(): Branch[] {
    return this.branches.filter((b) => b.isLocal())
  }

  /**
   * Get all remote branches
   */
  getRemoteBranches(): Branch[] {
    return this.branches.filter((b) => b.isRemote())
  }

  /**
   * Get all tracking branches
   */
  getTrackingBranches(): Branch[] {
    return this.branches.filter((b) => b.isTracking())
  }

  /**
   * Find a branch by name
   */
  findBranch(name: BranchName): Branch | undefined {
    return this.branches.find((b) => b.name.equals(name))
  }

  /**
   * Check if repository has any remotes
   */
  hasRemotes(): boolean {
    return this.remotes.length > 0
  }

  /**
   * Get the origin remote
   */
  getOriginRemote(): Remote | undefined {
    return this.remotes.find((r) => r.isOrigin())
  }

  /**
   * Get the upstream remote
   */
  getUpstreamRemote(): Remote | undefined {
    return this.remotes.find((r) => r.isUpstream())
  }

  /**
   * Find a remote by name
   */
  findRemote(name: string): Remote | undefined {
    return this.remotes.find((r) => r.name.value === name)
  }

  /**
   * Check if repository has uncommitted changes
   * Note: This requires WorkingTree information, which is separate
   */
  hasUncommittedChanges(): boolean {
    // This is determined by WorkingTree aggregate, not Repository
    // Repository only knows about state (merging, rebasing, etc.)
    return this.state.hasSpecialState()
  }

  /**
   * Check if repository is in a mergeable state
   */
  canMerge(): boolean {
    return this.state.isClean() && !this.state.isDetached
  }

  /**
   * Check if repository is in a state where rebasing is allowed
   */
  canRebase(): boolean {
    return this.state.isClean() && !this.state.isDetached
  }

  /**
   * Check if repository is in a state where committing is allowed
   */
  canCommit(): boolean {
    // Cannot commit during rebase or cherry-pick (must continue/abort)
    // Can commit during merge (creates merge commit)
    return !this.state.isRebasing && !this.state.isCherryPicking && !this.state.isBisecting
  }

  /**
   * Get repository display name
   */
  getDisplayName(): string {
    return this.name
  }

  /**
   * Get repository path relative to a base path
   */
  getRelativePath(basePath: string): string {
    if (this.path.startsWith(basePath)) {
      return this.path.slice(basePath.length).replace(/^\//, '')
    }
    return this.path
  }

  /**
   * Check if this repository is a bare repository
   * (bare repos have .git as the root, not a subdirectory)
   */
  isBare(): boolean {
    return this.gitDir === this.path
  }

  /**
   * Compare repositories by ID for equality
   */
  equals(other: Repository): boolean {
    return this.id.equals(other.id)
  }

  /**
   * Compare repositories by path for equality
   */
  hasSamePath(other: Repository): boolean {
    return this.path === other.path
  }
}

/**
 * RepositoryMetadata - Additional metadata about a repository
 *
 * This is separate from the Repository aggregate to keep the aggregate focused.
 */
export class RepositoryMetadata extends S.Class<RepositoryMetadata>('RepositoryMetadata')({
  repositoryId: RepositoryId,
  size: S.Number, // Repository size in bytes
  commitCount: S.Number, // Total number of commits
  branchCount: S.Number, // Total number of branches
  remoteCount: S.Number, // Total number of remotes
  lastCommitDate: S.optional(S.Date), // Date of last commit
  lastFetchDate: S.optional(S.Date), // Date of last fetch
  createdDate: S.optional(S.Date), // Date repository was created
}) {}

/**
 * RepositoryDiscoveryInfo - Information gathered during repository discovery
 */
export class RepositoryDiscoveryInfo extends S.Class<RepositoryDiscoveryInfo>(
  'RepositoryDiscoveryInfo'
)({
  path: S.String,
  gitDir: S.String,
  isValid: S.Boolean, // Is this a valid Git repository?
  isBare: S.Boolean,
  error: S.optional(S.String), // Error message if validation failed
}) {
  /**
   * Check if repository is valid and can be used
   */
  canUse(): boolean {
    return this.isValid && this.error === undefined
  }
}

/**
 * Domain errors for Repository aggregate
 */
export class RepositoryNotFoundError extends Data.TaggedError('RepositoryNotFoundError')<{
  path: string
  reason?: string
}> {}

export class InvalidRepositoryError extends Data.TaggedError('InvalidRepositoryError')<{
  path: string
  reason: string
}> {}

export class RepositoryOperationError extends Data.TaggedError('RepositoryOperationError')<{
  repositoryId: RepositoryId
  operation: string
  reason: string
  cause?: unknown
}> {}

export class RepositoryStateError extends Data.TaggedError('RepositoryStateError')<{
  repositoryId: RepositoryId
  currentState: string
  requiredState: string
  message: string
}> {}
