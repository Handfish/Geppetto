# Git Tree Visual Graph - Usage Guide

**Version**: 1.0
**Last Updated**: 2025-10-28

---

## Overview

The Git Tree visual graph provides an interactive, hardware-accelerated visualization of your repository's commit history. Built with PixiJS and WebGL, it offers smooth rendering of large commit graphs with rich interactivity.

---

## Features

### Core Visualization
- **Interactive Commit Graph**: See your commits as a visual graph with branches and merges
- **Hardware Acceleration**: WebGL rendering via PixiJS for smooth 60fps performance
- **Topological Layout**: Automatically arranged commits with lane assignment
- **Lane Colors**: Each branch lane uses a distinct color for easy tracking

### Interactive Features
- **Click to Select**: Click any commit to view detailed information
- **Right-Click Menu**: Context menu with copy operations and future git commands
- **Mouse Wheel Zoom**: Smooth zooming (0.5x to 2.0x)
- **Hover Feedback**: Visual feedback when hovering over commits

### Commit Details Panel
- **Commit Information**: Hash, author, date, commit message, parent commits
- **File Changes**: View all modified files with status badges (Added/Modified/Deleted/Renamed)
- **Statistics**: Line additions/deletions count per file
- **Tabs Interface**: Navigate between Changes, Diff, and Stats views

### Search & Filtering
- **Real-Time Search**: Instant client-side filtering of commits by message, hash, or content
- **Author Filter**: Show commits by specific authors
- **Branch Filter**: Multi-select branches to display
- **Max Commits Slider**: Control number of commits shown (10-200)
- **Active Filter Indicator**: Visual count of active filters

### Display Settings
- **Show/Hide Refs**: Toggle branch and tag labels
- **Show/Hide Merge Commits**: Filter out merge commits for cleaner history
- **Show Commit Messages**: (Future) Display inline commit messages
- **Settings Persistence**: All settings automatically saved to localStorage

### Keyboard Shortcuts
- **Ctrl/Cmd + F**: Focus search input
- **Ctrl/Cmd + R**: Refresh graph
- **Ctrl/Cmd + =**: Zoom in
- **Ctrl/Cmd + -**: Zoom out
- **Ctrl/Cmd + 0**: Reset zoom to 100%
- **Escape**: Clear selection / Close panels / Blur input

---

## Getting Started

### Opening the Git Graph

1. Open Geppetto
2. Navigate to the **Source Control** tab
3. Select a repository from the **Repositories** list
4. The commit graph will automatically load

### First-Time Use

When you first open a repository:
- The graph loads with default settings (20 commits, topological layout)
- All display options are enabled (refs, merge commits visible)
- Zoom level starts at 1.0 (100%)

---

## User Interface

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│                    Git Graph Main View                          │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Commit Graph Header     [Refresh Button]                  │ │
│  └────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Filters [>]   [Search commits...]   [Clear]              │ │
│  │  ┌─────────────────────────────────────────────────────┐  │ │
│  │  │  Expanded Filters Panel (optional)                  │  │ │
│  │  │  • Author dropdown                                   │  │ │
│  │  │  • Branch multi-select                              │  │ │
│  │  │  • Max commits slider                               │  │ │
│  │  │  • Display Options (refs, merge commits)            │  │ │
│  │  │  • Reset to Defaults button                         │  │ │
│  │  └─────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────┘ │
│  ┌──────────────────────┬─────────────────────────────────────┐ │
│  │   Graph Canvas       │  Commit Details Panel (optional)    │ │
│  │                      │  ┌───────────────────────────────┐  │ │
│  │   [Commit Nodes]     │  │ Hash: abc123                  │  │ │
│  │     ├─[C2]           │  │ Author: John Doe              │  │ │
│  │     │  └─[C3]        │  │ Message: ...                  │  │ │
│  │     └─[C4]─┐         │  │ Changed Files: [3]            │  │ │
│  │         └──[C5]      │  └───────────────────────────────┘  │ │
│  │                      │  [Tabs: Changes / Diff / Stats]    │ │
│  │   [PixiJS WebGL]     │                                     │ │
│  │                      │  ┌───────────────────────────────┐  │ │
│  │                      │  │ src/main.ts      | +12 -3    │  │ │
│  │                      │  │ package.json     | +1 -0     │  │ │
│  │                      │  └───────────────────────────────┘  │ │
│  └──────────────────────┴─────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Graph Canvas Elements

- **Commit Nodes**: Colored circles representing commits
  - **Circle Color**: Based on lane assignment
  - **Inner Circle**: HEAD indicator (when applicable)
  - **Selection Ring**: Blue highlight when selected
  - **Hover Ring**: Yellow highlight on hover
- **Edges**: Lines connecting parent-child commits
  - **Straight Lines**: Same-lane commits
  - **Curved Lines**: Cross-lane merges (bezier curves)
  - **Thickness**: Thicker lines indicate merge commits
- **Ref Labels**: Branch and tag labels
  - **Purple Background**: Tag labels
  - **Text**: Branch/tag name
  - **Position**: Right of commit node

---

## Common Workflows

### Viewing Commit Details

1. **Click a commit** in the graph
2. The **Commit Details Panel** appears on the right
3. View commit information (hash, author, date, message)
4. Click the **Changes** tab to see modified files
5. Click a file to view its diff (future feature)
6. Click the **X** button to close the panel

### Searching for Commits

1. **Focus the search** input (click or press Ctrl+F)
2. **Type your search** query (commit message, hash, or content)
3. **Graph updates instantly** showing only matching commits
4. **Clear search** by clicking the X or clearing the input
5. **Escape** to blur the search input

### Filtering by Author

1. **Expand filters** by clicking the arrow (▶)
2. **Select an author** from the dropdown
3. **Graph updates** to show only that author's commits
4. **Clear filter** by selecting "All authors"

### Filtering by Branch

1. **Expand filters** panel
2. **Click branch buttons** to select/deselect
3. Multiple branches can be selected
4. **Graph updates** to show only selected branches
5. **Clear filter** by deselecting all branches

### Adjusting Max Commits

1. **Expand filters** panel
2. **Move the slider** (10-200 commits)
3. **Graph updates** instantly
4. Useful for performance with large repositories

### Toggling Display Options

1. **Expand filters** panel
2. **Scroll to Display Options** section
3. **Toggle checkboxes**:
   - **Show branch/tag labels**: Hides/shows ref labels
   - **Show merge commits**: Filters out merge commits
   - **Show commit messages**: (Future) Inline messages
4. **Graph updates** immediately

### Using the Context Menu

1. **Right-click** any commit node
2. **Context menu appears** with options:
   - **Copy Hash**: Full commit hash to clipboard
   - **Copy Short Hash**: 7-character short hash
   - **Copy Commit Message**: Full commit message
   - **View Details**: Opens commit details panel
   - **[Future]** Checkout, Cherry Pick, Revert, Create Branch, Create Tag
3. **Click outside** or press **Escape** to close

### Zooming and Navigation

**Mouse Wheel**:
- **Scroll up**: Zoom in
- **Scroll down**: Zoom out
- **Range**: 0.5x (50%) to 2.0x (200%)

**Keyboard**:
- **Ctrl/Cmd + =**: Zoom in
- **Ctrl/Cmd + -**: Zoom out
- **Ctrl/Cmd + 0**: Reset to 100%

**Pan (Future)**:
- Click and drag to pan the canvas (not yet implemented)

### Resetting Settings

1. **Expand filters** panel
2. **Scroll to bottom**
3. **Click "Reset All Settings to Defaults"**
4. All filters, display settings, and zoom level reset
5. Settings are saved to localStorage

---

## Graph Layout

### Lane Assignment

- **Lane 0** (leftmost): Main branch commits
- **Lane 1+**: Feature branches and merges
- **Lane Colors**: Rotate through 8 predefined colors
- **Algorithm**: Topological order (parents before children)

### Commit Ordering

- **Vertical**: Chronological (newest at top)
- **Horizontal**: Lane assignment based on branch structure
- **Spacing**: Fixed row height (50px) and lane width (80px)

### Merge Visualization

- **Merge Commit**: Circle with multiple parent edges
- **Merge Edge**: Bezier curve connecting lanes
- **Thickness**: Slightly thicker than normal edges

---

## Performance Tips

### For Large Repositories (10k+ commits)

1. **Reduce max commits** to 50-100 for initial load
2. **Use search/filters** to narrow down commits
3. **Hide merge commits** if not needed
4. **Zoom out** slightly for better overview
5. **Close details panel** when not in use

### For Many Branches

1. **Filter by specific branches** using branch filter
2. **Use author filter** to focus on specific contributors
3. **Hide refs** if labels clutter the view

### Smooth Performance

- **WebGL acceleration** provides 60fps rendering
- **Object culling** skips off-screen rendering (future)
- **Memoization** prevents unnecessary recalculations
- **Client-side search** avoids backend round-trips

---

## Settings Persistence

### What Gets Saved

All settings are automatically saved to `localStorage`:

- **Filter Options**: Max commits, author, branches
- **Display Settings**: Show refs, show merge commits, show messages
- **Layout**: Topological algorithm
- **Search**: (Not persisted - clears on reload)
- **Zoom**: (Not persisted - resets to 1.0)

### Storage Key

Settings are stored at: `geppetto:graph-settings`

### Schema Evolution

- Old settings merge with new defaults
- Missing fields use default values
- Prevents errors when app updates

### Manual Reset

- Use "Reset All Settings to Defaults" button
- Clears localStorage and restores hardcoded defaults

---

## Keyboard Reference Card

| Shortcut | Action | Notes |
|----------|--------|-------|
| **Ctrl/Cmd + F** | Focus search | Auto-selects input text |
| **Ctrl/Cmd + R** | Refresh graph | Overrides browser refresh |
| **Ctrl/Cmd + =** | Zoom in | Max: 2.0x |
| **Ctrl/Cmd + -** | Zoom out | Min: 0.5x |
| **Ctrl/Cmd + 0** | Reset zoom | Back to 1.0x |
| **Escape** | Clear/Close | Multi-purpose |

**Escape Key Behavior**:
- When in search input: Blur input
- When commit selected: Clear selection
- When context menu open: Close menu
- When details panel open: (No effect - use X button)

---

## Troubleshooting

### Graph Not Loading

**Symptom**: Empty graph or "No commits found"

**Possible Causes**:
1. Repository not selected
2. Repository cache not initialized
3. All commits filtered out

**Solutions**:
- Re-select repository from Repositories tab
- Click Refresh button
- Clear all filters
- Check Max Commits slider (should be > 0)

### Automatic Cache Recovery

**Symptom**: "Repository Cache Error" message

**Behavior**:
- **Automatic recovery** attempts once
- Fires `source-control:get-repository` IPC
- Retries graph load on success

**If Recovery Fails**:
- Error message shows: "Automatic cache recovery failed"
- Retry button appears
- Re-select repository from Repositories tab

### Performance Issues

**Symptom**: Laggy graph, slow zooming, low framerate

**Solutions**:
- Reduce max commits (try 20-50)
- Close details panel
- Clear search/filters
- Restart Electron app
- Check system resources (GPU usage)

### Search Not Working

**Symptom**: Search doesn't filter commits

**Check**:
- Is search text entered correctly?
- Are there matching commits?
- Try searching by commit hash (more specific)

**Note**: Search is case-insensitive

### Filters Not Applying

**Symptom**: Filters don't change graph

**Check**:
- Click Refresh button
- Verify author/branch selections
- Check if all commits are filtered out (shows "No commits found")

### Context Menu Not Appearing

**Symptom**: Right-click doesn't show menu

**Check**:
- Right-click directly on commit node (not empty space)
- Try clicking commit first, then right-clicking
- Check browser console for errors

### Keyboard Shortcuts Not Working

**Symptom**: Shortcuts do nothing

**Check**:
- Focus is not in text input (Escape to blur)
- Using correct modifier key (Ctrl on Windows/Linux, Cmd on Mac)
- Check browser console for errors

---

## Future Enhancements

### Planned Features

**Phase 4.1** (Polish):
- Pan support (click and drag)
- Viewport culling (skip off-screen rendering)
- Object pooling (reuse Graphics instances)

**Phase 5** (Advanced Git Operations):
- Checkout commit
- Cherry-pick commit
- Revert commit
- Create branch from commit
- Create tag on commit
- Interactive rebase

**Phase 6** (Diff Viewer):
- Inline file diff view
- Syntax highlighting
- Side-by-side diff mode
- Blame view integration

**Phase 7** (File History):
- File-specific commit history
- Follow file renames
- Blame annotations

---

## Technical Details

### Technologies

- **PixiJS v8**: WebGL rendering engine
- **@pixi/react**: Declarative React components for PixiJS
- **React**: UI framework
- **TypeScript**: Type safety
- **Effect**: Functional programming patterns
- **@effect-atom/atom-react**: Reactive state management

### Performance Benchmarks

**Target Performance**:
- Render time (1000 commits): < 100ms
- Graph interaction: < 16ms (60fps)
- Memory usage (10k commits): < 50MB

**Actual Performance**: (Measured on test hardware)
- _Benchmarking pending_

### Architecture

- **Backend**: CommitGraphService builds graph with topological layout
- **Frontend**: GraphLayoutEngine calculates visual positions
- **PixiJS**: CommitNode, CommitEdge, RefLabel components render graph
- **React**: CommitGraph, GraphFilters, CommitDetailsPanel coordinate UI
- **State**: Effect Atoms manage async data fetching
- **Persistence**: localStorage for settings

---

## Support

### Bug Reports

Report issues at: https://github.com/anthropics/geppetto/issues

### Feature Requests

Use GitHub Discussions for feature ideas

### Documentation

- **Implementation**: `docs/git-tree-ui-plan.md`
- **Progress**: `docs/git-tree-ui-progress.md`
- **Log**: `docs/git-tree-ui-log.md`
- **Architecture**: `CLAUDE.md` (Git Tree UI section)

---

## Changelog

### Version 1.0 (2025-10-28)

**Phase 1**: PixiJS Graph Renderer
- Initial commit graph visualization
- Lane assignment and coloring
- Commit nodes and edges
- Ref labels
- Mouse wheel zoom

**Phase 2**: Commit Details Panel
- Commit information display
- File changes list
- Tabs interface
- Automatic cache recovery

**Phase 3**: Advanced Features
- Real-time search and filtering
- Author and branch filters
- Max commits slider
- Context menu (right-click)
- Display settings toggles
- localStorage persistence

**Phase 4**: Polish & Documentation
- Keyboard shortcuts
- Performance optimizations
- Usage guide (this document)
- CLAUDE.md integration

---

## License

Part of Geppetto - Anthropic's GitHub Desktop Clone

---

**End of Usage Guide**
