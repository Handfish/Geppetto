# Git Tree Visual Graph - Implementation Prompts

This document contains detailed prompts for implementing each phase of the Git Tree visual graph feature. Use these prompts with Claude Code to implement the feature step-by-step.

---

## Phase 1: PixiJS Graph Renderer

### Prompt 1.1: Install Dependencies and Create Types

```
I need to install PixiJS dependencies and create type definitions for the visual git graph renderer.

Requirements:
1. Install dependencies:
   pnpm add @pixi/react pixi.js

2. Create src/renderer/components/source-control/graph/types.ts
3. Define GraphNode interface with:
   - Commit data (from existing Commit type)
   - Visual properties (x, y, lane, color)
   - UI state (highlighted, selected)
4. Define GraphEdge interface for connecting commits
5. Define GraphLayout interface for the complete graph structure
6. Define GraphTheme interface for visual styling (note: colors are hex numbers for PixiJS, not CSS strings)
7. Define GraphViewport interface for zoom/pan state (x, y, scale)

Use Effect Schema where appropriate for runtime validation. Import existing types from shared/schemas/source-control.

**PixiJS-Specific Notes**:
- Colors in PixiJS are hex numbers (e.g., 0xFF0000 for red) not CSS strings
- Coordinates are in pixels from top-left origin
- Interactive properties are set on Graphics objects

Reference:
- src/shared/schemas/source-control/commit-graph.ts (existing CommitGraph type)
- src/shared/schemas/source-control/commit.ts (existing Commit type)
- @pixi/react documentation for component patterns
```

### Prompt 1.2: Implement Graph Layout Engine

```
I need to implement a graph layout algorithm that converts the backend CommitGraph (which has column assignments) into a visual layout with x/y coordinates.

Requirements:
1. Create src/renderer/components/source-control/graph/GraphLayout.ts
2. Implement GraphLayoutEngine class that:
   - Takes a CommitGraph from backend
   - Uses existing column assignments as lanes
   - Calculates x/y positions based on lane and row
   - Assigns colors to lanes (cycling through a palette)
   - Generates edges between parent-child commits
   - Returns a GraphLayout object
3. Use the GraphTheme for dimensions (laneWidth, rowHeight, etc.)
4. Handle merge commits (isMerge flag on edges)

The backend already provides:
- node.column (lane assignment)
- graph.edges (parent-child relationships)
- node.isHead (HEAD indicator)

Transform this into visual coordinates for canvas rendering.
```

### Prompt 1.3: Create Graph Theme Configuration

```
I need to create a theme configuration for the graph renderer with sensible defaults and support for customization.

Requirements:
1. Create src/renderer/components/source-control/graph/GraphTheme.ts
2. Define defaultTheme constant with:
   - Node dimensions (radius, spacing)
   - Lane dimensions (width, height)
   - Colors as hex numbers (8 lane colors for cycling, highlight color, HEAD color)
   - Typography (font family, sizes)
3. Export a function to create custom themes
4. Convert Tailwind colors to hex numbers for PixiJS

**Important**: PixiJS uses hex color numbers (e.g., 0x1f2937 for gray-800), not CSS strings.
The theme should support dark mode (we use dark mode throughout the app).
Lane colors should be distinct and accessible.

**Example Tailwind to PixiJS color conversions**:
- gray-800: 0x1f2937
- blue-500: 0x3b82f6
- purple-500: 0xa855f7
- green-500: 0x22c55e
```

### Prompt 1.4: Implement PixiJS Components

```
I need to implement PixiJS React components for rendering graph elements.

Requirements:
1. Create src/renderer/components/source-control/graph/CommitNode.tsx
   - Use @pixi/react's Graphics component
   - Props: node (GraphNode), theme, isSelected, onSelect
   - Use useCallback for draw function
   - Draw filled circle with node color
   - Draw selection ring if selected (lineStyle with highlight color)
   - Draw HEAD indicator if isHead (smaller inner circle)
   - Make interactive with g.interactive = true
   - Add pointerdown event handler to call onSelect

2. Create src/renderer/components/source-control/graph/CommitEdge.tsx
   - Use Graphics component
   - Props: edge (GraphEdge), theme, fromNode, toNode
   - Draw straight line if same lane
   - Draw bezier curve if lane change (use g.bezierCurveTo)
   - Use thicker line for merge commits
   - Use edge color

3. Create src/renderer/components/source-control/graph/RefLabel.tsx
   - Use Container, Graphics, and Text components
   - Draw rounded rectangle background (Graphics)
   - Draw text label (Text component with style object)
   - Position next to commit node

**PixiJS API notes**:
- Graphics.draw function receives a PIXI.Graphics instance
- Always call g.clear() at start of draw function
- Colors are hex numbers (0xRRGGBB)
- Text style uses object notation (fill: 0xFFFFFF, fontSize: 12)
- Make graphics interactive: g.interactive = true, g.buttonMode = true
```

### Prompt 1.5: Create GraphStage Component

```
I need to create the main PixiJS Stage component that renders the commit graph.

Requirements:
1. Create src/renderer/components/source-control/graph/GraphStage.tsx
2. Implement GraphStage functional component with:
   - Props: graph (CommitGraph), selectedCommit, onCommitSelect, width, height
   - Import Stage, Container from @pixi/react
   - Import CommitNode, CommitEdge, RefLabel components
   - Viewport state (x, y, scale)
   - useMemo for layout calculation (GraphLayoutEngine)
3. Render structure:
   - Stage component as root (with width, height, options)
   - Container for viewport transform (x, y, scale props)
   - Map edges to CommitEdge components (render first, behind nodes)
   - Map nodes to CommitNode components
   - Map refs to RefLabel components
4. Wheel handler for zoom:
   - Use onWheel prop on Stage
   - Update viewport.scale
   - Clamp between 0.5 and 2.0
   - Prevent default behavior
5. Stage options:
   - backgroundColor: 0x1f2937 (gray-800 for dark mode)
   - antialias: true for smooth rendering

**PixiJS React notes**:
- Stage is the root renderer component
- Container is for grouping and transforms
- Use scale={{ x: scale, y: scale }} for uniform scaling
- Components automatically re-render when props change
- Click handling is done in CommitNode via pointerdown events

Follow existing patterns from src/renderer/components/source-control/CommitGraph.tsx for integration with Effect Atoms.
```

### Prompt 1.6: Update CommitGraphView to Use PixiJS

```
I need to update the existing CommitGraphView component to use the new GraphStage renderer instead of the simple list.

Requirements:
1. Update src/renderer/components/source-control/CommitGraph.tsx
2. Import GraphStage component
3. Add selectedCommit state
4. Replace the current list-based rendering with GraphStage
5. Keep the Result.builder pattern for error handling
6. Maintain existing props (repositoryId, options)
7. Add onCommitSelect handler that updates selectedCommit state
8. The component should still work in the SourceControlDevPanel

**Note**: Make sure PixiJS is properly rendering:
- Stage should have explicit width and height
- backgroundColor should be set for visibility
- Check browser console for PixiJS initialization messages

Preserve all existing error handling and loading states.
```

---

## Phase 2: Commit Details Panel

### Prompt 2.1: Create Commit Details Panel Structure

```
I need to create the commit details panel that displays detailed information about a selected commit.

Requirements:
1. Create folder structure:
   - src/renderer/components/source-control/details/
2. Create CommitDetailsPanel.tsx with:
   - Props: repositoryId, commitHash, onClose
   - Tabs: Changes, Diff, Stats
   - Uses useCommit hook to fetch commit data
   - Result.builder pattern for error handling
   - Clean close button
3. Create placeholder components:
   - CommitInfo.tsx (displays hash, author, message, date)
   - FileChangesList.tsx (placeholder for file changes)
   - DiffViewer.tsx (placeholder for diff view)
   - StatsView.tsx (placeholder for statistics)

Use existing patterns from src/renderer/components/source-control/ components.
Follow the dark theme styling (gray-800, gray-900 backgrounds).
```

### Prompt 2.2: Implement Commit Info Display

```
I need to implement the CommitInfo component that displays commit metadata.

Requirements:
1. Create src/renderer/components/source-control/details/CommitInfo.tsx
2. Display:
   - Commit hash (full and short)
   - Author name and email
   - Commit date (formatted)
   - Commit message (subject and body)
   - Parent commits (as links/buttons)
   - Copy hash button
3. Use Effect Schema to validate the commit data structure
4. Follow Tailwind styling conventions
5. Make parent hashes clickable (emit event to view parent)

The Commit type is already defined in shared/schemas/source-control/commit.ts.
```

### Prompt 2.3: Create File Changes List Component

```
I need to create a component that displays the list of files changed in a commit.

Requirements:
1. Create src/renderer/components/source-control/details/FileChangesList.tsx
2. For now, create a placeholder that shows:
   - Message that file diff feature needs backend support
   - Mock data structure for FileChange interface
   - UI layout for how file changes will be displayed
3. FileChange interface should include:
   - path (string)
   - status (added | modified | deleted | renamed)
   - additions (number)
   - deletions (number)
4. UI should show:
   - File path with icon
   - Status badge (color-coded)
   - +/- stats
   - Click to select file for diff view
5. Add TODO comment noting we need to implement getDiff IPC handler

Follow the pattern of other list components (like BranchList.tsx).
```

### Prompt 2.4: Integrate Details Panel with Graph

```
I need to integrate the commit details panel with the PixiJS graph stage in a side-by-side layout.

Requirements:
1. Update src/renderer/components/source-control/CommitGraph.tsx (CommitGraphView)
2. When a commit is selected:
   - Show CommitDetailsPanel to the right of the graph
   - Pass repositoryId and commitHash
   - Pass onClose handler to clear selection
3. Layout should be:
   - Flex container with gap
   - Graph takes flex-1 (remaining space)
   - Details panel has fixed width (w-96 = 384px)
4. Details panel should be conditional:
   - Only render when selectedCommit is not null
   - Smoothly appear/disappear
5. The GraphStage already highlights selected commit via isSelected prop in CommitNode

**PixiJS Note**: Selection highlighting is handled in CommitNode component via isSelected prop.
The component automatically re-renders when selectedCommit changes.

Maintain responsive design and ensure it works in the SourceControlDevPanel.
```

---

## Phase 3: Advanced Features

### Prompt 3.1: Create Search and Filter Component

```
I need to create a filter bar component for searching and filtering commits in the graph.

Requirements:
1. Create src/renderer/components/source-control/GraphFilters.tsx
2. Implement GraphFilters component with:
   - Search input (filters by commit message)
   - Branch filter (multi-select dropdown)
   - Author filter (multi-select dropdown)
   - Clear filters button
3. Props:
   - onSearch: (query: string) => void
   - onBranchFilter: (branches: string[]) => void
   - onAuthorFilter: (authors: string[]) => void
   - branches: string[] (available branches)
   - authors: string[] (available authors)
4. Filters should update GraphOptions that get passed to the backend
5. Use debounce for search input (300ms)
6. Styling should match the rest of the app

The backend CommitGraphService already supports filtering via GraphOptions.
Pass the filtered options to useCommitGraph hook.
```

### Prompt 3.2: Implement Context Menu

```
I need to create a context menu that appears when right-clicking a commit in the graph.

Requirements:
1. Create src/renderer/components/source-control/CommitContextMenu.tsx
2. Implement CommitContextMenu component with:
   - Props: commitHash, x, y, onClose, action callbacks
   - Menu items:
     - Checkout commit
     - Cherry-pick commit
     - Revert commit
     - Create branch from commit
     - Copy commit hash
   - Absolute positioning at (x, y)
   - Close on click outside or on item click
3. Add right-click handler to CommitNode component:
   - In the draw callback, add: g.on('rightdown', (event) => onRightClick(event))
   - Pass onRightClick as a prop from GraphStage
   - Get click position from event.data.global
   - Show context menu at click position
   - Prevent default context menu if possible
4. For now, action callbacks can be placeholders
   - Log the action and commit hash
   - Add TODO for implementing IPC handlers

**PixiJS Event Handling**:
- Use 'rightdown' event on Graphics for right-click
- Event has .data.global property with { x, y } screen coordinates
- Make sure graphics is interactive (g.interactive = true)

Use React portals for rendering the menu above other content.
Follow Tailwind styling for dropdowns/menus.
```

### Prompt 3.3: Create Graph Settings Panel

```
I need to create a settings panel for configuring graph display options.

Requirements:
1. Create src/renderer/components/source-control/GraphSettings.tsx
2. Implement GraphSettings interface with Effect Schema:
   - maxCommits: number (range: 10-1000)
   - showRefs: boolean
   - showMergeCommits: boolean
   - compactMode: boolean
   - laneColors: string[]
3. Create GraphSettingsPanel component with:
   - Collapsible panel or modal
   - Input controls for each setting
   - Preview of lane colors
   - Save/Cancel buttons
   - Reset to defaults
4. Persist settings to localStorage using Effect
5. Load settings on mount
6. Apply settings to GraphOptions and GraphTheme

Use Effect Schema to validate settings before saving.
```

### Prompt 3.4: Integrate All Advanced Features

```
I need to integrate search, filters, context menu, and settings into the main graph view.

Requirements:
1. Update src/renderer/components/source-control/CommitGraph.tsx
2. Add GraphFilters component above the graph stage
3. Extract unique branches and authors from graph data
4. Wire up filter callbacks to update GraphOptions
5. Add settings button to open GraphSettingsPanel
6. Pass settings to GraphStage (for theme customization)
7. Ensure all features work together:
   - Filters update the graph (GraphOptions triggers new data fetch)
   - Context menu works on filtered graph
   - Settings persist across sessions
   - Selected commit preserved when filtering
   - PixiJS Stage properly re-renders on data changes

**PixiJS Notes**:
- Stage automatically re-renders when child components' props change
- useMemo layout calculation prevents unnecessary recalculations
- Theme changes trigger re-render of all visual components

Test with different filter combinations to ensure correct behavior.
```

---

## Phase 4: Polish & Documentation

### Prompt 4.1: Implement Performance Optimizations

```
I need to optimize the PixiJS graph renderer for performance with large repositories.

Requirements:
1. **PixiJS-Specific Optimizations**:
   - Enable cacheAsBitmap for static elements (RefLabel components)
   - Use object pooling for Graphics if rendering 1000+ commits
   - Implement viewport culling (only render visible commits)
   - Use PixiJS Ticker for performance monitoring

2. **React Optimizations**:
   - Memoize layout calculations using useMemo
   - Use React.memo for CommitNode, CommitEdge components
   - useCallback for all event handlers
   - Only re-render when necessary props change

3. **Layout Engine**:
   - Cache layout results
   - Implement incremental updates for small changes
   - Skip re-calculation if graph data unchanged

4. **Viewport Culling**:
   - Filter nodes/edges to only those in visible viewport
   - Update culling on pan/zoom
   - Use bounds checking: node.x/y vs viewport

5. **Performance Monitoring**:
   - Use PixiJS.Ticker.shared for FPS tracking
   - Measure layout calculation time
   - Log metrics in dev mode only
   - Add debug overlay showing FPS and commit count

6. **Bundle Size**:
   - Import only required PixiJS modules
   - Use tree-shaking
   - Consider code-splitting for graph feature

**PixiJS Performance Notes**:
- PixiJS already uses requestAnimationFrame via Ticker
- WebGL rendering is much faster than Canvas 2D
- cacheAsBitmap converts display objects to textures (fast but uses more memory)
- Culling is critical for 1000+ commits

Target performance:
- 1000 commits: <100ms layout + <16ms render (60fps)
- Graph interactions: <16ms (60fps maintained)
- Memory usage (10k commits): <80MB (PixiJS uses more than Canvas but faster)

Profile with:
- React DevTools Profiler
- Chrome Performance tab
- PixiJS.utils.sayHello() shows renderer info
```

### Prompt 4.2: Add Keyboard Shortcuts

```
I need to implement keyboard shortcuts for common graph operations.

Requirements:
1. Create src/renderer/hooks/useGraphKeyboardShortcuts.ts
2. Implement custom hook with shortcuts:
   - Ctrl/Cmd+F: Focus search input
   - Ctrl/Cmd+R: Refresh graph
   - Ctrl/Cmd++: Zoom in
   - Ctrl/Cmd+-: Zoom out
   - Ctrl/Cmd+0: Reset zoom
   - Escape: Clear selection / close details panel
   - Arrow keys: Navigate between commits (optional)
3. Use useEffect to register/unregister event listeners
4. Prevent default browser behavior for shortcuts
5. Display shortcuts in a help tooltip or modal

Follow keyboard shortcut patterns from existing components.
```

### Prompt 4.3: Create User Documentation

```
I need to create comprehensive user documentation for the Git Tree visual graph feature.

Requirements:
1. Create docs/git-tree-ui-usage.md with:
   - Overview of the feature
   - Getting started guide
   - Feature descriptions (graph, details, filters, etc.)
   - Keyboard shortcuts reference
   - Tips and best practices
   - Troubleshooting common issues
2. Update CLAUDE.md:
   - Add "Git Tree Visual Graph" section
   - Document component architecture
   - Document integration points
   - Add developer notes
3. Update README.md:
   - Add Git Tree to feature list
   - Add screenshot/demo (when available)

Use clear, concise language. Include code examples where appropriate.
Follow the existing documentation style.
```

### Prompt 4.4: Comprehensive Testing

```
I need to create a comprehensive test suite for the git tree UI components.

Requirements:
1. Test GraphLayoutEngine:
   - Layout calculation correctness
   - Edge cases (single commit, many branches, etc.)
   - Performance with large graphs
2. Test GraphRenderer:
   - Canvas drawing correctness
   - Viewport transforms
   - Node/edge positioning
3. Test GraphCanvas component:
   - Mouse interactions
   - Zoom/pan behavior
   - Commit selection
4. Test integration:
   - Full flow from repository selection to graph display
   - Filter application
   - Context menu actions
5. Create test repositories with:
   - Simple linear history
   - Many branches
   - Merge commits
   - Large commit count (1000+)

Use existing test patterns from the codebase.
Add performance benchmarks.
```

### Prompt 4.5: Final Polish and QA

```
I need to perform a final polish pass on the git tree UI feature to ensure production readiness.

Requirements:
1. Code review checklist:
   - Remove all console.logs (or make them conditional on dev mode)
   - Add JSDoc comments to public APIs
   - Ensure TypeScript strict mode compliance
   - Fix any ESLint warnings
   - Remove unused imports and variables
2. UI/UX polish:
   - Consistent spacing and alignment
   - Smooth transitions and animations
   - Loading states for all async operations
   - Error states with helpful messages
   - Empty states with guidance
3. Accessibility:
   - Keyboard navigation works
   - Screen reader friendly (ARIA labels)
   - Sufficient color contrast
   - Focus indicators visible
4. Cross-platform testing:
   - Test on macOS
   - Test on Linux
   - Test on Windows (if available)
5. Create final verification checklist:
   - All features functional
   - Performance targets met
   - Documentation complete
   - No memory leaks
   - Clean git history

Test the feature end-to-end as a real user would.
```

---

## Effect Schema Integration Patterns

### Pattern 1: Validating Graph Settings

```typescript
import { Schema as S } from 'effect'

// Define schema for graph settings with validation
export const GraphSettingsSchema = S.Struct({
  maxCommits: S.Number.pipe(
    S.int(),
    S.greaterThanOrEqualTo(10),
    S.lessThanOrEqualTo(1000)
  ),
  showRefs: S.Boolean,
  showMergeCommits: S.Boolean,
  compactMode: S.Boolean,
  laneColors: S.Array(S.String).pipe(
    S.minItems(4),
    S.maxItems(16)
  )
})

export type GraphSettings = S.Schema.Type<typeof GraphSettingsSchema>

// Save settings with validation
export const saveSettings = (settings: unknown) =>
  Effect.gen(function* () {
    const validated = yield* S.decodeUnknown(GraphSettingsSchema)(settings)
    localStorage.setItem('graph-settings', JSON.stringify(validated))
    return validated
  })

// Load settings with validation and fallback
export const loadSettings = () =>
  Effect.gen(function* () {
    const stored = localStorage.getItem('graph-settings')
    if (!stored) return defaultSettings

    const parsed = JSON.parse(stored)
    const validated = yield* S.decodeUnknown(GraphSettingsSchema)(parsed).pipe(
      Effect.catchAll(() => Effect.succeed(defaultSettings))
    )
    return validated
  })
```

### Pattern 2: Validating Layout Dimensions

```typescript
import { Schema as S } from 'effect'

export const GraphThemeSchema = S.Struct({
  nodeRadius: S.Number.pipe(S.greaterThan(0)),
  laneWidth: S.Number.pipe(S.greaterThan(0)),
  rowHeight: S.Number.pipe(S.greaterThan(0)),
  commitSpacing: S.Number.pipe(S.greaterThanOrEqualTo(0)),
  laneColors: S.Array(S.String).pipe(S.nonEmpty()),
  highlightColor: S.String,
  headColor: S.String,
  fontFamily: S.String,
  fontSize: S.Number.pipe(S.greaterThan(0))
})

export type GraphTheme = S.Schema.Type<typeof GraphThemeSchema>
```

### Pattern 3: Runtime Validation of Graph Data

```typescript
import { Schema as S } from 'effect'

// Validate layout before rendering
export const validateLayout = (layout: unknown) =>
  Effect.gen(function* () {
    const GraphNodeSchema = S.Struct({
      commit: S.Any, // Use existing Commit schema
      refs: S.Array(S.String),
      isHead: S.Boolean,
      x: S.Number,
      y: S.Number,
      lane: S.Number.pipe(S.int(), S.greaterThanOrEqualTo(0)),
      color: S.String,
      highlighted: S.Boolean
    })

    const GraphLayoutSchema = S.Struct({
      nodes: S.Map(S.String, GraphNodeSchema),
      edges: S.Array(S.Any), // Define edge schema
      totalLanes: S.Number.pipe(S.int(), S.greaterThan(0)),
      totalHeight: S.Number.pipe(S.greaterThanOrEqualTo(0))
    })

    return yield* S.decodeUnknown(GraphLayoutSchema)(layout)
  })
```

---

## Best Practices

### 1. Use Effect for Side Effects

```typescript
// Good: Use Effect for localStorage operations
const loadSettings = () =>
  Effect.gen(function* () {
    const stored = yield* Effect.sync(() =>
      localStorage.getItem('graph-settings')
    )
    if (!stored) return defaultSettings
    return yield* parseAndValidate(stored)
  })

// Bad: Direct side effects
const loadSettings = () => {
  const stored = localStorage.getItem('graph-settings')
  return stored ? JSON.parse(stored) : defaultSettings
}
```

### 2. Validate External Data

```typescript
// Good: Validate data from localStorage
const loadGraphSettings = () =>
  Effect.gen(function* () {
    const raw = yield* getFromLocalStorage('graph-settings')
    const validated = yield* S.decodeUnknown(GraphSettingsSchema)(raw)
    return validated
  }).pipe(
    Effect.catchAll(() => Effect.succeed(defaultSettings))
  )

// Bad: Trust external data
const loadGraphSettings = () => {
  return JSON.parse(localStorage.getItem('graph-settings')!)
}
```

### 3. Use Result Pattern for UI

```typescript
// Good: Use Result.builder for exhaustive error handling
{Result.builder(settingsResult)
  .onInitial(() => <LoadingSpinner />)
  .onErrorTag('ParseError', (error) => (
    <ErrorAlert message="Invalid settings, using defaults" />
  ))
  .onSuccess((settings) => (
    <GraphCanvas theme={createTheme(settings)} />
  ))
  .render()}

// Bad: Assume success
const settings = settingsResult as GraphSettings
return <GraphCanvas theme={createTheme(settings)} />
```

---

## Common Gotchas

### 1. PixiJS Coordinate Systems

**Issue**: PixiJS containers have their own coordinate space after transforms
**Solution**: PixiJS handles this automatically with Container transforms. No manual conversion needed for hit detection.
```typescript
// PixiJS handles coordinate transforms automatically
// Events use local coordinates relative to the interactive object
g.on('pointerdown', (event) => {
  // event.data.global - screen coordinates
  // event.data.local - local coordinates (relative to container)
  const localPos = event.data.getLocalPosition(g.parent)
})
```

### 2. React Hooks Rules

**Issue**: Hooks called conditionally or after early returns
**Solution**: Move all hooks before any conditional returns
```typescript
// Good
const GraphCanvas = ({ graph }) => {
  const [viewport, setViewport] = useState(defaultViewport)
  const layoutEngine = useMemo(() => new GraphLayoutEngine(), [])

  if (!graph) return null
  // ...
}

// Bad
const GraphCanvas = ({ graph }) => {
  if (!graph) return null

  const [viewport, setViewport] = useState(defaultViewport) // ❌ Hook after return
}
```

### 3. Effect Schema Branded Types

**Issue**: CommitHash and BranchName are branded types from backend
**Solution**: Extract the underlying string value when needed
```typescript
// Backend type
const hash: CommitHash = node.commit.hash

// Extract value for canvas rendering
const hashString: string = hash // Branded types coerce to string
// Or explicitly:
const hashString: string = node.commit.hash.value // If using value object
```

### 4. PixiJS Graphics Clear

**Issue**: Graphics not clearing before redraw, causing visual artifacts
**Solution**: Always call g.clear() at the start of draw functions
```typescript
// Good
const drawNode = useCallback((g: PIXI.Graphics) => {
  g.clear()  // Always clear first!
  g.beginFill(0xFF0000)
  g.drawCircle(0, 0, 10)
  g.endFill()
}, [])

// Bad
const drawNode = useCallback((g: PIXI.Graphics) => {
  // Missing g.clear() - will draw on top of previous render
  g.beginFill(0xFF0000)
  g.drawCircle(0, 0, 10)
})
```

### 5. PixiJS Color Format

**Issue**: Using CSS color strings instead of hex numbers
**Solution**: Convert colors to hex format
```typescript
// Good
g.beginFill(0x3b82f6)  // Hex number for blue-500

// Bad
g.beginFill('#3b82f6')  // CSS string - won't work!
g.beginFill('rgb(59, 130, 246)')  // Also won't work

// Utility function for conversion
function cssToHex(css: string): number {
  const hex = css.replace('#', '')
  return parseInt(hex, 16)
}
```

### 6. Memoization Dependencies

**Issue**: GraphOptions object recreated on every render
**Solution**: Memoize options object
```typescript
// Good
const options = useMemo(
  () => ({ maxCommits: 20, layoutAlgorithm: 'topological' as const }),
  []
)
const { graphResult } = useCommitGraph(repositoryId, options)

// Bad
const { graphResult } = useCommitGraph(repositoryId, {
  maxCommits: 20,  // New object every render!
  layoutAlgorithm: 'topological'
})
```

---

## Reference Files

### Backend Files (Read-Only)
- `src/main/source-control/services/commit-graph-service.ts` - Graph building logic
- `src/main/source-control/domain/aggregates/commit-graph.ts` - CommitGraph aggregate
- `src/shared/schemas/source-control/commit-graph.ts` - Graph schemas
- `src/shared/schemas/source-control/commit.ts` - Commit schemas

### Frontend Files (For Pattern Reference)
- `src/renderer/components/source-control/CommitGraph.tsx` - Current list-based view
- `src/renderer/components/source-control/BranchList.tsx` - List component pattern
- `src/renderer/hooks/useSourceControl.ts` - Source control hooks
- `src/renderer/atoms/source-control-atoms.ts` - Atoms definition

### Documentation
- `docs/git-tree-ui-plan.md` - This implementation plan
- `docs/git-tree-ui-progress.md` - Track your progress
- `docs/git-tree-ui-log.md` - Log your findings
- `docs/RESULT_API_AND_ERROR_HANDLING.md` - Result.builder patterns
- `docs/EFFECT_ATOM_IPC_GUIDE.md` - Effect Atom patterns

---

## Quick Start

To begin implementation, use this prompt:

```
I want to implement the Git Tree visual graph renderer using PixiJS and @pixi/react. Let's start with Phase 1.

Please read:
1. docs/git-tree-ui-plan.md - The implementation plan
2. docs/git-tree-ui-prompts.md - Implementation prompts (this file)
3. src/shared/schemas/source-control/commit-graph.ts - Existing graph schema
4. src/renderer/components/source-control/CommitGraph.tsx - Current implementation

Then execute Prompt 1.1 to:
1. Install @pixi/react and pixi.js dependencies
2. Create the graph rendering types

**Important notes for PixiJS**:
- Colors are hex numbers (0xFF0000), not CSS strings ('#ff0000')
- Use Stage component as root renderer
- Use Graphics component with draw callbacks for shapes
- Always call g.clear() at the start of draw functions
- Interactive elements need g.interactive = true

After each prompt, update docs/git-tree-ui-progress.md to track completion.
After each session, log findings in docs/git-tree-ui-log.md.
```
