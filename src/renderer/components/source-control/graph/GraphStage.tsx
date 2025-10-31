import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react'
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

  /** External zoom level control (0.5 - 2.0) */
  zoomLevel?: number

  /** Callback when zoom changes (via mouse wheel) */
  onZoomChange?: (zoom: number) => void

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
  zoomLevel,
  onZoomChange,
  width = 800,
  height = 600,
}: GraphStageProps) {
  // Use refs for viewport to avoid re-renders during pan (performance!)
  const viewportRef = useRef({
    x: 0,
    y: 20, // Add small top padding
  })

  // Ref to the PixiJS container for direct manipulation
  const pixiContainerRef = useRef<any>(null)

  // Ref to the PixiJS Application for resizing
  const pixiAppRef = useRef<any>(null)

  // Calculate current render dimensions
  const renderWidth = Math.max(1, Math.round(width))
  const renderHeight = Math.max(1, Math.round(height))

  // Use external zoom level if provided, otherwise default
  const currentZoom = zoomLevel ?? 1.0

  // Pan state for mouse drag
  const isPanningRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0 })

  // Hover state for debugging - disable during pan for performance
  const [hoveredCommit, setHoveredCommit] = useState<string | null>(null)

  const setHoveredCommitOptimized = useCallback((hash: string | null) => {
    // Don't update hover state while panning (causes re-renders during drag)
    if (isPanningRef.current) return
    setHoveredCommit(hash)
  }, [])

  // Ref for the container div to attach native wheel event and focus
  const containerRef = useRef<HTMLDivElement>(null)

  // Update PixiJS container position directly (no React re-render)
  const updateViewport = useCallback((x: number, y: number) => {
    viewportRef.current = { x, y }
    if (pixiContainerRef.current) {
      pixiContainerRef.current.x = x
      pixiContainerRef.current.y = y
    }
  }, [])

  /**
   * CANVAS SCALING SOLUTION
   *
   * Problem: When side panels (like commit details) open/close, the visible area changes but
   * PixiJS canvas remounting causes a jarring black flash due to WebGL context recreation.
   *
   * Solution: Make the canvas WIDER than the visible container by adding a buffer.
   * - Canvas width = visible width + 500px buffer
   * - The container has overflow:hidden, clipping the extra canvas
   * - When a panel opens and renderWidth shrinks, the canvas is already wide enough
   * - No remount needed = no black flash
   * - Only remount when the canvas needs to grow beyond its current size (window resize, etc.)
   *
   * Example:
   * - Visible area: 1000px, Canvas: 1500px (500px hidden)
   * - Panel opens: Visible becomes 600px, Canvas still 1500px (900px hidden now)
   * - Result: Smooth, no flash
   */
  const PANEL_WIDTH_BUFFER = 500
  const canvasWidth = renderWidth + PANEL_WIDTH_BUFFER
  const canvasHeight = renderHeight

  // Track app key for forced remounts (only on very large changes like fullscreen)
  const [appKey, setAppKey] = useState(0)
  const [showFadeOverlay, setShowFadeOverlay] = useState(true) // Start true for initial render
  const lastRemountSizeRef = useRef({ width: canvasWidth, height: canvasHeight })
  const isInitialMountRef = useRef(true)

  /**
   * INITIAL MOUNT FADE-IN
   *
   * On initial component mount, show the fade overlay and wait for PixiJS to render,
   * then fade out to reveal the graph. This creates a polished loading experience.
   */
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false

      // Wait for PixiJS to fully render the initial graph
      setTimeout(() => {
        setShowFadeOverlay(false)
      }, 800)
    }
  }, [])

  /**
   * REMOUNT DETECTION & FADE OVERLAY
   *
   * Only remount the PixiJS Application when the canvas needs to grow beyond its buffer.
   * When remounting is necessary, use a fade overlay to hide the black flash:
   *
   * 1. Show gray overlay (z-20) covering the canvas
   * 2. Use two requestAnimationFrame calls to guarantee the overlay is painted
   * 3. Remount canvas with new key (triggers WebGL context recreation)
   * 4. Wait 800ms for PixiJS to render first frame
   * 5. Fade out overlay over 500ms, revealing the canvas smoothly
   *
   * This creates a gray-to-gray transition instead of black flash.
   * The double rAF ensures the overlay is visible BEFORE the WebGL context is destroyed.
   */
  useEffect(() => {
    const widthDelta = Math.abs(lastRemountSizeRef.current.width - canvasWidth)
    const heightDelta = Math.abs(lastRemountSizeRef.current.height - canvasHeight)

    // Only remount if canvas needs to grow beyond buffer
    if (widthDelta > PANEL_WIDTH_BUFFER || heightDelta > 200) {
      console.error('[GraphStage] ⚠️ FULL CANVAS RERENDER (window resize) ⚠️', {
        from: lastRemountSizeRef.current,
        to: { width: canvasWidth, height: canvasHeight }
      })
      lastRemountSizeRef.current = { width: canvasWidth, height: canvasHeight }

      // Show fade overlay to hide the black flash
      setShowFadeOverlay(true)

      // Wait for overlay to render, then trigger remount
      // Use two rAF calls to guarantee the overlay has been painted before remount
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // Now the overlay is guaranteed to be visible
          setAppKey(prev => prev + 1)
          pixiAppRef.current = null

          // Wait for PixiJS to fully initialize and render, then fade out overlay
          setTimeout(() => {
            setShowFadeOverlay(false)
          }, 800) // 800ms gives PixiJS plenty of time to fully render before fading out
        })
      })
    }
  }, [canvasWidth, canvasHeight])


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

      const newZoom = Math.max(0.5, Math.min(2.0, currentZoom - event.deltaY * 0.001))
      onZoomChange?.(newZoom)
    }

    // Register with passive: false to allow preventDefault()
    container.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      container.removeEventListener('wheel', handleWheel)
    }
  }, [currentZoom, onZoomChange])

  /**
   * Handle mouse pan (click and drag)
   * Using refs to avoid React re-renders for smooth 60fps performance
   */
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleMouseDown = (event: MouseEvent) => {
      // Only pan with left mouse button
      if (event.button !== 0) return

      // Don't pan if clicking on a commit node (let node click handler fire)
      const target = event.target as HTMLElement
      if (target.tagName === 'CANVAS') {
        isPanningRef.current = true
        panStartRef.current = {
          x: event.clientX - viewportRef.current.x,
          y: event.clientY - viewportRef.current.y,
        }
        container.style.cursor = 'grabbing'
        event.preventDefault()
      }
    }

    const handleMouseMove = (event: MouseEvent) => {
      if (!isPanningRef.current) return

      // Direct PixiJS manipulation - no React re-render!
      const newX = event.clientX - panStartRef.current.x
      const newY = event.clientY - panStartRef.current.y
      updateViewport(newX, newY)
    }

    const handleMouseUp = () => {
      if (isPanningRef.current) {
        isPanningRef.current = false
        if (container) {
          container.style.cursor = 'grab'
        }
      }
    }

    // Register on container for mousedown, but document for move/up
    // This allows dragging even when mouse leaves container
    container.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      container.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [updateViewport])

  /**
   * Handle keyboard navigation (arrow keys and WASD)
   * Using refs for smooth performance
   */
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleKeyDown = (event: KeyboardEvent) => {
      // Check if we're focused on the canvas
      if (document.activeElement !== container) return

      // Pan amount per key press (in pixels)
      const panAmount = 50
      let handled = false

      switch (event.key) {
        case 'ArrowUp':
          handled = true
          updateViewport(viewportRef.current.x, viewportRef.current.y + panAmount)
          break

        case 'ArrowDown':
          handled = true
          updateViewport(viewportRef.current.x, viewportRef.current.y - panAmount)
          break

        case 'ArrowLeft':
          handled = true
          updateViewport(viewportRef.current.x + panAmount, viewportRef.current.y)
          break

        case 'ArrowRight':
          handled = true
          updateViewport(viewportRef.current.x - panAmount, viewportRef.current.y)
          break

        case 'w':
        case 'W':
          handled = true
          updateViewport(viewportRef.current.x, viewportRef.current.y + panAmount)
          break

        case 's':
        case 'S':
          handled = true
          updateViewport(viewportRef.current.x, viewportRef.current.y - panAmount)
          break

        case 'a':
        case 'A':
          handled = true
          updateViewport(viewportRef.current.x + panAmount, viewportRef.current.y)
          break

        case 'd':
        case 'D':
          handled = true
          updateViewport(viewportRef.current.x - panAmount, viewportRef.current.y)
          break

        case 'Home':
          handled = true
          updateViewport(0, 20)
          break
      }

      if (handled) {
        event.preventDefault()
        event.stopPropagation()
      }
    }

    // Listen on document to catch all keyboard events
    document.addEventListener('keydown', handleKeyDown, { capture: true })

    return () => {
      document.removeEventListener('keydown', handleKeyDown, { capture: true })
    }
  }, [updateViewport])

  // Get hovered node info for display
  const hoveredNode = hoveredCommit ? layout.nodes.get(hoveredCommit as any) : null

  return (
    <div className="relative w-full h-full">
      {/* Hover info overlay - for debugging */}
      {hoveredNode && (
        <div className="absolute top-0 left-0 right-0 z-30 bg-yellow-900/90 text-yellow-100 px-3 py-2 text-xs font-mono border-b border-yellow-700">
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

      {/* Pan instructions overlay */}
      <div className="absolute bottom-2 right-2 z-10 bg-gray-900/90 text-gray-300 px-3 py-2 text-xs rounded border border-gray-700">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Pan:</span>
            <span>Click + Drag or Arrow Keys</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Reset:</span>
            <span>Home Key</span>
          </div>
        </div>
      </div>

      <div
        ref={containerRef}
        tabIndex={0}
        className="border border-blue-500 rounded outline-none focus:ring-2 focus:ring-blue-500 cursor-grab overflow-hidden relative"
        style={{
          userSelect: 'none',
          width: `${renderWidth}px`,
          height: `${renderHeight}px`,
          backgroundColor: '#1f2937',
        }}
        onClick={() => containerRef.current?.focus()}
      >
        {/*
          FADE OVERLAY FOR REMOUNT

          When the canvas remounts (due to window resize beyond buffer), show this gray overlay
          to cover the black flash that occurs during WebGL context recreation. The overlay:
          - Appears instantly at full opacity when showFadeOverlay=true
          - Covers the canvas (z-20, above canvas but below hover debug overlay)
          - Fades out over 300ms once PixiJS has rendered its first frame
          - Uses the same gray-800 color as the PixiJS background for seamless transition
        */}
        <div
          className="absolute inset-0 pointer-events-none z-20 flex items-center justify-center"
          style={{
            backgroundColor: '#1f2937', // gray-800, matches PixiJS backgroundColor
            opacity: showFadeOverlay ? 1 : 0,
            transition: showFadeOverlay ? 'none' : 'opacity 500ms cubic-bezier(0.4, 0, 0.2, 1)', // Instant on, smooth fade out
            pointerEvents: 'none', // Never block interactions
          }}
        >
          {showFadeOverlay && (
            <div className="flex flex-col items-center gap-3">
              {/* Spinner */}
              <div className="relative w-10 h-10">
                <div
                  className="absolute inset-0 border-4 border-gray-600 border-t-blue-500 rounded-full animate-spin"
                  style={{ animationDuration: '0.8s' }}
                />
              </div>
              {/* Loading text */}
              <div className="text-gray-400 text-sm font-medium">
                Rendering graph...
              </div>
            </div>
          )}
        </div>
          <Application
            key={appKey} // Changes on remount to force React to recreate the component
            ref={(app) => {
              if (app && !pixiAppRef.current) {
                console.log('[GraphStage] PixiJS Application mounted (key:', appKey, ') - Canvas:', canvasWidth, 'x', canvasHeight, 'Visible:', renderWidth, 'x', renderHeight)
                pixiAppRef.current = app
              }
            }}
            width={canvasWidth} // Canvas is wider than visible area (includes buffer)
            height={canvasHeight}
            backgroundColor={defaultTheme.backgroundColor}
            antialias={true}
            resolution={window.devicePixelRatio || 1}
          >
      {/* Container for viewport transform (zoom/pan) */}
      <pixiContainer
        ref={pixiContainerRef}
        x={viewportRef.current.x}
        y={viewportRef.current.y}
        scale={{ x: currentZoom, y: currentZoom }}
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
            return (
              <CommitNode
                key={node.commit.hash}
                node={node}
                theme={defaultTheme}
                isSelected={isSelected}
                onSelect={onCommitSelect ?? (() => {})}
                onHover={setHoveredCommitOptimized}
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
