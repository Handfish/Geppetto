import { Schema as S } from 'effect'
import { Data } from 'effect'
import { CommitHash } from '../value-objects/commit-hash'
import { BranchName } from '../value-objects/branch-name'
import { Commit, CommitWithRefs } from '../entities/commit'
import { RepositoryId } from './repository'

/**
 * CommitGraphNodeId - Unique identifier for a node in the commit graph
 */
export class CommitGraphNodeId extends S.Class<CommitGraphNodeId>('CommitGraphNodeId')({
  value: S.String, // Typically the commit hash
}) {
  equals(other: CommitGraphNodeId): boolean {
    return this.value === other.value
  }

  static fromCommitHash(hash: CommitHash): CommitGraphNodeId {
    return new CommitGraphNodeId({ value: hash.value })
  }
}

/**
 * GraphLayoutPosition - 2D position in the graph layout
 */
export class GraphLayoutPosition extends S.Class<GraphLayoutPosition>('GraphLayoutPosition')({
  x: S.Number, // Horizontal position (column)
  y: S.Number, // Vertical position (row)
}) {}

/**
 * CommitGraphNode - Node in the commit graph
 *
 * Represents a commit with layout information for visualization.
 */
export class CommitGraphNode extends S.Class<CommitGraphNode>('CommitGraphNode')({
  id: CommitGraphNodeId,
  commit: Commit,
  refs: S.Array(S.String), // Branch/tag names pointing to this commit
  isHead: S.Boolean, // Is this the current HEAD?
  position: S.optional(GraphLayoutPosition), // Layout position for rendering
  column: S.Number, // Column in the graph (for lane assignment)
}) {
  /**
   * Check if this node has any refs
   */
  hasRefs(): boolean {
    return this.refs.length > 0 || this.isHead
  }

  /**
   * Get all ref labels including HEAD
   */
  getRefLabels(): string[] {
    const labels = [...this.refs]
    if (this.isHead) {
      labels.unshift('HEAD')
    }
    return labels
  }

  /**
   * Check if this node is a merge commit
   */
  isMerge(): boolean {
    return this.commit.isMergeCommit()
  }

  /**
   * Check if this node is the initial commit
   */
  isInitial(): boolean {
    return this.commit.isInitialCommit()
  }
}

/**
 * CommitGraphEdge - Edge connecting two nodes in the commit graph
 *
 * Represents a parent-child relationship between commits.
 */
export class CommitGraphEdge extends S.Class<CommitGraphEdge>('CommitGraphEdge')({
  from: CommitGraphNodeId, // Parent commit
  to: CommitGraphNodeId, // Child commit
  isMerge: S.Boolean, // Is this edge part of a merge?
  column: S.Number, // Column for rendering the edge
}) {}

/**
 * GraphLayoutAlgorithm - Algorithm used for graph layout
 */
export const GraphLayoutAlgorithm = S.Literal(
  'topological', // Simple topological sort
  'lane-based', // Lane-based layout (like git log --graph)
  'sugiyama' // Sugiyama hierarchical layout
).annotations({
  title: 'Graph Layout Algorithm',
  description: 'Algorithm for computing commit graph layout',
})

export type GraphLayoutAlgorithm = S.Schema.Type<typeof GraphLayoutAlgorithm>

/**
 * GraphOptions - Options for building commit graph
 */
export class GraphOptions extends S.Class<GraphOptions>('GraphOptions')({
  maxCommits: S.Number.pipe(
    S.int(),
    S.positive(),
    S.annotations({
      description: 'Maximum number of commits to include in graph',
    })
  ),
  includeBranches: S.optional(S.Array(BranchName)), // Specific branches to include
  excludeBranches: S.optional(S.Array(BranchName)), // Branches to exclude
  since: S.optional(S.Date), // Only commits after this date
  until: S.optional(S.Date), // Only commits before this date
  author: S.optional(S.String), // Filter by author
  layoutAlgorithm: GraphLayoutAlgorithm,
}) {
  /**
   * Get default options for graph building
   */
  static default(): GraphOptions {
    return new GraphOptions({
      maxCommits: 1000,
      layoutAlgorithm: 'lane-based',
    })
  }

  /**
   * Create options for recent commits
   */
  static recent(count: number): GraphOptions {
    return new GraphOptions({
      maxCommits: count,
      layoutAlgorithm: 'lane-based',
    })
  }

  /**
   * Create options for a specific branch
   */
  static forBranch(branch: BranchName, maxCommits: number = 1000): GraphOptions {
    return new GraphOptions({
      maxCommits,
      includeBranches: [branch],
      layoutAlgorithm: 'lane-based',
    })
  }
}

/**
 * CommitGraph - Aggregate root for commit graph
 *
 * A commit graph is a directed acyclic graph (DAG) of commits.
 * It contains:
 * - Nodes: Commits with layout information
 * - Edges: Parent-child relationships
 * - Metadata: Graph statistics and build info
 *
 * Domain invariants:
 * - Graph must be acyclic (DAG)
 * - All edge endpoints must reference existing nodes
 * - At most one node can be marked as HEAD
 * - Node IDs must be unique
 *
 * This aggregate is separate from Repository because:
 * - Graph building is computationally expensive
 * - Graph is often cached separately
 * - Graph can be rebuilt from Repository + Commits
 */
export class CommitGraph extends S.Class<CommitGraph>('CommitGraph')({
  repositoryId: RepositoryId,
  nodes: S.Array(CommitGraphNode),
  edges: S.Array(CommitGraphEdge),
  options: GraphOptions,
  buildTime: S.Date, // When this graph was built
  latestCommit: S.optional(CommitHash), // Most recent commit in graph
  oldestCommit: S.optional(CommitHash), // Oldest commit in graph
  totalCommits: S.Number, // Total commits in graph
  totalBranches: S.Number, // Total branches represented
}) {
  /**
   * Get a node by ID
   */
  getNode(id: CommitGraphNodeId): CommitGraphNode | undefined {
    return this.nodes.find((n) => n.id.equals(id))
  }

  /**
   * Get a node by commit hash
   */
  getNodeByHash(hash: CommitHash): CommitGraphNode | undefined {
    return this.nodes.find((n) => n.commit.hash.equals(hash))
  }

  /**
   * Get the HEAD node
   */
  getHeadNode(): CommitGraphNode | undefined {
    return this.nodes.find((n) => n.isHead)
  }

  /**
   * Get all nodes with refs (branches/tags)
   */
  getNodesWithRefs(): CommitGraphNode[] {
    return this.nodes.filter((n) => n.hasRefs())
  }

  /**
   * Get child nodes of a commit (commits that have this commit as parent)
   */
  getChildren(nodeId: CommitGraphNodeId): CommitGraphNode[] {
    const childEdges = this.edges.filter((e) => e.from.equals(nodeId))
    return childEdges
      .map((e) => this.getNode(e.to))
      .filter((n): n is CommitGraphNode => n !== undefined)
  }

  /**
   * Get parent nodes of a commit
   */
  getParents(nodeId: CommitGraphNodeId): CommitGraphNode[] {
    const parentEdges = this.edges.filter((e) => e.to.equals(nodeId))
    return parentEdges
      .map((e) => this.getNode(e.from))
      .filter((n): n is CommitGraphNode => n !== undefined)
  }

  /**
   * Get all merge commits in the graph
   */
  getMergeCommits(): CommitGraphNode[] {
    return this.nodes.filter((n) => n.isMerge())
  }

  /**
   * Get the initial commit (no parents)
   */
  getInitialCommit(): CommitGraphNode | undefined {
    return this.nodes.find((n) => n.isInitial())
  }

  /**
   * Get all leaf commits (no children)
   */
  getLeafCommits(): CommitGraphNode[] {
    const nodesWithChildren = new Set(this.edges.map((e) => e.from.value))
    return this.nodes.filter((n) => !nodesWithChildren.has(n.id.value))
  }

  /**
   * Get commits in topological order (parents before children)
   */
  getTopologicalOrder(): CommitGraphNode[] {
    // For simplicity, return nodes sorted by commit date
    // A proper implementation would do a topological sort
    return [...this.nodes].sort((a, b) => {
      return b.commit.author.timestamp.getTime() - a.commit.author.timestamp.getTime()
    })
  }

  /**
   * Get commits in a specific column (lane)
   */
  getCommitsInColumn(column: number): CommitGraphNode[] {
    return this.nodes.filter((n) => n.column === column)
  }

  /**
   * Get the number of columns (lanes) in the graph
   */
  getColumnCount(): number {
    if (this.nodes.length === 0) return 0
    return Math.max(...this.nodes.map((n) => n.column)) + 1
  }

  /**
   * Check if graph is empty
   */
  isEmpty(): boolean {
    return this.nodes.length === 0
  }

  /**
   * Get graph statistics
   */
  getStatistics(): GraphStatistics {
    return new GraphStatistics({
      totalNodes: this.nodes.length,
      totalEdges: this.edges.length,
      mergeCommits: this.getMergeCommits().length,
      leafCommits: this.getLeafCommits().length,
      columns: this.getColumnCount(),
      buildTime: this.buildTime,
    })
  }

  /**
   * Check if this graph needs refresh based on age
   */
  needsRefresh(maxAgeMs: number): boolean {
    const age = Date.now() - this.buildTime.getTime()
    return age > maxAgeMs
  }
}

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
}) {
  /**
   * Get average degree (edges per node)
   */
  getAverageDegree(): number {
    if (this.totalNodes === 0) return 0
    return this.totalEdges / this.totalNodes
  }

  /**
   * Get merge commit percentage
   */
  getMergePercentage(): number {
    if (this.totalNodes === 0) return 0
    return (this.mergeCommits / this.totalNodes) * 100
  }
}

/**
 * GraphUpdateResult - Result of incremental graph update
 */
export class GraphUpdateResult extends S.Class<GraphUpdateResult>('GraphUpdateResult')({
  graph: CommitGraph,
  addedNodes: S.Number,
  addedEdges: S.Number,
  removedNodes: S.Number,
  removedEdges: S.Number,
}) {
  /**
   * Check if graph was modified
   */
  hasChanges(): boolean {
    return this.addedNodes > 0 || this.addedEdges > 0 || this.removedNodes > 0 || this.removedEdges > 0
  }

  /**
   * Get summary of changes
   */
  getSummary(): string {
    const parts: string[] = []
    if (this.addedNodes > 0) parts.push(`+${this.addedNodes} nodes`)
    if (this.removedNodes > 0) parts.push(`-${this.removedNodes} nodes`)
    if (this.addedEdges > 0) parts.push(`+${this.addedEdges} edges`)
    if (this.removedEdges > 0) parts.push(`-${this.removedEdges} edges`)
    return parts.length > 0 ? parts.join(', ') : 'No changes'
  }
}

/**
 * Domain errors for CommitGraph aggregate
 */
export class GraphBuildError extends Data.TaggedError('GraphBuildError')<{
  repositoryId: RepositoryId
  reason: string
  cause?: unknown
}> {}

export class GraphUpdateError extends Data.TaggedError('GraphUpdateError')<{
  repositoryId: RepositoryId
  reason: string
  cause?: unknown
}> {}

export class InvalidGraphError extends Data.TaggedError('InvalidGraphError')<{
  reason: string
  nodeId?: CommitGraphNodeId
}> {}
