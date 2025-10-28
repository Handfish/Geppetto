# Git Tree Visual Graph Implementation Plan

## Overview

Implement visual commit graph rendering (inspired by vscode-git-graph) as a native feature in Geppetto's existing source-control domain. The backend infrastructure is **already complete** - this plan focuses on building the **visual graph canvas renderer** and **interactive UI components**.

**Status**: Ready to Start
**Target Completion**: 3-4 days
**Primary Goal**: Add professional visual git graph with interactive commit history, branch visualization, and graph operations

---

## Current State Analysis

### Already Implemented ✅

**Backend (Source Control Domain)**:
- ✅ `CommitGraphService` - Graph building with topological layout
- ✅ `RepositoryService` - Repository management and caching
- ✅ `CommitHash`, `BranchName`, `Remote` value objects
- ✅ `Repository`, `CommitGraph`, `Commit` aggregates
- ✅ IPC contracts for all operations
- ✅ Effect Atoms for reactive state
- ✅ Domain errors and error mapping

**Frontend (Basic Components)**:
- ✅ `CommitGraphView` - Simple list-based commit display
- ✅ `CommitHistoryList` - Linear commit history
- ✅ `BranchList` - Branch management
- ✅ `StatusBar` - Repository status
- ✅ `RepositoryExplorer` - Repository selection
- ✅ Hooks (`useCommitGraph`, `useCommitHistory`, etc.)

### Missing Components 🔴

**Visual Graph Rendering**:
- 🔴 PixiJS-based commit graph renderer (@pixi/react)
- 🔴 Graph layout algorithm (lane assignment, positioning)
- 🔴 Interactive graph features (zoom, pan, select with PixiJS events)
- 🔴 Commit details panel
- 🔴 Branch visualization with colors
- 🔴 Merge commit visualization with curves

**Advanced UI Features**:
- 🔴 Commit diff viewer
- 🔴 File change tree
- 🔴 Context menus (checkout, cherry-pick, rebase, etc.)
- 🔴 Search and filter
- 🔴 Graph settings (columns, colors, etc.)

---

## Target State

### Visual Graph Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Git Graph Main View                          │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Repository Selector + Branch Filter + Search              │ │
│  └────────────────────────────────────────────────────────────┘ │
│  ┌────────────────┬──────────────────────────────────────────┐ │
│  │   Graph Canvas │  Commit Details Panel                    │ │
│  │                │  ┌────────────────────────────────────┐  │ │
│  │   [Commit 1]───│──│ Hash: abc123                       │  │ │
│  │     ├─[C2]     │  │ Author: John Doe                   │  │ │
│  │     │  └─[C3]  │  │ Message: ...                       │  │ │
│  │     └─[C4]─┐   │  │ Parents: [xyz789]                  │  │ │
│  │         └──[C5]│  │ Changed Files: [3]                 │  │ │
│  │                │  └────────────────────────────────────┘  │ │
│  │   [visual      │  [Tabs: Changes / Diff / Stats]        │ │
│  │    graph with  │                                         │ │
│  │    colors and  │  ┌────────────────────────────────────┐ │ │
│  │    lanes]      │  │ src/main.ts        | +12 -3       │ │ │
│  │                │  │ package.json       | +1 -0        │ │ │
│  │                │  └────────────────────────────────────┘ │ │
│  └────────────────┴──────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Technology Decision: PixiJS

**Decision**: Use **PixiJS with @pixi/react** instead of raw HTML Canvas API

**Rationale**:
- **Performance**: PixiJS uses WebGL for hardware-accelerated rendering, significantly faster than Canvas 2D API for large graphs
- **React Integration**: @pixi/react provides declarative component-based rendering that fits naturally with React patterns
- **Interactivity**: Built-in event system for click, hover, drag interactions without manual hit detection
- **Scene Graph**: Automatic rendering optimization with Container hierarchy and object culling
- **Developer Experience**: Higher-level API reduces boilerplate for transforms, animations, and effects
- **Future-Proof**: Easy to add advanced features (particles, filters, custom shaders) if needed

**Trade-offs**:
- Slightly larger bundle size (~500KB for pixi.js + @pixi/react)
- Additional dependency to maintain
- Learning curve for PixiJS API (mitigated by @pixi/react abstraction)

**Implementation Notes**:
- Use `Stage` component as root renderer
- Use `Container` for viewport transforms (zoom/pan)
- Use `Graphics` for drawing commit nodes and edges
- Use `Text` for branch/tag labels
- PixiJS events (`pointerdown`, `rightdown`) for interactions

---

## Phase 1: PixiJS Graph Renderer

**Duration**: 8-10 hours
**Risk**: Medium
**Prerequisites**: None (backend complete)

### 1.1 Create Graph Rendering Engine

**New files**:
```
src/renderer/components/source-control/
├── graph/
│   ├── GraphStage.tsx           # Main PixiJS stage component
│   ├── CommitNode.tsx           # Commit circle component
│   ├── CommitEdge.tsx           # Edge line component
│   ├── RefLabel.tsx             # Branch/tag label component
│   ├── GraphLayout.ts           # Lane assignment, positioning
│   ├── GraphTheme.ts            # Colors, styles, constants
│   └── types.ts                 # Graph rendering types
```

**File: src/renderer/components/source-control/graph/types.ts**
```typescript
export interface GraphNode {
  commit: Commit
  refs: string[]
  isHead: boolean
  // Layout coordinates
  x: number
  y: number
  lane: number
  // Visual properties
  color: string
  highlighted: boolean
}

export interface GraphEdge {
  from: string  // commit hash
  to: string    // commit hash
  fromLane: number
  toLane: number
  color: string
  isMerge: boolean
}

export interface GraphLayout {
  nodes: Map<string, GraphNode>
  edges: GraphEdge[]
  totalLanes: number
  totalHeight: number
}

export interface GraphTheme {
  // Dimensions
  nodeRadius: number
  laneWidth: number
  rowHeight: number
  commitSpacing: number

  // Colors (support for up to 8 lanes)
  laneColors: string[]
  highlightColor: string
  headColor: string

  // Typography
  fontFamily: string
  fontSize: number
}

export interface GraphViewport {
  offsetX: number
  offsetY: number
  scale: number
}
```

### 1.2 Implement Graph Layout Algorithm

**File: src/renderer/components/source-control/graph/GraphLayout.ts**

```typescript
import { CommitGraph } from '../../../../shared/schemas/source-control'
import { GraphLayout, GraphNode, GraphEdge } from './types'

/**
 * Converts CommitGraph (from backend) to visual GraphLayout
 *
 * Algorithm:
 * 1. Assign each commit to a lane (topological order)
 * 2. Calculate (x, y) positions based on lane and row
 * 3. Assign colors based on lane
 * 4. Generate edges between parent-child commits
 */
export class GraphLayoutEngine {
  constructor(private theme: GraphTheme) {}

  layout(graph: CommitGraph): GraphLayout {
    const nodes = new Map<string, GraphNode>()
    const edges: GraphEdge[] = []
    const laneCounts = new Map<number, number>()  // Track commits per lane

    // Process nodes (already have column from backend)
    graph.nodes.forEach((node, index) => {
      const lane = node.column ?? 0
      const row = index

      // Calculate position
      const x = lane * this.theme.laneWidth
      const y = row * this.theme.rowHeight

      // Assign color based on lane
      const color = this.theme.laneColors[lane % this.theme.laneColors.length]

      nodes.set(node.id, {
        commit: node.commit,
        refs: node.refs,
        isHead: node.isHead,
        x,
        y,
        lane,
        color,
        highlighted: false,
      })

      laneCounts.set(lane, (laneCounts.get(lane) || 0) + 1)
    })

    // Generate edges from graph
    graph.edges.forEach((edge) => {
      const fromNode = nodes.get(edge.from)
      const toNode = nodes.get(edge.to)

      if (fromNode && toNode) {
        edges.push({
          from: edge.from,
          to: edge.to,
          fromLane: fromNode.lane,
          toLane: toNode.lane,
          color: fromNode.color,
          isMerge: edge.isMerge,
        })
      }
    })

    const totalLanes = Math.max(...Array.from(laneCounts.keys())) + 1
    const totalHeight = graph.nodes.length * this.theme.rowHeight

    return { nodes, edges, totalLanes, totalHeight }
  }
}
```

### 1.3 Implement PixiJS Components

**File: src/renderer/components/source-control/graph/CommitNode.tsx**

```typescript
import { Graphics, Text } from '@pixi/react'
import { useCallback } from 'react'
import type { GraphNode, GraphTheme } from './types'

interface CommitNodeProps {
  node: GraphNode
  theme: GraphTheme
  isSelected: boolean
  onSelect: (hash: string) => void
}

/**
 * Renders a single commit node as a circle with PixiJS
 */
export function CommitNode({ node, theme, isSelected, onSelect }: CommitNodeProps) {
  const drawNode = useCallback((g: PIXI.Graphics) => {
    g.clear()

    // Draw commit circle
    g.beginFill(node.color)
    g.drawCircle(node.x, node.y, theme.nodeRadius)
    g.endFill()

    // Draw selection ring
    if (isSelected || node.highlighted) {
      g.lineStyle(3, theme.highlightColor)
      g.drawCircle(node.x, node.y, theme.nodeRadius + 4)
    }

    // Draw HEAD indicator
    if (node.isHead) {
      g.beginFill(theme.headColor)
      g.drawCircle(node.x, node.y, theme.nodeRadius - 2)
      g.endFill()
    }

    // Make interactive
    g.interactive = true
    g.buttonMode = true
    g.on('pointerdown', () => onSelect(node.commit.hash))
  }, [node, theme, isSelected, onSelect])

  return <Graphics draw={drawNode} />
}
```

**File: src/renderer/components/source-control/graph/CommitEdge.tsx**

```typescript
import { Graphics } from '@pixi/react'
import { useCallback } from 'react'
import type { GraphEdge, GraphTheme } from './types'

interface CommitEdgeProps {
  edge: GraphEdge
  theme: GraphTheme
  fromNode: { x: number; y: number }
  toNode: { x: number; y: number }
}

/**
 * Renders an edge connecting two commits
 */
export function CommitEdge({ edge, theme, fromNode, toNode }: CommitEdgeProps) {
  const drawEdge = useCallback((g: PIXI.Graphics) => {
    g.clear()
    g.lineStyle(edge.isMerge ? 3 : 2, edge.color)

    if (edge.fromLane === edge.toLane) {
      // Straight vertical line
      g.moveTo(fromNode.x, fromNode.y)
      g.lineTo(toNode.x, toNode.y)
    } else {
      // Bezier curve for lane changes
      const controlY = (fromNode.y + toNode.y) / 2
      g.moveTo(fromNode.x, fromNode.y)
      g.bezierCurveTo(
        fromNode.x, controlY,
        toNode.x, controlY,
        toNode.x, toNode.y
      )
    }
  }, [edge, fromNode, toNode])

  return <Graphics draw={drawEdge} />
}
```

**File: src/renderer/components/source-control/graph/RefLabel.tsx**

```typescript
import { Container, Graphics, Text } from '@pixi/react'
import { useCallback } from 'react'
import type { GraphTheme } from './types'

interface RefLabelProps {
  text: string
  x: number
  y: number
  theme: GraphTheme
}

/**
 * Renders a branch/tag label
 */
export function RefLabel({ text, x, y, theme }: RefLabelProps) {
  const drawBackground = useCallback((g: PIXI.Graphics) => {
    g.clear()
    g.beginFill(0x9333ea, 0.3) // purple with alpha
    g.drawRoundedRect(x, y, text.length * 8, theme.fontSize + 4, 4)
    g.endFill()
  }, [x, y, text, theme])

  return (
    <Container>
      <Graphics draw={drawBackground} />
      <Text
        text={text}
        x={x + 4}
        y={y + 2}
        style={{
          fontFamily: theme.fontFamily,
          fontSize: theme.fontSize,
          fill: 0xe9d5ff, // purple-200
        }}
      />
    </Container>
  )
}
```

### 1.4 Create GraphStage Component

**File: src/renderer/components/source-control/graph/GraphStage.tsx**

```typescript
import React, { useMemo, useState } from 'react'
import { Stage, Container } from '@pixi/react'
import { GraphLayoutEngine } from './GraphLayout'
import { defaultTheme } from './GraphTheme'
import { CommitNode } from './CommitNode'
import { CommitEdge } from './CommitEdge'
import { RefLabel } from './RefLabel'
import type { CommitGraph } from '../../../../shared/schemas/source-control'

interface GraphStageProps {
  graph: CommitGraph
  selectedCommit?: string
  onCommitSelect?: (hash: string) => void
  width?: number
  height?: number
}

/**
 * Main PixiJS stage component for rendering commit graph
 */
export function GraphStage({
  graph,
  selectedCommit,
  onCommitSelect,
  width = 800,
  height = 600,
}: GraphStageProps) {
  const [viewport, setViewport] = useState({
    x: 0,
    y: 0,
    scale: 1.0,
  })

  // Calculate layout
  const layout = useMemo(() => {
    const layoutEngine = new GraphLayoutEngine(defaultTheme)
    return layoutEngine.layout(graph)
  }, [graph])

  // Handle wheel for zoom
  const handleWheel = (event: WheelEvent) => {
    event.preventDefault()
    setViewport((prev) => ({
      ...prev,
      scale: Math.max(0.5, Math.min(2.0, prev.scale - event.deltaY * 0.001)),
    }))
  }

  return (
    <Stage
      width={width}
      height={height}
      options={{ backgroundColor: 0x1f2937 }} // gray-800
      onWheel={handleWheel}
      className="border border-gray-700 rounded"
    >
      <Container
        x={viewport.x}
        y={viewport.y}
        scale={{ x: viewport.scale, y: viewport.scale }}
      >
        {/* Render edges first (behind nodes) */}
        {layout.edges.map((edge, index) => {
          const fromNode = layout.nodes.get(edge.from)
          const toNode = layout.nodes.get(edge.to)
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

        {/* Render nodes */}
        {Array.from(layout.nodes.values()).map((node) => (
          <CommitNode
            key={node.commit.hash}
            node={node}
            theme={defaultTheme}
            isSelected={node.commit.hash === selectedCommit}
            onSelect={onCommitSelect ?? (() => {})}
          />
        ))}

        {/* Render ref labels */}
        {Array.from(layout.nodes.values()).map((node) =>
          node.refs.map((ref, index) => (
            <RefLabel
              key={`${node.commit.hash}-${ref}`}
              text={ref}
              x={node.x + defaultTheme.nodeRadius + 8}
              y={node.y - defaultTheme.fontSize / 2 + index * (defaultTheme.fontSize + 4)}
              theme={defaultTheme}
            />
          ))
        )}
      </Container>
    </Stage>
  )
}
```

### 1.5 Testing Phase 1

```bash
# Install @pixi/react dependency
pnpm add @pixi/react pixi.js

# Run frontend in dev mode
pnpm dev

# Navigate to Source Control Dev Panel
# Select a repository
# View commit graph - should see PixiJS rendering
```

**Success Criteria**:
- ✅ PixiJS Stage renders commit nodes as colored circles
- ✅ Edges connect parent-child commits with smooth curves
- ✅ Lanes are assigned correctly
- ✅ Clicking a commit selects it (PixiJS interaction events)
- ✅ Zoom in/out with mouse wheel works
- ✅ Refs (branches/tags) displayed on commits
- ✅ Rendering is smooth and performant (60fps)

---

## Phase 2: Commit Details Panel

**Duration**: 6-8 hours
**Risk**: Low
**Prerequisites**: Phase 1 complete

### 2.1 Create Commit Details Component

**New files**:
```
src/renderer/components/source-control/
├── details/
│   ├── CommitDetailsPanel.tsx   # Main details container
│   ├── CommitInfo.tsx           # Hash, author, message
│   ├── FileChangesList.tsx      # Changed files list
│   ├── DiffViewer.tsx           # File diff display
│   └── StatsView.tsx            # Commit statistics
```

**File: src/renderer/components/source-control/details/CommitDetailsPanel.tsx**

```typescript
import React, { useState } from 'react'
import { Result } from '@effect-atom/atom-react'
import { useCommit } from '../../../hooks/useSourceControl'
import { CommitInfo } from './CommitInfo'
import { FileChangesList } from './FileChangesList'
import { DiffViewer } from './DiffViewer'
import { StatsView } from './StatsView'
import { ErrorAlert, LoadingSpinner } from '../../ui/ErrorAlert'
import type { RepositoryId } from '../../../../shared/schemas/source-control'

type TabType = 'changes' | 'diff' | 'stats'

interface CommitDetailsPanelProps {
  repositoryId: RepositoryId
  commitHash: string
  onClose?: () => void
}

export function CommitDetailsPanel({
  repositoryId,
  commitHash,
  onClose,
}: CommitDetailsPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('changes')
  const [selectedFile, setSelectedFile] = useState<string | null>(null)

  const { commitResult } = useCommit(repositoryId, commitHash)

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <h3 className="text-lg font-semibold text-white">Commit Details</h3>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            ✕
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {Result.builder(commitResult)
          .onInitial(() => <LoadingSpinner size="md" />)
          .onErrorTag('NotFoundError', (error) => (
            <ErrorAlert error={error} message="Commit not found" />
          ))
          .onDefect((defect) => (
            <ErrorAlert message={`Unexpected error: ${String(defect)}`} />
          ))
          .onSuccess((commit) => (
            <div className="space-y-4">
              {/* Commit Info */}
              <CommitInfo commit={commit} />

              {/* Tabs */}
              <div className="flex border-b border-gray-700">
                <button
                  onClick={() => setActiveTab('changes')}
                  className={`px-4 py-2 ${
                    activeTab === 'changes'
                      ? 'text-blue-400 border-b-2 border-blue-400'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  Changes
                </button>
                <button
                  onClick={() => setActiveTab('diff')}
                  className={`px-4 py-2 ${
                    activeTab === 'diff'
                      ? 'text-blue-400 border-b-2 border-blue-400'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                  disabled={!selectedFile}
                >
                  Diff
                </button>
                <button
                  onClick={() => setActiveTab('stats')}
                  className={`px-4 py-2 ${
                    activeTab === 'stats'
                      ? 'text-blue-400 border-b-2 border-blue-400'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  Stats
                </button>
              </div>

              {/* Tab Content */}
              {activeTab === 'changes' && (
                <FileChangesList
                  repositoryId={repositoryId}
                  commitHash={commitHash}
                  onFileSelect={setSelectedFile}
                  selectedFile={selectedFile}
                />
              )}
              {activeTab === 'diff' && selectedFile && (
                <DiffViewer
                  repositoryId={repositoryId}
                  commitHash={commitHash}
                  filePath={selectedFile}
                />
              )}
              {activeTab === 'stats' && (
                <StatsView
                  repositoryId={repositoryId}
                  commitHash={commitHash}
                />
              )}
            </div>
          ))
          .render()}
      </div>
    </div>
  )
}
```

### 2.2 Implement File Changes List

**File: src/renderer/components/source-control/details/FileChangesList.tsx**

```typescript
import React from 'react'

// Placeholder - need to add getDiff IPC handler
interface FileChange {
  path: string
  status: 'added' | 'modified' | 'deleted' | 'renamed'
  additions: number
  deletions: number
}

interface FileChangesListProps {
  repositoryId: RepositoryId
  commitHash: string
  onFileSelect: (path: string) => void
  selectedFile: string | null
}

export function FileChangesList({
  repositoryId,
  commitHash,
  onFileSelect,
  selectedFile,
}: FileChangesListProps) {
  // TODO: Fetch changed files via IPC
  const changes: FileChange[] = []

  return (
    <div className="space-y-2">
      <div className="text-sm text-gray-400">
        {changes.length} files changed
      </div>

      {changes.map((change) => (
        <div
          key={change.path}
          onClick={() => onFileSelect(change.path)}
          className={`
            p-3 rounded border cursor-pointer transition-colors
            ${
              selectedFile === change.path
                ? 'bg-blue-900 border-blue-700'
                : 'bg-gray-800 border-gray-700 hover:border-gray-600'
            }
          `}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-white font-mono text-sm">
                {change.path}
              </span>
              <span
                className={`
                  px-2 py-0.5 text-xs rounded
                  ${change.status === 'added' && 'bg-green-900 text-green-200'}
                  ${change.status === 'modified' && 'bg-yellow-900 text-yellow-200'}
                  ${change.status === 'deleted' && 'bg-red-900 text-red-200'}
                  ${change.status === 'renamed' && 'bg-purple-900 text-purple-200'}
                `}
              >
                {change.status}
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-green-400">+{change.additions}</span>
              <span className="text-red-400">-{change.deletions}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
```

### 2.3 Integrate with GraphStage

Update `CommitGraphView` to show details panel when commit is selected:

```typescript
export function CommitGraphView({
  repositoryId,
  options,
}: CommitGraphViewProps) {
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null)
  const { graphResult } = useCommitGraph(repositoryId, options)

  return Result.builder(graphResult)
    .onSuccess((graph) => (
      <div className="flex gap-4">
        {/* Graph Stage */}
        <div className="flex-1">
          <GraphStage
            graph={graph}
            selectedCommit={selectedCommit}
            onCommitSelect={setSelectedCommit}
          />
        </div>

        {/* Details Panel */}
        {selectedCommit && (
          <div className="w-96">
            <CommitDetailsPanel
              repositoryId={repositoryId}
              commitHash={selectedCommit}
              onClose={() => setSelectedCommit(null)}
            />
          </div>
        )}
      </div>
    ))
    .render()
}
```

### 2.4 Testing Phase 2

```bash
pnpm dev

# Test:
# - Select a commit in graph
# - Details panel appears
# - Commit info displayed
# - File changes list shown
# - Tabs switch correctly
```

**Success Criteria**:
- ✅ Clicking commit opens details panel
- ✅ Commit metadata displayed correctly
- ✅ Tabs navigate between changes/diff/stats
- ✅ File selection works
- ✅ Panel can be closed

---

## Phase 3: Advanced Features

**Duration**: 8-10 hours
**Risk**: Medium
**Prerequisites**: Phases 1-2 complete

### 3.1 Search and Filter

**New file**: `src/renderer/components/source-control/GraphFilters.tsx`

```typescript
interface GraphFiltersProps {
  onSearch: (query: string) => void
  onBranchFilter: (branches: string[]) => void
  onAuthorFilter: (authors: string[]) => void
  branches: string[]
  authors: string[]
}

export function GraphFilters({
  onSearch,
  onBranchFilter,
  onAuthorFilter,
  branches,
  authors,
}: GraphFiltersProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedBranches, setSelectedBranches] = useState<string[]>([])
  const [selectedAuthors, setSelectedAuthors] = useState<string[]>([])

  return (
    <div className="flex items-center gap-4 p-4 bg-gray-800 rounded-lg">
      {/* Search */}
      <input
        type="text"
        placeholder="Search commits..."
        value={searchQuery}
        onChange={(e) => {
          setSearchQuery(e.target.value)
          onSearch(e.target.value)
        }}
        className="flex-1 px-4 py-2 bg-gray-900 border border-gray-700 rounded text-white"
      />

      {/* Branch Filter */}
      <select
        multiple
        value={selectedBranches}
        onChange={(e) => {
          const values = Array.from(e.target.selectedOptions, opt => opt.value)
          setSelectedBranches(values)
          onBranchFilter(values)
        }}
        className="px-4 py-2 bg-gray-900 border border-gray-700 rounded text-white"
      >
        {branches.map((branch) => (
          <option key={branch} value={branch}>{branch}</option>
        ))}
      </select>

      {/* Author Filter */}
      <select
        multiple
        value={selectedAuthors}
        onChange={(e) => {
          const values = Array.from(e.target.selectedOptions, opt => opt.value)
          setSelectedAuthors(values)
          onAuthorFilter(values)
        }}
        className="px-4 py-2 bg-gray-900 border border-gray-700 rounded text-white"
      >
        {authors.map((author) => (
          <option key={author} value={author}>{author}</option>
        ))}
      </select>
    </div>
  )
}
```

### 3.2 Context Menu

**New file**: `src/renderer/components/source-control/CommitContextMenu.tsx`

```typescript
interface CommitContextMenuProps {
  commitHash: string
  x: number
  y: number
  onClose: () => void
  onCheckout?: (hash: string) => void
  onCherryPick?: (hash: string) => void
  onRevert?: (hash: string) => void
  onCreateBranch?: (hash: string) => void
  onCopyHash?: (hash: string) => void
}

export function CommitContextMenu({
  commitHash,
  x,
  y,
  onClose,
  onCheckout,
  onCherryPick,
  onRevert,
  onCreateBranch,
  onCopyHash,
}: CommitContextMenuProps) {
  const menuItems = [
    { label: 'Checkout', action: onCheckout, icon: '🔀' },
    { label: 'Cherry Pick', action: onCherryPick, icon: '🍒' },
    { label: 'Revert', action: onRevert, icon: '↩️' },
    { label: 'Create Branch', action: onCreateBranch, icon: '🌿' },
    { label: 'Copy Hash', action: onCopyHash, icon: '📋' },
  ]

  return (
    <div
      className="absolute bg-gray-800 border border-gray-700 rounded shadow-lg z-50"
      style={{ left: x, top: y }}
      onMouseLeave={onClose}
    >
      {menuItems.map((item) => (
        <button
          key={item.label}
          onClick={() => {
            item.action?.(commitHash)
            onClose()
          }}
          className="w-full px-4 py-2 text-left text-white hover:bg-gray-700 flex items-center gap-2"
        >
          <span>{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  )
}
```

### 3.3 Graph Settings

**New file**: `src/renderer/components/source-control/GraphSettings.tsx`

```typescript
interface GraphSettings {
  maxCommits: number
  showRefs: boolean
  showMergeCommits: boolean
  laneColors: string[]
}

export function GraphSettingsPanel({
  settings,
  onChange,
}: {
  settings: GraphSettings
  onChange: (settings: GraphSettings) => void
}) {
  return (
    <div className="p-4 bg-gray-800 rounded-lg space-y-4">
      <h3 className="text-lg font-semibold text-white">Graph Settings</h3>

      <div>
        <label className="block text-sm text-gray-400 mb-2">
          Max Commits
        </label>
        <input
          type="number"
          value={settings.maxCommits}
          onChange={(e) =>
            onChange({ ...settings, maxCommits: parseInt(e.target.value) })
          }
          className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded text-white"
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={settings.showRefs}
          onChange={(e) =>
            onChange({ ...settings, showRefs: e.target.checked })
          }
          className="w-4 h-4"
        />
        <label className="text-sm text-gray-400">Show Refs (branches/tags)</label>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={settings.showMergeCommits}
          onChange={(e) =>
            onChange({ ...settings, showMergeCommits: e.target.checked })
          }
          className="w-4 h-4"
        />
        <label className="text-sm text-gray-400">Show Merge Commits</label>
      </div>
    </div>
  )
}
```

### 3.4 Testing Phase 3

```bash
pnpm dev

# Test:
# - Search for commits
# - Filter by branch/author
# - Right-click commit for context menu
# - Adjust graph settings
```

**Success Criteria**:
- ✅ Search filters commits in graph
- ✅ Branch filter updates graph
- ✅ Context menu shows on right-click
- ✅ Settings panel controls graph display
- ✅ All features work together

---

## Phase 4: Polish & Documentation

**Duration**: 4-6 hours
**Risk**: Low
**Prerequisites**: Phases 1-3 complete

### 4.1 Performance Optimization

**Optimizations**:
1. **PixiJS-Specific**:
   - Use object pooling for Graphics objects (reuse instead of recreate)
   - Enable cacheAsBitmap for static elements (ref labels)
   - Use culling to skip off-screen rendering
   - Leverage PixiJS Ticker for smooth 60fps rendering
2. **React Optimizations**:
   - Memoize layout calculations with useMemo
   - Use useCallback for event handlers
   - Virtualize large commit lists (only render visible nodes in viewport)
3. **Input Handling**:
   - Debounce search input (300ms)
   - Throttle zoom/pan updates
4. **Bundle Size**:
   - Import only needed PixiJS modules
   - Use tree-shaking to reduce bundle size

### 4.2 Keyboard Shortcuts

```typescript
export function useGraphKeyboardShortcuts({
  onSearch,
  onRefresh,
  onZoomIn,
  onZoomOut,
}: {
  onSearch: () => void
  onRefresh: () => void
  onZoomIn: () => void
  onZoomOut: () => void
}) {
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'f':
            e.preventDefault()
            onSearch()
            break
          case 'r':
            e.preventDefault()
            onRefresh()
            break
          case '+':
          case '=':
            e.preventDefault()
            onZoomIn()
            break
          case '-':
            e.preventDefault()
            onZoomOut()
            break
        }
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [onSearch, onRefresh, onZoomIn, onZoomOut])
}
```

### 4.3 Update Documentation

**Files to create/update**:

1. **docs/git-tree-ui-usage.md** - User guide
2. **CLAUDE.md** - Add Git Tree UI section
3. **README.md** - Feature list

**Example: docs/git-tree-ui-usage.md**

```markdown
# Git Tree Visual Graph Usage Guide

## Overview

The Git Tree visual graph provides an interactive, visual representation of your repository's commit history.

## Features

- **Visual Commit Graph**: See your commits as a graph with branches and merges
- **Interactive Selection**: Click commits to view details
- **Search & Filter**: Find commits by message, author, or branch
- **Context Menu**: Right-click for git operations
- **Zoom & Pan**: Navigate large histories easily

## Keyboard Shortcuts

- `Ctrl+F` - Focus search
- `Ctrl+R` - Refresh graph
- `Ctrl++` - Zoom in
- `Ctrl+-` - Zoom out

## Graph Layout

- **Lanes**: Each branch gets its own vertical lane
- **Colors**: Lanes use different colors for clarity
- **Merge Commits**: Thick lines indicate merges
- **Refs**: Branches and tags shown as labels

## Commit Details Panel

Select a commit to view:
- **Info**: Hash, author, date, message
- **Changes**: List of modified files
- **Diff**: File-by-file diff view
- **Stats**: Commit statistics
```

### 4.4 Testing & QA

**Test matrix**:
- [ ] Large repository (10k+ commits)
- [ ] Repository with many branches
- [ ] Repository with merge commits
- [ ] Search performance
- [ ] Zoom/pan smooth
- [ ] Memory usage acceptable

### 4.5 Final Verification

```bash
# Clean build
pnpm clean:dev
pnpm compile:app

# Full test suite
pnpm test

# Run app
pnpm dev

# Test all features:
# - Select repository
# - View graph
# - Select commits
# - Search/filter
# - Context menu
# - Settings
```

**Success Criteria**:
- ✅ All features functional
- ✅ Performance acceptable
- ✅ Documentation complete
- ✅ No memory leaks
- ✅ Keyboard shortcuts work

---

## File Migration

### Move Legacy Files to Archive

After completion, move old planning files:

```bash
# Move git-tree legacy files
mv docs/git-tree-plan.md docs/archive-legacy/
mv docs/git-tree-progress.md docs/archive-legacy/
mv docs/git-tree-implementation-prompts.md docs/archive-legacy/
mv docs/GitTreeOriginalSource.txt docs/archive-legacy/
```

---

## Success Metrics

### Code Additions

**Target**: ~2,000 lines of new UI code

| Component | Estimated Lines |
|-----------|----------------|
| Graph Rendering | 800 lines |
| Details Panel | 600 lines |
| Filters & Search | 300 lines |
| Settings & Context | 200 lines |
| Documentation | 100 lines |
| **Total** | **2,000 lines** |

### Performance Benchmarks

**Measure**:
- Render time for 1,000 commits: < 100ms
- Graph interaction responsiveness: < 16ms (60fps)
- Memory usage for 10k commits: < 50MB

---

## Timeline & Milestones

### Day 1: Foundation (8-10 hours)
- ✅ Phase 1: Canvas Graph Renderer
- **Milestone**: Visual graph rendering works

### Day 2: Interactivity (6-8 hours)
- ✅ Phase 2: Commit Details Panel
- **Milestone**: Click commit to view details

### Day 3: Features (8-10 hours)
- ✅ Phase 3: Advanced Features
- **Milestone**: Search, filter, context menu

### Day 4: Polish (4-6 hours)
- ✅ Phase 4: Polish & Documentation
- **Milestone**: Production-ready feature

---

## Next Steps

1. ✅ Read and understand this plan
2. ✅ Create progress tracker (`git-tree-ui-progress.md`)
3. ✅ Create implementation log (`git-tree-ui-log.md`)
4. ✅ Start Phase 1 (Canvas Renderer)
5. ✅ Test and iterate
6. ✅ Move to Phase 2

---

## Reference Materials

- **Original Source**: `docs/GitTreeOriginalSource.txt` (vscode-git-graph)
- **Backend**: `src/main/source-control/services/commit-graph-service.ts`
- **Frontend**: `src/renderer/components/source-control/CommitGraph.tsx`
- **Schemas**: `src/shared/schemas/source-control/commit-graph.ts`
