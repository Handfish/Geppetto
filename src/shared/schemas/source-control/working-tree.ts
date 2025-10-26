import { Schema as S } from 'effect'
import { RepositoryId } from './repository'

/**
 * Shared schemas for WorkingTree domain - IPC-safe versions
 */

/**
 * FileStatus - File status enumeration
 */
export const FileStatus = S.Literal(
  'unmodified',
  'modified',
  'added',
  'deleted',
  'renamed',
  'copied',
  'untracked',
  'ignored',
  'conflicted'
)

export type FileStatus = S.Schema.Type<typeof FileStatus>

/**
 * FileChange - Serializable file change
 */
export class FileChange extends S.Class<FileChange>('FileChange')({
  path: S.String,
  status: FileStatus,
  staged: S.Boolean,
  oldPath: S.optional(S.String),
  additions: S.optional(S.Number),
  deletions: S.optional(S.Number),
}) {}

/**
 * MergeConflict - Serializable merge conflict
 */
export class MergeConflict extends S.Class<MergeConflict>('MergeConflict')({
  path: S.String,
  ours: S.String,
  theirs: S.String,
  base: S.optional(S.String),
}) {}

/**
 * WorkingTreeStatus - Summary of working tree status
 */
export class WorkingTreeStatus extends S.Class<WorkingTreeStatus>('WorkingTreeStatus')({
  staged: S.Number,
  unstaged: S.Number,
  untracked: S.Number,
  conflicts: S.Number,
  ahead: S.Number,
  behind: S.Number,
}) {}

/**
 * WorkingTree - Serializable working tree aggregate
 */
export class WorkingTree extends S.Class<WorkingTree>('WorkingTree')({
  repositoryId: RepositoryId,
  changes: S.Array(FileChange),
  conflicts: S.Array(MergeConflict),
  status: WorkingTreeStatus,
  lastUpdated: S.Date,
}) {}

/**
 * StashEntry - Serializable stash entry
 */
export class StashEntry extends S.Class<StashEntry>('StashEntry')({
  index: S.Number,
  message: S.String,
  date: S.Date,
}) {}
