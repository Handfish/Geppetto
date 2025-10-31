import { Schema as S } from 'effect'

/**
 * Shared schemas for Repository domain - IPC-safe versions
 *
 * These schemas are serializable and can cross the IPC boundary.
 * Uses branded types for type safety without runtime overhead.
 */

/**
 * Branded types for type-safe primitives
 * These serialize as plain strings/UUIDs but have compile-time type safety
 */
export const RepositoryIdValue = S.UUID.pipe(S.brand('RepositoryId'))
export type RepositoryIdValue = S.Schema.Type<typeof RepositoryIdValue>

export const CommitHash = S.String.pipe(S.brand('CommitHash'))
export type CommitHash = S.Schema.Type<typeof CommitHash>

export const BranchName = S.String.pipe(S.brand('BranchName'))
export type BranchName = S.Schema.Type<typeof BranchName>

export const RemoteName = S.String.pipe(S.brand('RemoteName'))
export type RemoteName = S.Schema.Type<typeof RemoteName>

export const RemoteUrl = S.String.pipe(S.brand('RemoteUrl'))
export type RemoteUrl = S.Schema.Type<typeof RemoteUrl>

/**
 * RepositoryId - Serializable repository identifier
 */
export class RepositoryId extends S.Class<RepositoryId>('RepositoryId')({
  value: RepositoryIdValue,
}) {
  /**
   * Check if two RepositoryIds are equal
   */
  equals(other: RepositoryId): boolean {
    return this.value === other.value
  }

  /**
   * Create a RepositoryId from a UUID string
   */
  static fromUUID(uuid: string): RepositoryId {
    return new RepositoryId({ value: uuid as RepositoryIdValue })
  }
}

/**
 * RepositoryState - Serializable repository state
 */
export class RepositoryState extends S.Class<RepositoryState>('RepositoryState')({
  head: S.optional(CommitHash),
  branch: S.optional(BranchName),
  isDetached: S.Boolean,
  isMerging: S.Boolean,
  isRebasing: S.Boolean,
  isCherryPicking: S.Boolean,
  isBisecting: S.Boolean,
  isReverting: S.Boolean,
}) {}

/**
 * Branch - Serializable branch entity
 */
export class Branch extends S.Class<Branch>('Branch')({
  name: BranchName,
  type: S.Literal('local', 'remote', 'tracking'),
  commit: CommitHash,
  upstream: S.optional(BranchName),
  isCurrent: S.Boolean,
  isDetached: S.Boolean,
}) {}

/**
 * Remote - Serializable remote entity
 */
export class Remote extends S.Class<Remote>('Remote')({
  name: RemoteName,
  fetchUrl: RemoteUrl,
  pushUrl: S.optional(RemoteUrl),
}) {}

/**
 * RepositoryConfig - Serializable repository config
 */
export class RepositoryConfig extends S.Class<RepositoryConfig>('RepositoryConfig')({
  userName: S.optional(S.String),
  userEmail: S.optional(S.String),
  defaultBranch: S.optional(S.String),
}) {}

/**
 * Repository - Serializable repository aggregate
 */
export class Repository extends S.Class<Repository>('Repository')({
  id: RepositoryId,
  path: S.String,
  name: S.String,
  state: RepositoryState,
  branches: S.Array(Branch),
  remotes: S.Array(Remote),
  config: S.optional(RepositoryConfig),
  gitDir: S.String,
}) {}

/**
 * RepositoryMetadata - Serializable repository metadata
 */
export class RepositoryMetadata extends S.Class<RepositoryMetadata>('RepositoryMetadata')({
  repositoryId: RepositoryId,
  size: S.Number,
  commitCount: S.Number,
  branchCount: S.Number,
  remoteCount: S.Number,
  lastCommitDate: S.optional(S.Date),
  lastFetchDate: S.optional(S.Date),
  createdDate: S.optional(S.Date),
}) {}

/**
 * RepositoryDiscoveryInfo - Serializable discovery info
 */
export class RepositoryDiscoveryInfo extends S.Class<RepositoryDiscoveryInfo>(
  'RepositoryDiscoveryInfo'
)({
  path: S.String,
  gitDir: S.String,
  isValid: S.Boolean,
  isBare: S.Boolean,
  error: S.optional(S.String),
}) {}
