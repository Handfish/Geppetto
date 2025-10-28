import { useCallback } from 'react'
import type * as PIXI from 'pixi.js'
import type { GraphNode, GraphTheme } from './types'

/**
 * CommitNode Component
 *
 * Renders a single commit node as a colored circle in the graph.
 * Supports selection, HEAD indication, and click interaction.
 *
 * Uses PixiJS Graphics for hardware-accelerated rendering.
 */

interface CommitNodeProps {
  /** The graph node to render */
  node: GraphNode

  /** Visual theme for styling */
  theme: GraphTheme

  /** Whether this node is currently selected */
  isSelected: boolean

  /** Callback when node is clicked */
  onSelect: (commitHash: string) => void
}

export function CommitNode({
  node,
  theme,
  isSelected,
  onSelect,
}: CommitNodeProps) {
  /**
   * Draw callback for PixiJS Graphics
   *
   * IMPORTANT: Always call g.clear() first to avoid visual artifacts
   */
  const drawNode = useCallback(
    (g: PIXI.Graphics) => {
      // Clear previous render
      g.clear()

      // Draw main commit circle
      g.beginFill(node.color)
      g.drawCircle(node.x, node.y, theme.nodeRadius)
      g.endFill()

      // Draw selection ring if selected or highlighted
      if (isSelected || node.highlighted) {
        g.lineStyle(3, theme.highlightColor)
        g.drawCircle(node.x, node.y, theme.nodeRadius + 4)
      }

      // Draw HEAD indicator (smaller inner circle)
      if (node.isHead) {
        g.beginFill(theme.headColor)
        g.drawCircle(node.x, node.y, theme.nodeRadius - 2)
        g.endFill()
      }

      // Make interactive
      g.eventMode = 'static' // Enable event handling
      g.cursor = 'pointer' // Show pointer cursor on hover

      // Add click handler
      // Remove any existing listeners to avoid duplicates
      g.removeAllListeners()
      g.on('pointerdown', () => {
        onSelect(node.commit.hash)
      })
    },
    [node, theme, isSelected, onSelect]
  )

  return <pixiGraphics draw={drawNode} />
}
