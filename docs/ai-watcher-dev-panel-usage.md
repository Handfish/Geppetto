# AI Runner Dev Panel - Usage Guide

## Overview

The AI Runner Dev Panel provides a development-only interface for testing and interacting with AI runners. It includes both a visual panel and a console API.

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
- **List Runners** - Display all AI runners with their status
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

**List all AI runners:**
```javascript
window.__DEV_AI_WATCHERS__.listRunners()
// Returns array of runners and logs them to console
```

### Creation Operations

**Create a new AI runner:**
```javascript
window.__DEV_AI_WATCHERS__.createRunner({
  type: 'claude-code',  // or 'codex', 'cursor', 'custom'
  name: 'My Test Runner',
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

**Stop a running runner:**
```javascript
window.__DEV_AI_WATCHERS__.stopRunner('runner-id')
```

**Start a stopped runner:**
```javascript
window.__DEV_AI_WATCHERS__.startRunner('runner-id')
```

### Inspection

**Get current Results:**
```javascript
const results = window.__DEV_AI_WATCHERS__.getResults()
console.log(results.runners)     // Full Result<AiRunner[], E>
console.log(results.sessions)     // Full Result<TmuxSession[], E>
console.log(results.createResult) // Full Result<AiRunner, E>
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

### 2. Create a Test Runner

```javascript
// Create a simple runner for testing
window.__DEV_AI_WATCHERS__.createRunner({
  type: 'custom',
  name: 'Test Runner',
  workingDirectory: process.cwd(),
  command: 'sleep',
  args: ['60']
})

// Check status
window.__DEV_AI_WATCHERS__.listRunners()
```

### 3. Test Runner Lifecycle

```javascript
// Get runners
const runners = window.__DEV_AI_WATCHERS__.listRunners()
const runnerId = runners[0]?.id

// Stop the runner
window.__DEV_AI_WATCHERS__.stopRunner(runnerId)

// Check status
window.__DEV_AI_WATCHERS__.listRunners()

// Restart it
window.__DEV_AI_WATCHERS__.startRunner(runnerId)
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
window.__DEV_AI_WATCHERS__.listRunners()
```

## Error Handling

All operations return Results that can be inspected:

```javascript
const results = window.__DEV_AI_WATCHERS__.getResults()

// Check for errors
if (results.sessions._tag === 'Failure') {
  console.error('Session error:', results.sessions.error)
}

if (results.runners._tag === 'Success') {
  console.log('Runners loaded:', results.runners.value)
}
```

## Architecture Notes

### IPC Flow:
```
Browser Console
  ↓
window.__DEV_AI_WATCHERS__.listTmuxSessions()
  ↓
AiRunnerClient.listTmuxSessions()
  ↓
ElectronIpcClient.invoke('ai-runner:list-tmux')
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
- All atoms have reactivity keys (e.g., `['ai-runners:list']`)
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
- Check that AI runner handlers are registered in main process
- Verify `AiRunnersLayer` is in `MainLayer`
- Check main process console for errors
