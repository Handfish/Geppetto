import React, { useMemo, useState } from 'react'
import { Application, extend } from '@pixi/react'
import { Container, Graphics, Text } from 'pixi.js'
import { GraphLayoutEngine } from './GraphLayout'
import { defaultTheme } from './GraphTheme'
import { CommitNode } from './CommitNode'
import { CommitEdge } from './CommitEdge'
import { RefLabel } from './RefLabel'
import type { CommitGraph } from '../../../../shared/schemas/source-control'

// Register PixiJS components for use in JSX
extend({ Container, Graphics, Text })

/**
 * GraphStage Component
 *
 * Main PixiJS stage component for rendering the commit graph.
 * Coordinates all visual elements (nodes, edges, labels) and handles
 * viewport transforms (zoom, pan).
 *
 * Uses PixiJS WebGL renderer for hardware-accelerated performance.
 */

interface GraphStageProps {
  /** Backend commit graph data */
  graph: CommitGraph

  /** Currently selected commit hash (for highlighting) */
  selectedCommit?: string

  /** Callback when a commit is clicked */
  onCommitSelect?: (hash: string) => void

  /** Canvas width in pixels */
  width?: number

  /** Canvas height in pixels */
  height?: number
}

export function GraphStage({
  graph,
  selectedCommit,
  onCommitSelect,
  width = 800,
  height = 600,
}: GraphStageProps) {
  // Viewport state for zoom and pan
  const [viewport, setViewport] = useState({
    x: 0,
    y: 20, // Add small top padding
    scale: 1.0,
  })

  // Calculate layout from backend graph
  // Memoized to avoid recalculation on every render
  const layout = useMemo(() => {
    const layoutEngine = new GraphLayoutEngine(defaultTheme)
    return layoutEngine.layout(graph)
  }, [graph])

  /**
   * Handle mouse wheel for zooming
   *
   * Ctrl+Wheel or trackpad pinch to zoom in/out
   */
  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault()

    setViewport((prev) => ({
      ...prev,
      scale: Math.max(0.5, Math.min(2.0, prev.scale - event.deltaY * 0.001)),
    }))
  }

  return (
    <div onWheel={handleWheel} className="border border-gray-700 rounded">
      <Application
        width={width}
        height={height}
        backgroundColor={defaultTheme.backgroundColor} // gray-800 for dark mode
        antialias={true} // Smooth rendering
        resolution={window.devicePixelRatio || 1} // Support high-DPI displays
      >
        {/* Container for viewport transform (zoom/pan) */}
        <pixiContainer
          x={viewport.x}
          y={viewport.y}
          scale={{ x: viewport.scale, y: viewport.scale }}
        >
          {/* Render edges first (behind nodes) */}
          {layout.edges.map((edge, index) => {
            const fromNode = layout.nodes.get(edge.from)
            const toNode = layout.nodes.get(edge.to)

            // Skip if nodes not found (shouldn't happen)
            if (!fromNode || !toNode) return null

            return (
              <CommitEdge
                key={`edge-${index}`}
                edge={edge}
                theme={defaultTheme}
                fromNode={fromNode}
                toNode={toNode}
              />
            )
          })}

          {/* Render commit nodes */}
          {Array.from(layout.nodes.values()).map((node) => (
            <CommitNode
              key={node.commit.hash}
              node={node}
              theme={defaultTheme}
              isSelected={node.commit.hash === selectedCommit}
              onSelect={onCommitSelect ?? (() => {})}
            />
          ))}

          {/* Render ref labels (branches/tags) */}
          {Array.from(layout.nodes.values()).map((node) =>
            node.refs.map((ref, index) => (
              <RefLabel
                key={`${node.commit.hash}-${ref}`}
                text={ref}
                x={node.x + defaultTheme.nodeRadius + 8}
                y={
                  node.y -
                  defaultTheme.fontSize / 2 +
                  index * (defaultTheme.fontSize + 4)
                }
                theme={defaultTheme}
              />
            ))
          )}
        </pixiContainer>
      </Application>
    </div>
  )
}
