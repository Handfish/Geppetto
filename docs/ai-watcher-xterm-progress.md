# AI Watcher XTerm.js Terminal - Migration Progress

> **Status**: In Progress (Phases 1-3 Complete, 75% Done)
> **Start Date**: 2025-11-01
> **Target Completion**: 2 days
> **Actual Duration**: In Progress (~3.25 hours so far)

## Phase Completion Tracker

### Phase 1: Terminal Port & Adapter Architecture (2-3 hours)
**Status**: ✅ Complete
**Duration**: ~1 hour

- [x] 1.1 Define Terminal Port Interface (`src/main/terminal/terminal-port.ts`)
  - [x] ProcessState schema with status tracking
  - [x] ProcessConfig schema with issue context
  - [x] OutputChunk and ProcessEvent schemas
  - [x] TerminalPort interface with lifecycle methods
  - [x] TerminalError tagged error class
  - [x] Port tag and adapter registry

- [x] 1.2 Create NodePty Terminal Adapter (`src/main/terminal/node-pty/adapter.ts`)
  - [x] Implement spawn with PTY process creation
  - [x] Implement kill/restart process methods
  - [x] Implement write/resize operations
  - [x] Set up output stream with PubSub
  - [x] Set up event stream with lifecycle events
  - [x] Implement idle detection (30s for issues, 60s default)
  - [x] Export as Layer

- [x] 1.3 Create Terminal Registry Service (`src/main/terminal/terminal-registry.ts`)
  - [x] Capture TerminalPort at construction
  - [x] Implement getAdapter method
  - [x] Implement getDefaultAdapter method
  - [x] Support for multiple adapter types

- [x] 1.4 Create Terminal Service (`src/main/terminal/terminal-service.ts`)
  - [x] Implement spawnAiWatcher with tier checks
  - [x] Track active watchers in HashMap
  - [x] Implement kill/restart operations
  - [x] Implement write/resize delegation
  - [x] Create stream subscriptions
  - [x] Integration with AccountContextService

**Notes**:
```
- Successfully implemented all Phase 1 components
- node-pty dependency installed (v1.0.0)
- Compilation successful with no TypeScript errors
- Followed hexagonal architecture pattern as specified
- Used Effect.gen for all async operations
- Proper Layer composition with module-level exports
```

### Phase 2: IPC Contracts & Handlers (2 hours)
**Status**: ✅ Complete
**Duration**: ~45 minutes

- [x] 2.1 Define IPC Contracts (`src/shared/ipc-contracts.ts`)
  - [x] spawnWatcher contract
  - [x] killWatcher contract
  - [x] killAllWatchers contract
  - [x] restartWatcher contract
  - [x] writeToWatcher contract
  - [x] resizeWatcher contract
  - [x] getWatcherState contract
  - [x] listActiveWatchers contract
  - [x] Stream subscription contracts

- [x] 2.2 Create Shared Schemas (`src/shared/schemas/terminal/index.ts` and `errors.ts`)
  - [x] ProcessState class
  - [x] OutputChunk class
  - [x] ProcessEvent class
  - [x] SpawnWatcherInput class
  - [x] WatcherInfo class
  - [x] TerminalError for IPC (with detailed error types)

- [x] 2.3 Create IPC Handlers (`src/main/ipc/terminal-handlers.ts`)
  - [x] Register basic operation handlers
  - [x] Implement stream subscription handler with Fiber management
  - [x] Set up IPC channel for stream data (BrowserWindow.send)
  - [x] Manage subscription lifecycle with Map tracking
  - [x] Handle cleanup on unsubscribe with Fiber interruption

**Notes**:
```
- Added TerminalIpcContracts to main ipc-contracts.ts file
- Created comprehensive error schemas for terminal operations
- Implemented stream-based IPC using Effect Fibers
- Used BrowserWindow.getAllWindows() for multi-window support
- Proper cleanup function (cleanupTerminalSubscriptions) for app quit
- Compilation successful with no TypeScript errors
- All IPC contracts properly integrated into combined IpcContracts export
```

### Phase 3: Frontend Terminal Components (3-4 hours)
**Status**: ✅ Complete
**Duration**: ~1.5 hours

- [x] 3.1 Create Terminal Atoms (`src/renderer/atoms/terminal-atoms.ts`)
  - [x] activeWatchersAtom for watcher list
  - [x] watcherStateAtom family for individual states
  - [x] watcherOutputAtom family for output buffers
  - [x] TerminalSubscriptionManager class
  - [x] Stream subscription management
  - [x] Action atoms (spawn, kill, restart, write, resize)

- [x] 3.2 Create XTerm Terminal Component (`src/renderer/components/terminal/XTerminal.tsx`)
  - [x] Initialize Terminal with theme
  - [x] Add FitAddon for auto-resize
  - [x] Add SearchAddon for search functionality
  - [x] Add WebLinksAddon for clickable links
  - [x] Handle input/output streams
  - [x] Implement keyboard shortcuts (Ctrl+F, Ctrl+Shift+C/V)
  - [x] Handle resize events
  - [x] Real-time output subscription with Effect integration

- [x] 3.3 Create Terminal LED Indicator (`src/renderer/components/terminal/TerminalLED.tsx`)
  - [x] Status color mapping (running/idle/error/stopped)
  - [x] Pulsing animation for starting state
  - [x] Shadow glow effects
  - [x] Click handling for process switching
  - [x] Tooltip with process details

- [x] 3.4 Create Terminal Panel Component (`src/renderer/components/terminal/TerminalPanel.tsx`)
  - [x] Header with title and controls
  - [x] LED status bar with all watchers
  - [x] Terminal container with active process
  - [x] Footer with process controls (restart/kill)
  - [x] Maximize/minimize functionality
  - [x] Auto-select first watcher
  - [x] Result.builder pattern for error handling

- [x] 3.5 Create useTerminalOperations Hook (`src/renderer/hooks/useTerminalOperations.ts`)
  - [x] useAtomCallback integration for reactive updates
  - [x] All terminal operation methods

**Notes**:
```
- Successfully installed @xterm/xterm v5.5.0 and all addons
- Terminal atoms use Atom.runtime pattern with ElectronIpcClient
- TerminalSubscriptionManager handles IPC streaming with proper cleanup
- XTerminal component integrates Effect.runPromise for subscriptions
- Result.builder used for type-safe error handling in UI
- TTL caching: 30s for watchers list, 10s for individual states
- useAtomCallback used for action atoms to ensure reactivity
- Compilation successful with no TypeScript errors
- Custom theme with proper color scheme for terminal
- All keyboard shortcuts implemented (search, copy/paste)
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
- [x] Run `pnpm compile:app` - no errors (Phase 1 complete)
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
- [x] Hexagonal architecture properly implemented (Phase 1)
- [x] Port/Adapter pattern followed (Phase 1)
- [x] Clean separation of concerns (Phase 1)
- [x] No circular dependencies (Phase 1)

### Effect-TS Patterns
- [x] All async operations use Effect.gen (Phase 1)
- [x] Services have correct dependencies (Phase 1)
- [x] Layer memoization via module constants (Phase 1)
- [x] Proper error handling with Effect.fail (Phase 1)
- [x] Tagged errors used consistently (Phase 1)

### Type Safety
- [x] No `any` types used (Phase 1)
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