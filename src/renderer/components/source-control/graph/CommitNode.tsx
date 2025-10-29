import { useCallback, useState } from 'react'
import type * as PIXI from 'pixi.js'
import { Circle } from 'pixi.js'
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

  /** Callback when node is hovered */
  onHover?: (commitHash: string | null) => void
}

export function CommitNode({
  node,
  theme,
  isSelected,
  onSelect,
  onHover,
}: CommitNodeProps) {
  const [isHovered, setIsHovered] = useState(false)

  /**
   * Draw callback for PixiJS Graphics
   *
   * IMPORTANT: Always call g.clear() first to avoid visual artifacts
   *
   * Draw at (0, 0) relative to the Graphics position for proper hit detection
   */
  const drawNode = useCallback(
    (g: PIXI.Graphics) => {
      // Clear previous render
      g.clear()

      // Draw main commit circle at (0, 0) - Graphics is positioned at (node.x, node.y)
      g.circle(0, 0, theme.nodeRadius).fill(node.color)

      // Draw selection ring if selected or highlighted
      if (isSelected || node.highlighted) {
        g.circle(0, 0, theme.nodeRadius + 4).stroke({ width: 3, color: theme.highlightColor })
      }

      // Draw hover ring (yellow/orange color for visibility)
      if (isHovered && !isSelected) {
        g.circle(0, 0, theme.nodeRadius + 4).stroke({ width: 2, color: 0xfbbf24 }) // yellow-400 for hover
      }

      // Draw HEAD indicator (smaller inner circle)
      if (node.isHead) {
        g.circle(0, 0, theme.nodeRadius - 2).fill(theme.headColor)
      }

      // Make interactive
      g.eventMode = 'static' // Enable event handling
      g.cursor = 'pointer' // Show pointer cursor on hover

      // Set explicit hit area for better click detection
      const hitRadius = theme.nodeRadius + 5 // Slightly larger for easier clicking
      g.hitArea = new Circle(0, 0, hitRadius)

      // Add event handlers
      // Remove any existing listeners to avoid duplicates
      g.removeAllListeners()

      // Hover in
      g.on('pointerover', () => {
        console.log('[CommitNode] HOVER IN:', {
          hash: node.commit.hash.slice(0, 7),
          subject: node.commit.subject,
          position: { x: node.x, y: node.y },
        })
        setIsHovered(true)
        onHover?.(node.commit.hash)
      })

      // Hover out
      g.on('pointerout', () => {
        console.log('[CommitNode] HOVER OUT:', {
          hash: node.commit.hash.slice(0, 7),
        })
        setIsHovered(false)
        onHover?.(null)
      })

      // Click
      g.on('pointerdown', (event) => {
        console.log('[CommitNode] CLICK detected:', {
          hash: node.commit.hash.slice(0, 7),
          subject: node.commit.subject,
          position: { x: node.x, y: node.y },
          eventGlobal: { x: event.global.x, y: event.global.y },
          isSelected,
          isHovered,
        })
        onSelect(node.commit.hash)
      })
    },
    [node, theme, isSelected, isHovered, onSelect, onHover]
  )

  // Position Graphics at node coordinates
  return <pixiGraphics draw={drawNode} x={node.x} y={node.y} />
}
