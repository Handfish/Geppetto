import { Data } from 'effect'
import { RepositoryId, RepositoryState } from '../aggregates/repository'
import { BranchName } from '../value-objects/branch-name'
import { CommitHash } from '../value-objects/commit-hash'
import { FilePath } from '../aggregates/working-tree'
import { Branch } from '../entities/branch'
import { Remote } from '../entities/remote'

/**
 * Base interface for all repository domain events
 */
export interface RepositoryEvent {
  readonly repositoryId: RepositoryId
  readonly timestamp: Date
}

/**
 * RepositoryDiscovered - Emitted when a new repository is discovered
 *
 * This event is raised during repository discovery scans.
 */
export class RepositoryDiscovered
  extends Data.TaggedClass('RepositoryDiscovered')<{
    repositoryId: RepositoryId
    path: string
    name: string
    timestamp: Date
  }>
  implements RepositoryEvent {}

/**
 * RepositoryStateChanged - Emitted when repository state changes
 *
 * This includes changes to HEAD, detached state, or special states
 * (merging, rebasing, cherry-picking, etc.)
 */
export class RepositoryStateChanged
  extends Data.TaggedClass('RepositoryStateChanged')<{
    repositoryId: RepositoryId
    previousState: RepositoryState
    newState: RepositoryState
    timestamp: Date
  }>
  implements RepositoryEvent {}

/**
 * RepositoryHeadChanged - Emitted when HEAD moves to a different commit
 */
export class RepositoryHeadChanged
  extends Data.TaggedClass('RepositoryHeadChanged')<{
    repositoryId: RepositoryId
    previousHead: CommitHash | undefined
    newHead: CommitHash
    timestamp: Date
  }>
  implements RepositoryEvent {}

/**
 * RepositoryBranchChanged - Emitted when current branch changes
 */
export class RepositoryBranchChanged
  extends Data.TaggedClass('RepositoryBranchChanged')<{
    repositoryId: RepositoryId
    previousBranch: BranchName | undefined
    newBranch: BranchName
    timestamp: Date
  }>
  implements RepositoryEvent {}

/**
 * BranchCreated - Emitted when a new branch is created
 */
export class BranchCreated
  extends Data.TaggedClass('BranchCreated')<{
    repositoryId: RepositoryId
    branch: Branch
    timestamp: Date
  }>
  implements RepositoryEvent {}

/**
 * BranchDeleted - Emitted when a branch is deleted
 */
export class BranchDeleted
  extends Data.TaggedClass('BranchDeleted')<{
    repositoryId: RepositoryId
    branchName: BranchName
    lastCommit: CommitHash
    timestamp: Date
  }>
  implements RepositoryEvent {}

/**
 * BranchRenamed - Emitted when a branch is renamed
 */
export class BranchRenamed
  extends Data.TaggedClass('BranchRenamed')<{
    repositoryId: RepositoryId
    oldName: BranchName
    newName: BranchName
    timestamp: Date
  }>
  implements RepositoryEvent {}

/**
 * BranchUpdated - Emitted when a branch moves to a different commit
 */
export class BranchUpdated
  extends Data.TaggedClass('BranchUpdated')<{
    repositoryId: RepositoryId
    branchName: BranchName
    previousCommit: CommitHash
    newCommit: CommitHash
    timestamp: Date
  }>
  implements RepositoryEvent {}

/**
 * CommitCreated - Emitted when a new commit is created
 */
export class CommitCreated
  extends Data.TaggedClass('CommitCreated')<{
    repositoryId: RepositoryId
    commitHash: CommitHash
    branchName: BranchName | undefined
    message: string
    author: string
    timestamp: Date
  }>
  implements RepositoryEvent {}

/**
 * BranchMerged - Emitted when branches are merged
 */
export class BranchMerged
  extends Data.TaggedClass('BranchMerged')<{
    repositoryId: RepositoryId
    sourceBranch: BranchName
    targetBranch: BranchName
    mergeCommit: CommitHash
    timestamp: Date
  }>
  implements RepositoryEvent {}

/**
 * BranchRebased - Emitted when a branch is rebased
 */
export class BranchRebased
  extends Data.TaggedClass('BranchRebased')<{
    repositoryId: RepositoryId
    branchName: BranchName
    oldBase: CommitHash
    newBase: CommitHash
    timestamp: Date
  }>
  implements RepositoryEvent {}

/**
 * RemoteAdded - Emitted when a remote is added
 */
export class RemoteAdded
  extends Data.TaggedClass('RemoteAdded')<{
    repositoryId: RepositoryId
    remote: Remote
    timestamp: Date
  }>
  implements RepositoryEvent {}

/**
 * RemoteRemoved - Emitted when a remote is removed
 */
export class RemoteRemoved
  extends Data.TaggedClass('RemoteRemoved')<{
    repositoryId: RepositoryId
    remoteName: string
    timestamp: Date
  }>
  implements RepositoryEvent {}

/**
 * RemoteUpdated - Emitted when a remote's URL or refspecs change
 */
export class RemoteUpdated
  extends Data.TaggedClass('RemoteUpdated')<{
    repositoryId: RepositoryId
    remoteName: string
    previousRemote: Remote
    newRemote: Remote
    timestamp: Date
  }>
  implements RepositoryEvent {}

/**
 * RemoteFetched - Emitted when remote refs are fetched
 */
export class RemoteFetched
  extends Data.TaggedClass('RemoteFetched')<{
    repositoryId: RepositoryId
    remoteName: string
    fetchedRefs: string[]
    timestamp: Date
  }>
  implements RepositoryEvent {}

/**
 * RemotePushed - Emitted when refs are pushed to remote
 */
export class RemotePushed
  extends Data.TaggedClass('RemotePushed')<{
    repositoryId: RepositoryId
    remoteName: string
    pushedRefs: string[]
    timestamp: Date
  }>
  implements RepositoryEvent {}

/**
 * WorkingTreeChanged - Emitted when files in working tree change
 */
export class WorkingTreeChanged
  extends Data.TaggedClass('WorkingTreeChanged')<{
    repositoryId: RepositoryId
    changedFiles: FilePath[]
    timestamp: Date
  }>
  implements RepositoryEvent {}

/**
 * FilesStaged - Emitted when files are staged
 */
export class FilesStaged
  extends Data.TaggedClass('FilesStaged')<{
    repositoryId: RepositoryId
    stagedFiles: FilePath[]
    timestamp: Date
  }>
  implements RepositoryEvent {}

/**
 * FilesUnstaged - Emitted when files are unstaged
 */
export class FilesUnstaged
  extends Data.TaggedClass('FilesUnstaged')<{
    repositoryId: RepositoryId
    unstagedFiles: FilePath[]
    timestamp: Date
  }>
  implements RepositoryEvent {}

/**
 * ConflictDetected - Emitted when merge conflicts are detected
 */
export class ConflictDetected
  extends Data.TaggedClass('ConflictDetected')<{
    repositoryId: RepositoryId
    conflictedFiles: FilePath[]
    operation: 'merge' | 'rebase' | 'cherry-pick'
    timestamp: Date
  }>
  implements RepositoryEvent {}

/**
 * ConflictResolved - Emitted when a conflict is resolved
 */
export class ConflictResolved
  extends Data.TaggedClass('ConflictResolved')<{
    repositoryId: RepositoryId
    resolvedFile: FilePath
    resolution: 'ours' | 'theirs' | 'manual'
    timestamp: Date
  }>
  implements RepositoryEvent {}

/**
 * StashCreated - Emitted when changes are stashed
 */
export class StashCreated
  extends Data.TaggedClass('StashCreated')<{
    repositoryId: RepositoryId
    stashMessage: string
    timestamp: Date
  }>
  implements RepositoryEvent {}

/**
 * StashApplied - Emitted when a stash is applied
 */
export class StashApplied
  extends Data.TaggedClass('StashApplied')<{
    repositoryId: RepositoryId
    stashIndex: number
    timestamp: Date
  }>
  implements RepositoryEvent {}

/**
 * StashDropped - Emitted when a stash is dropped
 */
export class StashDropped
  extends Data.TaggedClass('StashDropped')<{
    repositoryId: RepositoryId
    stashIndex: number
    timestamp: Date
  }>
  implements RepositoryEvent {}

/**
 * TagCreated - Emitted when a tag is created
 */
export class TagCreated
  extends Data.TaggedClass('TagCreated')<{
    repositoryId: RepositoryId
    tagName: string
    commit: CommitHash
    isAnnotated: boolean
    timestamp: Date
  }>
  implements RepositoryEvent {}

/**
 * TagDeleted - Emitted when a tag is deleted
 */
export class TagDeleted
  extends Data.TaggedClass('TagDeleted')<{
    repositoryId: RepositoryId
    tagName: string
    timestamp: Date
  }>
  implements RepositoryEvent {}

/**
 * RepositoryRefreshed - Emitted when repository is refreshed
 */
export class RepositoryRefreshed
  extends Data.TaggedClass('RepositoryRefreshed')<{
    repositoryId: RepositoryId
    timestamp: Date
  }>
  implements RepositoryEvent {}

/**
 * Union type of all repository events
 */
export type AnyRepositoryEvent =
  | RepositoryDiscovered
  | RepositoryStateChanged
  | RepositoryHeadChanged
  | RepositoryBranchChanged
  | BranchCreated
  | BranchDeleted
  | BranchRenamed
  | BranchUpdated
  | CommitCreated
  | BranchMerged
  | BranchRebased
  | RemoteAdded
  | RemoteRemoved
  | RemoteUpdated
  | RemoteFetched
  | RemotePushed
  | WorkingTreeChanged
  | FilesStaged
  | FilesUnstaged
  | ConflictDetected
  | ConflictResolved
  | StashCreated
  | StashApplied
  | StashDropped
  | TagCreated
  | TagDeleted
  | RepositoryRefreshed
