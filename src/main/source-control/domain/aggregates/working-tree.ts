import { Schema as S } from 'effect'
import { Data } from 'effect'
import { FileStatus, FileStatusCode } from '../value-objects/file-status'
import { RepositoryId } from './repository'

/**
 * FilePath - Value object for file paths
 */
export class FilePath extends S.Class<FilePath>('FilePath')({
  value: S.String.pipe(
    S.nonEmptyString(),
    S.annotations({
      description: 'Relative path from repository root',
    })
  ),
}) {
  /**
   * Get file name (last component of path)
   */
  getFileName(): string {
    const parts = this.value.split('/')
    return parts[parts.length - 1]
  }

  /**
   * Get directory path (all but last component)
   */
  getDirectory(): string {
    const parts = this.value.split('/')
    if (parts.length === 1) return ''
    return parts.slice(0, -1).join('/')
  }

  /**
   * Get file extension
   */
  getExtension(): string | undefined {
    const fileName = this.getFileName()
    const lastDot = fileName.lastIndexOf('.')
    if (lastDot === -1 || lastDot === 0) return undefined
    return fileName.slice(lastDot + 1)
  }

  /**
   * Check if this is a directory path (ends with /)
   */
  isDirectory(): boolean {
    return this.value.endsWith('/')
  }

  /**
   * Compare file paths for equality
   */
  equals(other: FilePath): boolean {
    return this.value === other.value
  }
}

/**
 * FileChange - Represents a change to a file in the working tree
 *
 * Tracks both staged and unstaged changes to a file.
 */
export class FileChange extends S.Class<FileChange>('FileChange')({
  path: FilePath,
  status: FileStatus,
  statusCode: FileStatusCode,
  staged: S.Boolean, // Is this change staged?
  oldPath: S.optional(FilePath), // For renamed files
  additions: S.optional(S.Number), // Lines added
  deletions: S.optional(S.Number), // Lines deleted
}) {
  /**
   * Check if file is untracked
   */
  isUntracked(): boolean {
    return this.status === 'untracked'
  }

  /**
   * Check if file is modified
   */
  isModified(): boolean {
    return this.status === 'modified'
  }

  /**
   * Check if file is added
   */
  isAdded(): boolean {
    return this.status === 'added'
  }

  /**
   * Check if file is deleted
   */
  isDeleted(): boolean {
    return this.status === 'deleted'
  }

  /**
   * Check if file is renamed
   */
  isRenamed(): boolean {
    return this.status === 'renamed'
  }

  /**
   * Check if file has conflicts
   */
  hasConflicts(): boolean {
    return this.status === 'conflicted'
  }

  /**
   * Check if file is ignored
   */
  isIgnored(): boolean {
    return this.status === 'ignored'
  }

  /**
   * Get human-readable status description
   */
  getStatusDescription(): string {
    if (this.isRenamed() && this.oldPath) {
      return `Renamed from ${this.oldPath.value}`
    }
    return this.statusCode.getDescription()
  }

  /**
   * Get total changes (additions + deletions)
   */
  getTotalChanges(): number {
    const add = this.additions ?? 0
    const del = this.deletions ?? 0
    return add + del
  }
}

/**
 * ConflictMarker - Represents a merge conflict marker in a file
 */
export class ConflictMarker extends S.Class<ConflictMarker>('ConflictMarker')({
  path: FilePath,
  lineNumber: S.Number,
  type: S.Literal('ours', 'theirs', 'base'),
  content: S.String,
}) {}

/**
 * MergeConflict - Represents a merge conflict in a file
 */
export class MergeConflict extends S.Class<MergeConflict>('MergeConflict')({
  path: FilePath,
  ours: S.String, // Our version
  theirs: S.String, // Their version
  base: S.optional(S.String), // Common ancestor version
  markers: S.Array(ConflictMarker),
}) {
  /**
   * Check if conflict has base version (3-way merge)
   */
  isThreeWayMerge(): boolean {
    return this.base !== undefined
  }

  /**
   * Get number of conflict markers
   */
  getConflictCount(): number {
    return this.markers.length
  }
}

/**
 * WorkingTreeStatus - Status of the working tree
 *
 * Provides a summary of changes in the working tree.
 */
export class WorkingTreeStatus extends S.Class<WorkingTreeStatus>('WorkingTreeStatus')({
  staged: S.Number, // Number of staged changes
  unstaged: S.Number, // Number of unstaged changes
  untracked: S.Number, // Number of untracked files
  conflicts: S.Number, // Number of conflicted files
  ahead: S.Number, // Commits ahead of upstream
  behind: S.Number, // Commits behind upstream
}) {
  /**
   * Check if working tree is clean (no changes)
   */
  isClean(): boolean {
    return (
      this.staged === 0 &&
      this.unstaged === 0 &&
      this.untracked === 0 &&
      this.conflicts === 0
    )
  }

  /**
   * Check if there are changes to commit
   */
  hasChangesToCommit(): boolean {
    return this.staged > 0
  }

  /**
   * Check if there are unstaged changes
   */
  hasUnstagedChanges(): boolean {
    return this.unstaged > 0
  }

  /**
   * Check if there are untracked files
   */
  hasUntrackedFiles(): boolean {
    return this.untracked > 0
  }

  /**
   * Check if there are conflicts
   */
  hasConflicts(): boolean {
    return this.conflicts > 0
  }

  /**
   * Check if branch is in sync with upstream
   */
  isInSync(): boolean {
    return this.ahead === 0 && this.behind === 0
  }

  /**
   * Get total number of changes
   */
  getTotalChanges(): number {
    return this.staged + this.unstaged + this.untracked
  }

  /**
   * Get status summary string
   */
  getSummary(): string {
    if (this.isClean() && this.isInSync()) {
      return 'Working tree clean, up to date'
    }

    const parts: string[] = []

    if (this.staged > 0) {
      parts.push(`${this.staged} staged`)
    }
    if (this.unstaged > 0) {
      parts.push(`${this.unstaged} unstaged`)
    }
    if (this.untracked > 0) {
      parts.push(`${this.untracked} untracked`)
    }
    if (this.conflicts > 0) {
      parts.push(`${this.conflicts} conflicts`)
    }
    if (this.ahead > 0) {
      parts.push(`${this.ahead} ahead`)
    }
    if (this.behind > 0) {
      parts.push(`${this.behind} behind`)
    }

    return parts.join(', ')
  }
}

/**
 * WorkingTree - Aggregate root for working tree state
 *
 * The working tree represents the current state of files in the repository:
 * - Staged changes (in index)
 * - Unstaged changes (in working directory)
 * - Untracked files
 * - Conflicts (during merge/rebase)
 *
 * Domain invariants:
 * - File paths must be relative to repository root
 * - Staged and unstaged changes are mutually exclusive for a path
 * - Conflicted files cannot be committed until resolved
 *
 * This aggregate is separate from Repository because:
 * - Working tree state changes frequently
 * - Querying status is expensive (git status command)
 * - Working tree can be cached independently
 */
export class WorkingTree extends S.Class<WorkingTree>('WorkingTree')({
  repositoryId: RepositoryId,
  changes: S.Array(FileChange),
  conflicts: S.Array(MergeConflict),
  status: WorkingTreeStatus,
  lastUpdated: S.Date,
}) {
  /**
   * Get all staged changes
   */
  getStagedChanges(): FileChange[] {
    return this.changes.filter((c) => c.staged)
  }

  /**
   * Get all unstaged changes
   */
  getUnstagedChanges(): FileChange[] {
    return this.changes.filter((c) => !c.staged && !c.isUntracked())
  }

  /**
   * Get all untracked files
   */
  getUntrackedFiles(): FileChange[] {
    return this.changes.filter((c) => c.isUntracked())
  }

  /**
   * Get all conflicted files
   */
  getConflictedFiles(): FileChange[] {
    return this.changes.filter((c) => c.hasConflicts())
  }

  /**
   * Find a change by file path
   */
  findChange(path: FilePath): FileChange | undefined {
    return this.changes.find((c) => c.path.equals(path))
  }

  /**
   * Find a conflict by file path
   */
  findConflict(path: FilePath): MergeConflict | undefined {
    return this.conflicts.find((c) => c.path.equals(path))
  }

  /**
   * Check if working tree is clean
   */
  isClean(): boolean {
    return this.status.isClean()
  }

  /**
   * Check if there are changes ready to commit
   */
  canCommit(): boolean {
    return this.status.hasChangesToCommit() && !this.status.hasConflicts()
  }

  /**
   * Check if all changes are staged
   */
  areAllChangesStaged(): boolean {
    return (
      this.status.unstaged === 0 &&
      this.status.untracked === 0 &&
      this.status.staged > 0
    )
  }

  /**
   * Get changes grouped by status
   */
  getChangesByStatus(): Record<FileStatus, FileChange[]> {
    const groups: Record<FileStatus, FileChange[]> = {
      unmodified: [],
      modified: [],
      added: [],
      deleted: [],
      renamed: [],
      copied: [],
      untracked: [],
      ignored: [],
      conflicted: [],
    }

    for (const change of this.changes) {
      groups[change.status].push(change)
    }

    return groups
  }

  /**
   * Get changes in a specific directory
   */
  getChangesInDirectory(directory: string): FileChange[] {
    return this.changes.filter((c) => c.path.getDirectory() === directory)
  }

  /**
   * Get total lines changed (additions + deletions)
   */
  getTotalLinesChanged(): { additions: number; deletions: number } {
    let additions = 0
    let deletions = 0

    for (const change of this.changes) {
      additions += change.additions ?? 0
      deletions += change.deletions ?? 0
    }

    return { additions, deletions }
  }

  /**
   * Check if working tree is stale (needs refresh)
   */
  isStale(maxAgeMs: number): boolean {
    const age = Date.now() - this.lastUpdated.getTime()
    return age > maxAgeMs
  }
}

/**
 * Domain errors for WorkingTree aggregate
 */
export class WorkingTreeError extends Data.TaggedError('WorkingTreeError')<{
  repositoryId: RepositoryId
  reason: string
  cause?: unknown
}> {}

export class ConflictResolutionError extends Data.TaggedError('ConflictResolutionError')<{
  path: FilePath
  reason: string
}> {}

export class StagingError extends Data.TaggedError('StagingError')<{
  path: FilePath
  operation: 'stage' | 'unstage'
  reason: string
}> {}
