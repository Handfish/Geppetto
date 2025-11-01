# AI Watcher XTerm.js Terminal - Migration Progress

> **Status**: Not Started
> **Start Date**: -
> **Target Completion**: 2 days
> **Actual Duration**: -

## Phase Completion Tracker

### Phase 1: Terminal Port & Adapter Architecture (2-3 hours)
**Status**: ⏳ Not Started
**Duration**: -

- [ ] 1.1 Define Terminal Port Interface (`src/main/terminal/terminal-port.ts`)
  - [ ] ProcessState schema with status tracking
  - [ ] ProcessConfig schema with issue context
  - [ ] OutputChunk and ProcessEvent schemas
  - [ ] TerminalPort interface with lifecycle methods
  - [ ] TerminalError tagged error class
  - [ ] Port tag and adapter registry

- [ ] 1.2 Create NodePty Terminal Adapter (`src/main/terminal/node-pty/adapter.ts`)
  - [ ] Implement spawn with PTY process creation
  - [ ] Implement kill/restart process methods
  - [ ] Implement write/resize operations
  - [ ] Set up output stream with PubSub
  - [ ] Set up event stream with lifecycle events
  - [ ] Implement idle detection (30s for issues, 60s default)
  - [ ] Export as Layer

- [ ] 1.3 Create Terminal Registry Service (`src/main/terminal/terminal-registry.ts`)
  - [ ] Capture TerminalPort at construction
  - [ ] Implement getAdapter method
  - [ ] Implement getDefaultAdapter method
  - [ ] Support for multiple adapter types

- [ ] 1.4 Create Terminal Service (`src/main/terminal/terminal-service.ts`)
  - [ ] Implement spawnAiWatcher with tier checks
  - [ ] Track active watchers in HashMap
  - [ ] Implement kill/restart operations
  - [ ] Implement write/resize delegation
  - [ ] Create stream subscriptions
  - [ ] Integration with AccountContextService

**Notes**:
```
-
```

### Phase 2: IPC Contracts & Handlers (2 hours)
**Status**: ⏳ Not Started
**Duration**: -

- [ ] 2.1 Define IPC Contracts (`src/shared/ipc-contracts/terminal-contracts.ts`)
  - [ ] spawnWatcher contract
  - [ ] killWatcher contract
  - [ ] killAllWatchers contract
  - [ ] restartWatcher contract
  - [ ] writeToWatcher contract
  - [ ] resizeWatcher contract
  - [ ] getWatcherState contract
  - [ ] listActiveWatchers contract
  - [ ] Stream subscription contracts

- [ ] 2.2 Create Shared Schemas (`src/shared/schemas/terminal/index.ts`)
  - [ ] ProcessState class
  - [ ] OutputChunk class
  - [ ] ProcessEvent class
  - [ ] SpawnWatcherInput class
  - [ ] WatcherInfo class
  - [ ] TerminalError for IPC

- [ ] 2.3 Create IPC Handlers (`src/main/ipc/terminal-handlers.ts`)
  - [ ] Register basic operation handlers
  - [ ] Implement stream subscription handler
  - [ ] Set up IPC channel for stream data
  - [ ] Manage subscription lifecycle
  - [ ] Handle cleanup on unsubscribe

**Notes**:
```
-
```

### Phase 3: Frontend Terminal Components (3-4 hours)
**Status**: ⏳ Not Started
**Duration**: -

- [ ] 3.1 Create Terminal Atoms (`src/renderer/atoms/terminal-atoms.ts`)
  - [ ] activeWatchersAtom for watcher list
  - [ ] watcherStateAtom family for individual states
  - [ ] watcherOutputAtom family for output buffers
  - [ ] TerminalSubscriptionManager class
  - [ ] Stream subscription management

- [ ] 3.2 Create XTerm Terminal Component (`src/renderer/components/terminal/XTerminal.tsx`)
  - [ ] Initialize Terminal with theme
  - [ ] Add FitAddon for auto-resize
  - [ ] Add SearchAddon for search functionality
  - [ ] Add WebLinksAddon for clickable links
  - [ ] Handle input/output streams
  - [ ] Implement keyboard shortcuts (Ctrl+F, Ctrl+C/V)
  - [ ] Handle resize events

- [ ] 3.3 Create Terminal LED Indicator (`src/renderer/components/terminal/TerminalLED.tsx`)
  - [ ] Status color mapping (running/idle/error/stopped)
  - [ ] Pulsing animation for starting state
  - [ ] Shadow glow effects
  - [ ] Click handling for process switching
  - [ ] Tooltip with process details

- [ ] 3.4 Create Terminal Panel Component (`src/renderer/components/terminal/TerminalPanel.tsx`)
  - [ ] Header with title and controls
  - [ ] LED status bar with all watchers
  - [ ] Terminal container with active process
  - [ ] Footer with process controls (restart/kill)
  - [ ] Maximize/minimize functionality
  - [ ] Auto-select first watcher

**Notes**:
```
-
```

### Phase 4: Integration & Testing (2 hours)
**Status**: ⏳ Not Started
**Duration**: -

- [ ] 4.1 Create Terminal Operations Hook (`src/renderer/hooks/useTerminalOperations.ts`)
  - [ ] spawnWatcher method
  - [ ] killWatcher method
  - [ ] killAllWatchers method
  - [ ] restartWatcher method
  - [ ] writeToWatcher method
  - [ ] resizeWatcher method

- [ ] 4.2 Update Main Layer (`src/main/index.ts`)
  - [ ] Add NodePtyTerminalAdapterLayer
  - [ ] Add TerminalRegistry to composition
  - [ ] Add TerminalService to composition
  - [ ] Register terminal IPC handlers

- [ ] 4.3 Update IPC Client (`src/renderer/lib/ipc-client.ts`)
  - [ ] Add terminal namespace
  - [ ] Add all terminal methods
  - [ ] Export in client object

- [ ] 4.4 Update Issues Modal (`src/renderer/components/ai-watchers/IssuesModal.tsx`)
  - [ ] Replace tmux launcher with terminal operations
  - [ ] Use spawnWatcher instead of tmux commands
  - [ ] Pass issue context to terminal

- [ ] 4.5 Add Terminal Panel to Main Layout (`src/renderer/App.tsx`)
  - [ ] Add terminal visibility state
  - [ ] Add terminal toggle button
  - [ ] Render TerminalPanel conditionally
  - [ ] Handle panel close

- [ ] 4.6 Install Dependencies
  - [ ] Add node-pty dependency
  - [ ] Add @xterm/xterm and addons
  - [ ] Run pnpm install

**Notes**:
```
-
```

## Testing Checklist

### Compilation & Type Safety
- [ ] Run `pnpm compile:app` - no errors
- [ ] Run `pnpm compile:app:pro` - no errors
- [ ] Check bundle size increase (expect ~15-20kB)

### Terminal Functionality
- [ ] Spawn single AI watcher
- [ ] Spawn multiple AI watchers concurrently
- [ ] Switch between processes via LED buttons
- [ ] Terminal displays output correctly
- [ ] Keyboard input works in terminal
- [ ] Copy/paste functionality (Ctrl+Shift+C/V)
- [ ] Search functionality (Ctrl+F)
- [ ] Resize terminal window
- [ ] Maximize/minimize panel

### Process Management
- [ ] Kill individual process
- [ ] Restart process
- [ ] Kill all processes
- [ ] Idle detection after 30s (issues) / 60s (normal)
- [ ] LED status colors update correctly
- [ ] Process cleanup on app close

### Error Handling
- [ ] Handle spawn failures gracefully
- [ ] Handle process crashes
- [ ] Handle invalid process IDs
- [ ] Display appropriate error messages

### Integration
- [ ] Launch from Issues modal works
- [ ] Git worktree creation works
- [ ] Issue context passed correctly
- [ ] Multiple issues launch sequentially
- [ ] Account credentials used properly

## Issues Encountered

### Issue 1: [Title]
**Phase**: -
**Problem**: -
**Solution**: -
**Impact**: -

### Issue 2: [Title]
**Phase**: -
**Problem**: -
**Solution**: -
**Impact**: -

## Migration Metrics

| Metric | Target | Actual |
|--------|--------|--------|
| Total Implementation Time | 10-12 hours | - |
| TypeScript Errors | 0 | - |
| Bundle Size Increase | <25kB | - |
| Terminal Startup Time | <500ms | - |
| Memory per Process | <50MB | - |
| CPU Usage (idle) | <1% | - |
| Output Buffer Size | 1000 lines | - |

## Code Quality Checklist

### Architecture
- [ ] Hexagonal architecture properly implemented
- [ ] Port/Adapter pattern followed
- [ ] Clean separation of concerns
- [ ] No circular dependencies

### Effect-TS Patterns
- [ ] All async operations use Effect.gen
- [ ] Services have correct dependencies
- [ ] Layer memoization via module constants
- [ ] Proper error handling with Effect.fail
- [ ] Tagged errors used consistently

### Type Safety
- [ ] No `any` types used
- [ ] Schema.parse() used (not validate/decode)
- [ ] All IPC contracts typed
- [ ] Result types handled exhaustively

### Performance
- [ ] React components properly memoized
- [ ] useCallback for event handlers
- [ ] useMemo for expensive computations
- [ ] Atoms have appropriate TTL
- [ ] Streams properly disposed

### Testing
- [ ] Manual testing completed
- [ ] All scenarios tested
- [ ] Error cases handled
- [ ] Performance acceptable

## Rollback Plan

If migration fails or causes issues:

1. **Immediate Rollback**:
   - Git stash current changes
   - Revert to previous commit
   - Restore tmux-based implementation

2. **Partial Rollback**:
   - Keep terminal architecture
   - Revert only UI components
   - Use tmux adapter instead of node-pty

3. **Feature Flag**:
   - Add `USE_XTERM_TERMINAL` env variable
   - Toggle between implementations
   - Gradual migration per user

## Dependencies Added

```json
{
  "node-pty": "^1.0.0",
  "@xterm/xterm": "^5.5.0",
  "@xterm/addon-fit": "^0.10.0",
  "@xterm/addon-web-links": "^0.11.0",
  "@xterm/addon-search": "^0.15.0"
}
```

## Post-Migration Tasks

- [ ] Remove tmux dependencies
- [ ] Update documentation
- [ ] Create user guide for new terminal
- [ ] Performance profiling
- [ ] Memory leak testing
- [ ] Load testing with 10+ watchers

## Completion Summary

**Date Completed**: -
**Total Time**: -
**Developer Notes**: -

### What Went Well
-

### What Could Be Improved
-

### Lessons Learned
-