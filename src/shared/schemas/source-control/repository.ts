import { Schema as S } from 'effect'

/**
 * Shared schemas for Repository domain - IPC-safe versions
 *
 * These schemas are serializable and can cross the IPC boundary.
 * They mirror the domain aggregates but use primitive types.
 */

/**
 * RepositoryId - Serializable repository identifier
 */
export class RepositoryId extends S.Class<RepositoryId>('RepositoryId')({
  value: S.UUID,
}) {}

/**
 * CommitHash value object - for type safety
 */
export class CommitHash extends S.Class<CommitHash>('CommitHash')({
  value: S.String,
}) {}

/**
 * BranchName value object - for type safety
 */
export class BranchName extends S.Class<BranchName>('BranchName')({
  value: S.String,
}) {}

/**
 * RepositoryState - Serializable repository state
 */
export class RepositoryState extends S.Class<RepositoryState>('RepositoryState')({
  head: S.optional(CommitHash), // Commit hash
  branch: S.optional(BranchName), // Branch name
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
  commit: CommitHash, // Commit hash
  upstream: S.optional(BranchName), // Upstream branch name
  isCurrent: S.Boolean,
  isDetached: S.Boolean,
}) {}

/**
 * RemoteName value object - for type safety
 */
export class RemoteName extends S.Class<RemoteName>('RemoteName')({
  value: S.String,
}) {}

/**
 * RemoteUrl value object - for type safety
 */
export class RemoteUrl extends S.Class<RemoteUrl>('RemoteUrl')({
  value: S.String,
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
