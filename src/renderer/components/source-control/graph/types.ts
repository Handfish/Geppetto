import type { Commit, CommitHash } from '../../../../shared/schemas/source-control'

/**
 * Graph rendering types for PixiJS visual commit graph
 *
 * These types extend the backend CommitGraphNode and CommitGraphEdge
 * with visual properties for rendering.
 */

/**
 * GraphNode - Visual representation of a commit in the graph
 *
 * Extends backend CommitGraphNode with visual layout properties
 */
export interface GraphNode {
  // Data from backend
  commit: Commit
  refs: string[] // Branch and tag names
  isHead: boolean

  // Layout coordinates (calculated by GraphLayoutEngine)
  x: number // Horizontal position in pixels
  y: number // Vertical position in pixels
  lane: number // Which lane (column) this commit is in

  // Visual properties (for rendering)
  color: number // PixiJS hex color (e.g., 0x3b82f6)
  highlighted: boolean // Whether to show highlight ring
}

/**
 * GraphEdge - Visual representation of a parent-child connection
 *
 * Connects two commits in the graph
 */
export interface GraphEdge {
  // Commit identifiers
  from: CommitHash // Parent commit hash
  to: CommitHash // Child commit hash

  // Lane information (for rendering curves)
  fromLane: number // Lane of parent commit
  toLane: number // Lane of child commit

  // Visual properties
  color: number // PixiJS hex color for the line
  isMerge: boolean // Whether this edge represents a merge (draw thicker)
}

/**
 * GraphLayout - Complete visual layout of the commit graph
 *
 * Contains all nodes and edges with calculated positions
 */
export interface GraphLayout {
  // Nodes mapped by commit hash for fast lookup
  nodes: Map<CommitHash, GraphNode>

  // All edges in the graph
  edges: GraphEdge[]

  // Layout metadata
  totalLanes: number // Number of lanes (columns) in the graph
  totalHeight: number // Total height of the graph in pixels
}

/**
 * GraphTheme - Visual styling configuration
 *
 * Defines colors, dimensions, and typography for the graph
 * IMPORTANT: All colors must be hex numbers (0xRRGGBB) for PixiJS
 */
export interface GraphTheme {
  // Node dimensions
  nodeRadius: number // Radius of commit circles in pixels
  commitSpacing: number // Vertical spacing between commits

  // Lane dimensions
  laneWidth: number // Horizontal width of each lane in pixels
  rowHeight: number // Vertical height of each row in pixels

  // Colors (hex numbers for PixiJS)
  laneColors: number[] // Array of colors for lanes (cycles through)
  highlightColor: number // Color for selection highlight ring
  headColor: number // Color for HEAD indicator
  backgroundColor: number // Stage background color

  // Typography
  fontFamily: string // Font family for text
  fontSize: number // Font size for ref labels
}

/**
 * GraphViewport - Zoom and pan state
 *
 * Controls the view transform of the graph
 */
export interface GraphViewport {
  x: number // Horizontal offset in pixels
  y: number // Vertical offset in pixels
  scale: number // Zoom scale (1.0 = 100%, 0.5 = 50%, 2.0 = 200%)
}

/**
 * GraphOptions - Configuration for graph rendering
 *
 * Controls what and how to render
 */
export interface GraphRenderOptions {
  // Viewport settings
  width: number // Canvas width in pixels
  height: number // Canvas height in pixels

  // Interaction settings
  enableZoom: boolean // Allow mouse wheel zoom
  enablePan: boolean // Allow drag to pan
  enableSelection: boolean // Allow clicking to select commits

  // Visual settings
  showRefs: boolean // Show branch/tag labels
  showMergeCommits: boolean // Show merge commits
  compactMode: boolean // Use compact layout (smaller spacing)
}
