import { useCallback } from 'react'
import type * as PIXI from 'pixi.js'
import type { GraphTheme } from './types'

/**
 * RefLabel Component
 *
 * Renders a branch or tag label next to a commit node.
 * Uses a rounded rectangle background with text overlay.
 *
 * Composed of:
 * - Container: Groups background and text
 * - Graphics: Rounded rectangle background
 * - Text: Label text
 */

interface RefLabelProps {
  /** The reference name (branch or tag) */
  text: string

  /** X position (left edge) */
  x: number

  /** Y position (top edge) */
  y: number

  /** Visual theme for styling */
  theme: GraphTheme
}

export function RefLabel({ text, x, y, theme }: RefLabelProps) {
  /**
   * Draw background rectangle
   *
   * Uses a semi-transparent purple background for visibility on any lane color
   */
  const drawBackground = useCallback(
    (g: PIXI.Graphics) => {
      // Clear previous render
      g.clear()

      // Calculate dimensions based on text length
      // Rough estimate: 8 pixels per character + padding
      const width = text.length * 8 + 8
      const height = theme.fontSize + 4

      // Draw rounded rectangle background
      // Color: purple with 30% opacity (0x9333ea = purple-600)
      g.beginFill(0x9333ea, 0.3)
      g.drawRoundedRect(x, y, width, height, 4)
      g.endFill()
    },
    [text, x, y, theme]
  )

  return (
    <pixiContainer>
      {/* Background */}
      <pixiGraphics draw={drawBackground} />

      {/* Text */}
      <pixiText
        text={text}
        x={x + 4} // Padding from left edge
        y={y + 2} // Padding from top edge
        style={{
          fontFamily: theme.fontFamily,
          fontSize: theme.fontSize,
          fill: 0xe9d5ff, // purple-200 for good contrast
        }}
      />
    </pixiContainer>
  )
}
