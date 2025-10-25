# AI Watcher Dev Panel - Usage Guide

## Overview

The AI Watcher Dev Panel provides a development-only interface for testing and interacting with AI watchers. It includes both a visual panel and a console API.

## Access

The panel is **only available in development mode** (`NODE_ENV=development`).

### Starting the App in Dev Mode

```bash
pnpm dev
```

## Visual Panel

The visual panel appears in the bottom-right corner of the app (in development mode only).

### Features:
- **List Tmux Sessions** - Display all active tmux sessions with attach buttons
- **List Watchers** - Display all AI watchers with their status
- **Real-time Updates** - Uses Result.builder pattern for exhaustive error handling

### Toggling the Panel:
```javascript
// From browser console:
window.__DEV_AI_WATCHERS__.showPanel()
window.__DEV_AI_WATCHERS__.hidePanel()
window.__DEV_AI_WATCHERS__.togglePanel()
```

## Console API

A full API is exposed to `window.__DEV_AI_WATCHERS__` for testing.

### Listing Operations

**List all tmux sessions:**
```javascript
window.__DEV_AI_WATCHERS__.listTmuxSessions()
// Returns array of tmux sessions and logs them to console
```

**List all AI watchers:**
```javascript
window.__DEV_AI_WATCHERS__.listWatchers()
// Returns array of watchers and logs them to console
```

### Creation Operations

**Create a new AI watcher:**
```javascript
window.__DEV_AI_WATCHERS__.createWatcher({
  type: 'claude-code',  // or 'codex', 'cursor', 'custom'
  name: 'My Test Watcher',
  workingDirectory: '/path/to/project',
  command: 'custom-command',  // optional, for custom type
  args: ['--arg1', 'value'],  // optional
})
```

**Attach to an existing tmux session:**
```javascript
window.__DEV_AI_WATCHERS__.attachToTmux('session-name')
```

### Control Operations

**Stop a running watcher:**
```javascript
window.__DEV_AI_WATCHERS__.stopWatcher('watcher-id')
```

**Start a stopped watcher:**
```javascript
window.__DEV_AI_WATCHERS__.startWatcher('watcher-id')
```

### Inspection

**Get current Results:**
```javascript
const results = window.__DEV_AI_WATCHERS__.getResults()
console.log(results.watchers)     // Full Result<AiWatcher[], E>
console.log(results.sessions)     // Full Result<TmuxSession[], E>
console.log(results.createResult) // Full Result<AiWatcher, E>
```

## Testing Workflow

### 1. Hello World - List Tmux Sessions

```javascript
// Open browser DevTools console (F12)
window.__DEV_AI_WATCHERS__.listTmuxSessions()
```

This will:
- Trigger an IPC call to the main process
- Call `TmuxSessionManager.listSessions()`
- Display results in the console and visual panel

### 2. Create a Test Watcher

```javascript
// Create a simple watcher for testing
window.__DEV_AI_WATCHERS__.createWatcher({
  type: 'custom',
  name: 'Test Watcher',
  workingDirectory: process.cwd(),
  command: 'sleep',
  args: ['60']
})

// Check status
window.__DEV_AI_WATCHERS__.listWatchers()
```

### 3. Test Watcher Lifecycle

```javascript
// Get watchers
const watchers = window.__DEV_AI_WATCHERS__.listWatchers()
const watcherId = watchers[0]?.id

// Stop the watcher
window.__DEV_AI_WATCHERS__.stopWatcher(watcherId)

// Check status
window.__DEV_AI_WATCHERS__.listWatchers()

// Restart it
window.__DEV_AI_WATCHERS__.startWatcher(watcherId)
```

### 4. Attach to Existing Tmux Session

```bash
# In a terminal, create a tmux session:
tmux new-session -d -s test-session 'sleep 120'
```

```javascript
// In browser console:
window.__DEV_AI_WATCHERS__.listTmuxSessions()
window.__DEV_AI_WATCHERS__.attachToTmux('test-session')
window.__DEV_AI_WATCHERS__.listWatchers()
```

## Error Handling

All operations return Results that can be inspected:

```javascript
const results = window.__DEV_AI_WATCHERS__.getResults()

// Check for errors
if (results.sessions._tag === 'Failure') {
  console.error('Session error:', results.sessions.error)
}

if (results.watchers._tag === 'Success') {
  console.log('Watchers loaded:', results.watchers.value)
}
```

## Architecture Notes

### IPC Flow:
```
Browser Console
  ↓
window.__DEV_AI_WATCHERS__.listTmuxSessions()
  ↓
AiWatcherClient.listTmuxSessions()
  ↓
ElectronIpcClient.invoke('ai-watcher:list-tmux')
  ↓
IPC Main Process Handler
  ↓
TmuxSessionManager.listSessions()
  ↓
Effect Service Execution
  ↓
Result returned to renderer
  ↓
Atom updated via reactivity
  ↓
Visual panel re-renders
```

### Reactivity:
- All atoms have reactivity keys (e.g., `['ai-watchers:list']`)
- Mutations automatically invalidate related atoms
- Visual panel updates automatically when data changes
- TTL-based caching prevents excessive IPC calls

## Tips

1. **Check Console First** - The API logs helpful information when it loads
2. **Use Visual Panel** - Easier for quick testing
3. **Inspect Results** - Use `.getResults()` to see full Effect Result objects
4. **Watch Network** - DevTools shows IPC calls in the console
5. **Tmux Required** - Ensure tmux is installed and accessible

## Troubleshooting

**Panel doesn't appear:**
- Ensure `NODE_ENV=development`
- Check browser console for errors
- Try `window.__DEV_AI_WATCHERS__.showPanel()`

**API not available:**
- Refresh the app
- Check that you're running `pnpm dev` (not production build)

**No tmux sessions:**
- Install tmux: `brew install tmux` (macOS) or `apt install tmux` (Linux)
- Create test session: `tmux new-session -d -s test 'sleep 60'`

**IPC errors:**
- Check that AI watcher handlers are registered in main process
- Verify `AiWatchersLayer` is in `MainLayer`
- Check main process console for errors
