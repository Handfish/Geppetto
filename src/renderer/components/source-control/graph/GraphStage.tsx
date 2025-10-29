import React, { useMemo, useState, useRef, useEffect } from 'react'
import { Application, extend } from '@pixi/react'
// Import unsafe-eval polyfill for Electron CSP compatibility (side-effect only)
import 'pixi.js/unsafe-eval'
// Import actual PixiJS classes from main package
import { Container, Graphics, Text } from 'pixi.js'
import { GraphLayoutEngine } from './GraphLayout'
import { defaultTheme } from './GraphTheme'
import { CommitNode } from './CommitNode'
import { CommitEdge } from './CommitEdge'
import { RefLabel } from './RefLabel'
import type { CommitGraph } from '../../../../shared/schemas/source-control'
import type { GraphDisplaySettings } from '../../../hooks/useGraphSettings'

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

  /** Callback when a commit is right-clicked */
  onCommitContextMenu?: (hash: string, position: { x: number; y: number }) => void

  /** Display settings (control visibility of graph elements) */
  displaySettings?: GraphDisplaySettings

  /** Canvas width in pixels */
  width?: number

  /** Canvas height in pixels */
  height?: number
}

export function GraphStage({
  graph,
  selectedCommit,
  onCommitSelect,
  onCommitContextMenu,
  displaySettings,
  width = 800,
  height = 600,
}: GraphStageProps) {
  // Viewport state for zoom and pan
  const [viewport, setViewport] = useState({
    x: 0,
    y: 20, // Add small top padding
    scale: 1.0,
  })

  // Hover state for debugging
  const [hoveredCommit, setHoveredCommit] = useState<string | null>(null)

  // Ref for the container div to attach native wheel event
  const containerRef = useRef<HTMLDivElement>(null)

  // Calculate layout from backend graph
  // Memoized to avoid recalculation on every render
  const layout = useMemo(() => {
    const layoutEngine = new GraphLayoutEngine(defaultTheme)
    return layoutEngine.layout(graph)
  }, [graph])

  // Filter nodes and edges based on display settings
  const { filteredNodes, filteredEdges } = useMemo(() => {
    let nodes = Array.from(layout.nodes.values())
    let edges = layout.edges

    // Filter merge commits if setting is disabled
    if (displaySettings && !displaySettings.showMergeCommits) {
      // Filter nodes where commit has more than 1 parent (merge commits)
      const nonMergeNodes = nodes.filter((node) => node.commit.parents.length <= 1)
      const nonMergeHashes = new Set(nonMergeNodes.map((n) => String(n.commit.hash)))

      // Filter edges to only include those between non-merge commits
      edges = edges.filter(
        (edge) => nonMergeHashes.has(String(edge.from)) && nonMergeHashes.has(String(edge.to))
      )

      nodes = nonMergeNodes
    }

    return { filteredNodes: nodes, filteredEdges: edges }
  }, [layout, displaySettings])

  /**
   * Handle mouse wheel for zooming
   *
   * Use native event listener with { passive: false } to allow preventDefault()
   * This is necessary because browsers use passive listeners by default for wheel events
   */
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()

      setViewport((prev) => ({
        ...prev,
        scale: Math.max(0.5, Math.min(2.0, prev.scale - event.deltaY * 0.001)),
      }))
    }

    // Register with passive: false to allow preventDefault()
    container.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      container.removeEventListener('wheel', handleWheel)
    }
  }, [])

  // Get hovered node info for display
  const hoveredNode = hoveredCommit ? layout.nodes.get(hoveredCommit as any) : null

  return (
    <div className="relative">
      {/* Hover info overlay - for debugging */}
      {hoveredNode && (
        <div className="absolute top-0 left-0 right-0 z-10 bg-yellow-900/90 text-yellow-100 px-3 py-2 text-xs font-mono border-b border-yellow-700">
          <div className="flex items-center gap-4">
            <span className="font-semibold">HOVERING:</span>
            <span className="text-yellow-300">{hoveredNode.commit.hash.slice(0, 7)}</span>
            <span className="truncate flex-1">{hoveredNode.commit.subject}</span>
            <span className="text-yellow-400">
              pos: ({hoveredNode.x.toFixed(0)}, {hoveredNode.y.toFixed(0)})
            </span>
          </div>
        </div>
      )}
      <div ref={containerRef} className="border border-gray-700 rounded">
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
          {filteredEdges.map((edge, index) => {
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
          {/* Sort by y position to ensure render order matches visual layout */}
          {filteredNodes
            .sort((a, b) => a.y - b.y)
            .map((node) => {
              const isSelected = node.commit.hash === selectedCommit
              if (isSelected) {
                console.log('[GraphStage] Rendering selected node:', {
                  hash: node.commit.hash.slice(0, 7),
                  subject: node.commit.subject,
                  selectedCommit: selectedCommit?.slice(0, 7),
                  position: { x: node.x, y: node.y },
                })
              }
              return (
                <CommitNode
                  key={node.commit.hash}
                  node={node}
                  theme={defaultTheme}
                  isSelected={isSelected}
                  onSelect={onCommitSelect ?? (() => {})}
                  onHover={(hash) => {
                    setHoveredCommit(hash)
                    if (hash) {
                      const hoveredNode = layout.nodes.get(hash as any)
                      if (hoveredNode) {
                        console.log('[GraphStage] Hover on node:', {
                          hash: hash.slice(0, 7),
                          subject: hoveredNode.commit.subject,
                          position: { x: hoveredNode.x, y: hoveredNode.y },
                        })
                      }
                    }
                  }}
                  onContextMenu={onCommitContextMenu}
                />
              )
            })}

          {/* Render ref labels (branches/tags) - only if showRefs is enabled */}
          {(!displaySettings || displaySettings.showRefs) &&
            filteredNodes.map((node) =>
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
    </div>
  )
}
