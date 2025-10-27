import { Effect, Stream, Scope, Context } from 'effect'
import {
  Repository,
  RepositoryId,
  RepositoryState,
  RepositoryMetadata,
  RepositoryDiscoveryInfo,
  RepositoryNotFoundError,
  InvalidRepositoryError,
  RepositoryOperationError,
} from '../../domain/aggregates/repository'
import { AnyRepositoryEvent } from '../../domain/events/repository-events'

/**
 * RepositoryManagementPort - Primary port for repository management operations
 *
 * This port defines the core use cases for managing Git repositories:
 * - Repository discovery
 * - Repository information retrieval
 * - Repository state management
 * - Repository watching (live updates)
 *
 * This is a PRIMARY (driving) port - it's called by the UI/API layer.
 * It will be implemented by application services (RepositoryService).
 */
export interface RepositoryManagementPort {
  /**
   * Discover all Git repositories in the given paths
   *
   * Recursively scans the provided paths to find Git repositories.
   * Returns Repository aggregates for each valid repository found.
   *
   * @param searchPaths - Base paths to search for repositories
   * @returns Array of discovered repositories
   */
  discoverRepositories(
    searchPaths: string[]
  ): Effect.Effect<Repository[], RepositoryOperationError>

  /**
   * Get a specific repository by its path
   *
   * Loads repository information from the given path.
   * Creates a Repository aggregate with current state.
   *
   * @param path - Absolute path to repository root
   * @returns Repository aggregate
   */
  getRepository(path: string): Effect.Effect<Repository, RepositoryNotFoundError>

  /**
   * Get a repository by its ID
   *
   * Retrieves a previously discovered repository by its unique ID.
   *
   * @param repositoryId - Repository identifier
   * @returns Repository aggregate
   */
  getRepositoryById(
    repositoryId: RepositoryId
  ): Effect.Effect<Repository, RepositoryNotFoundError>

  /**
   * Get current repository state
   *
   * Queries Git for current HEAD, branch, and special states.
   *
   * @param repositoryId - Repository identifier
   * @returns Current repository state
   */
  getRepositoryState(
    repositoryId: RepositoryId
  ): Effect.Effect<RepositoryState, RepositoryNotFoundError | RepositoryOperationError>

  /**
   * Refresh repository information
   *
   * Re-loads repository state, branches, and remotes from Git.
   * Useful for updating cached repository data.
   *
   * @param repositoryId - Repository identifier
   * @returns Updated repository aggregate
   */
  refreshRepository(
    repositoryId: RepositoryId
  ): Effect.Effect<Repository, RepositoryNotFoundError | RepositoryOperationError>

  /**
   * Validate if a path is a valid Git repository
   *
   * Checks if the path contains a valid .git directory.
   * Does not create a Repository aggregate.
   *
   * @param path - Path to check
   * @returns Validation result with details
   */
  validateRepository(path: string): Effect.Effect<RepositoryDiscoveryInfo, never>

  /**
   * Watch a repository for changes
   *
   * Returns a stream of repository events that occur while watching.
   * Events include: state changes, branch updates, file changes, etc.
   * Stream ends when scope is closed.
   *
   * @param repositoryId - Repository identifier
   * @returns Stream of repository events
   */
  watchRepository(
    repositoryId: RepositoryId
  ): Stream.Stream<AnyRepositoryEvent, RepositoryNotFoundError, Scope.Scope>

  /**
   * Get repository metadata
   *
   * Retrieves additional metadata about a repository:
   * - Size
   * - Commit count
   * - Branch count
   * - Last commit date
   *
   * @param repositoryId - Repository identifier
   * @returns Repository metadata
   */
  getRepositoryMetadata(
    repositoryId: RepositoryId
  ): Effect.Effect<RepositoryMetadata, RepositoryNotFoundError | RepositoryOperationError>

  /**
   * Get all discovered repositories
   *
   * Returns all repositories that have been discovered and cached.
   *
   * @returns Array of all known repositories
   */
  getAllRepositories(): Effect.Effect<Repository[], never>

  /**
   * Forget a repository
   *
   * Removes a repository from the cache.
   * Does not delete any files.
   *
   * @param repositoryId - Repository identifier
   */
  forgetRepository(repositoryId: RepositoryId): Effect.Effect<void, never>

  /**
   * Check if repository has uncommitted changes
   *
   * Quick check for any staged or unstaged changes.
   * More detailed info available via WorkingTreePort.
   *
   * @param repositoryId - Repository identifier
   * @returns True if there are uncommitted changes
   */
  hasUncommittedChanges(
    repositoryId: RepositoryId
  ): Effect.Effect<boolean, RepositoryNotFoundError | RepositoryOperationError>

  /**
   * Check if repository is in a clean state
   *
   * Returns true if:
   * - No uncommitted changes
   * - Not in a merge/rebase/cherry-pick state
   * - HEAD is not detached
   *
   * @param repositoryId - Repository identifier
   * @returns True if repository is clean
   */
  isCleanState(
    repositoryId: RepositoryId
  ): Effect.Effect<boolean, RepositoryNotFoundError | RepositoryOperationError>
}

/**
 * Tag for dependency injection
 */
export const RepositoryManagementPort = Context.GenericTag<RepositoryManagementPort>(
  'RepositoryManagementPort'
)
