import { Effect, Stream, Scope, Context } from 'effect'
import { Data } from 'effect'

/**
 * FileEvent - Event emitted when a file or directory changes
 */
export type FileEvent = {
  readonly type: 'added' | 'changed' | 'deleted'
  readonly path: string
  readonly timestamp: Date
}

/**
 * DirectoryEntry - Entry in a directory listing
 */
export class DirectoryEntry extends Data.TaggedClass('DirectoryEntry')<{
  name: string
  path: string
  isDirectory: boolean
  isFile: boolean
  size?: number
  modifiedTime?: Date
}> {}

/**
 * FileSystemError - Base error for file system operations
 */
export class FileSystemError extends Data.TaggedError('FileSystemError')<{
  path: string
  operation: string
  reason: string
  cause?: unknown
}> {}

/**
 * FileNotFoundError - Error when file doesn't exist
 */
export class FileNotFoundError extends Data.TaggedError('FileNotFoundError')<{
  path: string
}> {}

/**
 * DirectoryNotFoundError - Error when directory doesn't exist
 */
export class DirectoryNotFoundError extends Data.TaggedError('DirectoryNotFoundError')<{
  path: string
}> {}

/**
 * PermissionDeniedError - Error when access is denied
 */
export class PermissionDeniedError extends Data.TaggedError('PermissionDeniedError')<{
  path: string
  operation: string
}> {}

/**
 * FileSystemPort - Secondary port for file system operations
 *
 * This port abstracts file system operations needed by the source control domain:
 * - Repository discovery (finding .git directories)
 * - File watching (detecting changes)
 * - Directory scanning
 * - File reading (for config files, etc.)
 *
 * Adapters:
 * - NodeFileSystemAdapter: Node.js fs module implementation
 * - Future: Virtual file system for testing
 */
export interface FileSystemPort {
  /**
   * Find all Git repositories in the given base path
   *
   * Recursively scans directories looking for .git directories.
   * Returns absolute paths to repository root (parent of .git).
   */
  findGitRepositories(
    basePath: string
  ): Effect.Effect<string[], FileSystemError | DirectoryNotFoundError>

  /**
   * Check if a path is a valid Git repository
   *
   * Returns true if path contains a .git directory or is a bare repository.
   */
  isGitRepository(path: string): Effect.Effect<boolean, FileSystemError>

  /**
   * Get the .git directory path for a repository
   *
   * For normal repos: <repo>/.git
   * For bare repos: <repo>
   * For worktrees: May point to a .git file referencing parent repo
   */
  getGitDirectory(
    repositoryPath: string
  ): Effect.Effect<string, FileSystemError | FileNotFoundError>

  /**
   * Watch a directory for changes
   *
   * Returns a stream of file events. Stream ends when scope is closed.
   * Useful for watching .git directory to detect repository changes.
   */
  watchDirectory(
    path: string
  ): Stream.Stream<FileEvent, FileSystemError, Scope.Scope>

  /**
   * Read a file as text
   */
  readFile(path: string): Effect.Effect<string, FileSystemError | FileNotFoundError>

  /**
   * Read a file as binary
   */
  readFileBytes(path: string): Effect.Effect<Uint8Array, FileSystemError | FileNotFoundError>

  /**
   * Check if file exists
   */
  fileExists(path: string): Effect.Effect<boolean, FileSystemError>

  /**
   * Check if directory exists
   */
  directoryExists(path: string): Effect.Effect<boolean, FileSystemError>

  /**
   * List entries in a directory
   */
  listDirectory(
    path: string
  ): Effect.Effect<DirectoryEntry[], FileSystemError | DirectoryNotFoundError>

  /**
   * Get file metadata
   */
  stat(
    path: string
  ): Effect.Effect<
    { size: number; isFile: boolean; isDirectory: boolean; modifiedTime: Date },
    FileSystemError | FileNotFoundError
  >

  /**
   * Resolve absolute path
   */
  resolvePath(path: string): Effect.Effect<string, never>

  /**
   * Get parent directory path
   */
  dirname(path: string): Effect.Effect<string, never>

  /**
   * Get file name from path
   */
  basename(path: string): Effect.Effect<string, never>

  /**
   * Join path components
   */
  joinPath(...components: string[]): Effect.Effect<string, never>
}

/**
 * Tag for dependency injection
 */
export const FileSystemPort = Context.GenericTag<FileSystemPort>('FileSystemPort')
