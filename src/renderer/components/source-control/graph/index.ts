/**
 * Git Graph Visual Renderer
 *
 * PixiJS-based commit graph visualization components
 */

// Main component
export { GraphStage } from './GraphStage'

// Individual components (for custom compositions)
export { CommitNode } from './CommitNode'
export { CommitEdge } from './CommitEdge'
export { RefLabel } from './RefLabel'

// Layout engine
export { GraphLayoutEngine } from './GraphLayout'

// Theme
export {
  defaultTheme,
  compactTheme,
  lightTheme,
  createTheme,
  cssToPixiHex,
  pixiHexToCss,
} from './GraphTheme'

// Types
export type {
  GraphNode,
  GraphEdge,
  GraphLayout,
  GraphTheme,
  GraphViewport,
  GraphRenderOptions,
} from './types'
