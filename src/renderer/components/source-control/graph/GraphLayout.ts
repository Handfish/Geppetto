import type {
  CommitGraph,
  CommitGraphNode,
  CommitGraphEdge,
  CommitHash,
} from '../../../../shared/schemas/source-control'
import type { GraphLayout, GraphNode, GraphEdge, GraphTheme } from './types'

/**
 * GraphLayoutEngine
 *
 * Converts backend CommitGraph (with column assignments) into visual GraphLayout
 * with calculated positions, colors, and rendering properties.
 *
 * Algorithm:
 * 1. Process each node from the backend graph
 * 2. Assign visual properties based on backend column (lane)
 * 3. Calculate x/y positions based on lane and row
 * 4. Cycle through theme colors for lane coloring
 * 5. Generate visual edges with curve information
 */
export class GraphLayoutEngine {
  constructor(private readonly theme: GraphTheme) {}

  /**
   * Transform backend CommitGraph into visual GraphLayout
   *
   * @param graph - Backend commit graph with column assignments
   * @returns Visual graph layout with positions and colors
   */
  layout(graph: CommitGraph): GraphLayout {
    const nodes = new Map<CommitHash, GraphNode>()
    const edges: GraphEdge[] = []

    // Process nodes: calculate positions and assign colors
    graph.nodes.forEach((backendNode: CommitGraphNode, index: number) => {
      const visualNode = this.createVisualNode(backendNode, index)
      nodes.set(backendNode.id, visualNode)
    })

    // Process edges: create visual edges with lane information
    graph.edges.forEach((backendEdge: CommitGraphEdge) => {
      const fromNode = nodes.get(backendEdge.from)
      const toNode = nodes.get(backendEdge.to)

      if (fromNode && toNode) {
        const visualEdge = this.createVisualEdge(
          backendEdge,
          fromNode,
          toNode
        )
        edges.push(visualEdge)
      }
    })

    // Calculate layout metadata
    const totalLanes = this.calculateTotalLanes(graph.nodes)
    const totalHeight = graph.nodes.length * this.theme.rowHeight

    return {
      nodes,
      edges,
      totalLanes,
      totalHeight,
    }
  }

  /**
   * Create a visual node from backend node
   *
   * Calculates position and assigns color based on lane
   */
  private createVisualNode(
    backendNode: CommitGraphNode,
    rowIndex: number
  ): GraphNode {
    const lane = backendNode.column

    // Calculate position
    // x: horizontal position based on lane (column)
    // Add padding to center nodes in their lanes
    const x = lane * this.theme.laneWidth + this.theme.laneWidth / 2

    // y: vertical position based on row index
    // Add padding at top and spacing between rows
    const y = rowIndex * this.theme.rowHeight + this.theme.rowHeight / 2

    // Assign color based on lane (cycle through theme colors)
    const color = this.getLaneColor(lane)

    return {
      commit: backendNode.commit,
      refs: [...backendNode.refs], // Convert readonly array to mutable array
      isHead: backendNode.isHead,
      x,
      y,
      lane,
      color,
      highlighted: false, // Initially not highlighted
    }
  }

  /**
   * Create a visual edge from backend edge
   *
   * Includes lane information for rendering curves
   */
  private createVisualEdge(
    backendEdge: CommitGraphEdge,
    fromNode: GraphNode,
    toNode: GraphNode
  ): GraphEdge {
    // Use the color of the "from" node (parent)
    const color = fromNode.color

    return {
      from: backendEdge.from,
      to: backendEdge.to,
      fromLane: fromNode.lane,
      toLane: toNode.lane,
      color,
      isMerge: backendEdge.isMerge,
    }
  }

  /**
   * Get color for a lane from the theme's color palette
   *
   * Cycles through available colors
   */
  private getLaneColor(lane: number): number {
    const colorIndex = lane % this.theme.laneColors.length
    return this.theme.laneColors[colorIndex]
  }

  /**
   * Calculate total number of lanes in the graph
   *
   * Returns the maximum column value + 1
   */
  private calculateTotalLanes(nodes: readonly CommitGraphNode[]): number {
    if (nodes.length === 0) return 0

    const maxColumn = Math.max(...nodes.map((node) => node.column))
    return maxColumn + 1
  }
}
