import { useCallback } from 'react'
import type * as PIXI from 'pixi.js'
import type { GraphEdge, GraphTheme } from './types'

/**
 * CommitEdge Component
 *
 * Renders a connection line between two commits (parent-child relationship).
 * Uses straight lines for same-lane connections and bezier curves for lane changes.
 *
 * Merge commits are drawn with thicker lines for visual distinction.
 */

interface CommitEdgeProps {
  /** The edge to render */
  edge: GraphEdge

  /** Visual theme for styling */
  theme: GraphTheme

  /** Starting node position */
  fromNode: { x: number; y: number }

  /** Ending node position */
  toNode: { x: number; y: number }
}

export function CommitEdge({ edge, theme, fromNode, toNode }: CommitEdgeProps) {
  /**
   * Draw callback for PixiJS Graphics
   *
   * Draws either a straight line (same lane) or bezier curve (lane change)
   */
  const drawEdge = useCallback(
    (g: PIXI.Graphics) => {
      // Clear previous render
      g.clear()

      // Set line style
      const lineWidth = edge.isMerge ? 3 : 2

      if (edge.fromLane === edge.toLane) {
        // Straight vertical line for same-lane connections
        g.moveTo(fromNode.x, fromNode.y)
        g.lineTo(toNode.x, toNode.y)
      } else {
        // Bezier curve for lane-change connections
        // Control points are at the midpoint vertically
        const controlY = (fromNode.y + toNode.y) / 2

        g.moveTo(fromNode.x, fromNode.y)
        g.bezierCurveTo(
          fromNode.x,
          controlY, // Control point 1: horizontal from start, vertical midpoint
          toNode.x,
          controlY, // Control point 2: horizontal to end, vertical midpoint
          toNode.x,
          toNode.y
        )
      }

      // Apply stroke style to the path
      g.stroke({ width: lineWidth, color: edge.color })
    },
    [edge, fromNode, toNode]
  )

  return <pixiGraphics draw={drawEdge} />
}
