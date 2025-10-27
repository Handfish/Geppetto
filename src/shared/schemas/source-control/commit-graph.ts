import { Schema as S } from 'effect'
import { RepositoryId, CommitHash, BranchName } from './repository'

/**
 * Shared schemas for CommitGraph domain - IPC-safe versions
 * Uses branded types for type safety
 */

/**
 * GitAuthor - Serializable author information
 */
export class GitAuthor extends S.Class<GitAuthor>('GitAuthor')({
  name: S.String,
  email: S.String,
  timestamp: S.Date,
}) {}

/**
 * Commit - Serializable commit entity
 */
export class Commit extends S.Class<Commit>('Commit')({
  hash: CommitHash,
  parents: S.Array(CommitHash),
  author: GitAuthor,
  committer: GitAuthor,
  message: S.String,
  subject: S.String,
  body: S.optional(S.String),
  tree: S.String,
}) {}

/**
 * CommitWithRefs - Commit with reference information
 */
export class CommitWithRefs extends S.Class<CommitWithRefs>('CommitWithRefs')({
  commit: Commit,
  branches: S.Array(BranchName),
  tags: S.Array(S.String), // Keep tags as plain strings for now
  isHead: S.Boolean,
}) {}

/**
 * GraphLayoutPosition - Position in graph layout
 */
export class GraphLayoutPosition extends S.Class<GraphLayoutPosition>('GraphLayoutPosition')({
  x: S.Number,
  y: S.Number,
}) {}

/**
 * CommitGraphNode - Node in the commit graph
 */
export class CommitGraphNode extends S.Class<CommitGraphNode>('CommitGraphNode')({
  id: CommitHash,
  commit: Commit,
  refs: S.Array(S.String),
  isHead: S.Boolean,
  position: S.optional(GraphLayoutPosition),
  column: S.Number,
}) {}

/**
 * CommitGraphEdge - Edge in the commit graph
 */
export class CommitGraphEdge extends S.Class<CommitGraphEdge>('CommitGraphEdge')({
  from: CommitHash, // Parent commit hash
  to: CommitHash, // Child commit hash
  isMerge: S.Boolean,
  column: S.Number,
}) {}

/**
 * GraphOptions - Options for building commit graph
 */
export class GraphOptions extends S.Class<GraphOptions>('GraphOptions')({
  maxCommits: S.Number.pipe(S.int(), S.positive()),
  includeBranches: S.optional(S.Array(BranchName)),
  excludeBranches: S.optional(S.Array(BranchName)),
  since: S.optional(S.Date),
  until: S.optional(S.Date),
  author: S.optional(S.String),
  layoutAlgorithm: S.Literal('topological', 'lane-based', 'sugiyama'),
}) {}

/**
 * CommitGraph - Serializable commit graph aggregate
 */
export class CommitGraph extends S.Class<CommitGraph>('CommitGraph')({
  repositoryId: RepositoryId,
  nodes: S.Array(CommitGraphNode),
  edges: S.Array(CommitGraphEdge),
  options: GraphOptions,
  buildTime: S.Date,
  latestCommit: S.optional(S.String),
  oldestCommit: S.optional(S.String),
  totalCommits: S.Number,
  totalBranches: S.Number,
}) {}

/**
 * GraphStatistics - Statistics about a commit graph
 */
export class GraphStatistics extends S.Class<GraphStatistics>('GraphStatistics')({
  totalNodes: S.Number,
  totalEdges: S.Number,
  mergeCommits: S.Number,
  leafCommits: S.Number,
  columns: S.Number,
  buildTime: S.Date,
}) {}

/**
 * GraphUpdateResult - Result of graph update
 */
export class GraphUpdateResult extends S.Class<GraphUpdateResult>('GraphUpdateResult')({
  graph: CommitGraph,
  addedNodes: S.Number,
  addedEdges: S.Number,
  removedNodes: S.Number,
  removedEdges: S.Number,
}) {}
