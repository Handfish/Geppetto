# Terminal Streaming Fix - Migration Progress

> **Status**: 🔴 Not Started
> **Start Date**: TBD
> **Target Completion**: 2-3 hours
> **Goal**: Fix broken Stream-based architecture with simple event-driven push (VS Code pattern)

## Phase Completion Tracker

### Phase 1: Simplify Adapter (1 hour)
**Status**: ⏳ Not Started

#### 1.1 Update ProcessInstance Interface
- [ ] Remove `outputQueues: Set<Queue.Queue<OutputChunk>>`
- [ ] Remove `eventQueues: Set<Queue.Queue<ProcessEvent>>`
- [ ] Add `outputCallbacks: Set<(chunk: OutputChunk) => void>`
- [ ] Add `eventCallbacks: Set<(event: ProcessEvent) => void>`

**File**: `src/main/terminal/node-pty/adapter.ts:8-15`

#### 1.2 Rewrite subscribe() Method
- [ ] Remove Stream.asyncScoped pattern
- [ ] Remove Queue creation
- [ ] Remove Effect.forkScoped with pull loop
- [ ] Change signature to accept callback parameter
- [ ] Return cleanup function that removes callback from Set
- [ ] Add callback to instance.outputCallbacks Set

**File**: `src/main/terminal/node-pty/adapter.ts:379-422`

**Before**:
```typescript
const subscribe = (processId: string): Stream.Stream<OutputChunk, TerminalError> => {
  return Stream.asyncScoped<OutputChunk, TerminalError>((emit) =>
    Effect.gen(function* () {
      // ...
      const queue = yield* Queue.unbounded<OutputChunk>()
      instance.outputQueues.add(queue)
      yield* Effect.forkScoped(/* ... */)
    })
  )
}
```

**After**:
```typescript
const subscribe = (
  processId: string,
  onOutput: (chunk: OutputChunk) => void
): Effect.Effect<() => void, TerminalError> => {
  return Effect.gen(function* () {
    // Get instance
    // Add callback to instance.outputCallbacks
    // Return cleanup function
  })
}
```

#### 1.3 Rewrite subscribeToEvents() Method
- [ ] Same pattern as subscribe()
- [ ] Accept callback parameter
- [ ] Return cleanup function
- [ ] Add callback to instance.eventCallbacks Set

**File**: `src/main/terminal/node-pty/adapter.ts:424-453`

#### 1.4 Update PTY onData Handler
- [ ] Remove Queue.offer pattern
- [ ] Change to direct callback invocation
- [ ] Loop through instance.outputCallbacks Set
- [ ] Call each callback with chunk

**File**: `src/main/terminal/node-pty/adapter.ts:168-196`

**Before**:
```typescript
for (const queue of instance.outputQueues) {
  yield* Queue.offer(queue, chunk)
}
```

**After**:
```typescript
for (const callback of instance.outputCallbacks) {
  callback(chunk)
}
```

#### 1.5 Update PTY onExit Handler
- [ ] Same pattern for event callbacks
- [ ] Loop through instance.eventCallbacks
- [ ] Call each callback with event

**File**: `src/main/terminal/node-pty/adapter.ts:198-222`

#### 1.6 Update TerminalPort Interface
- [ ] Change subscribe signature from Stream-returning to callback-accepting
- [ ] Change subscribeToEvents signature
- [ ] Update return type to `Effect.Effect<() => void, TerminalError>`

**File**: `src/main/terminal/terminal-port.ts:103-104`

**Before**:
```typescript
readonly subscribe: (processId: string) => Stream.Stream<OutputChunk, TerminalError>
readonly subscribeToEvents: (processId: string) => Stream.Stream<ProcessEvent, TerminalError>
```

**After**:
```typescript
readonly subscribe: (
  processId: string,
  onOutput: (chunk: OutputChunk) => void
) => Effect.Effect<() => void, TerminalError>
readonly subscribeToEvents: (
  processId: string,
  onEvent: (event: ProcessEvent) => void
) => Effect.Effect<() => void, TerminalError>
```

#### 1.7 Compile Check
- [ ] Run `pnpm compile:app`
- [ ] Fix any TypeScript errors
- [ ] Verify no `Stream` imports needed in adapter

**Expected Errors**:
- TerminalService will have signature mismatches (fixed in Phase 2)
- Terminal handlers will have signature mismatches (fixed in Phase 3)

---

### Phase 2: Simplify Service (30 minutes)
**Status**: ⏳ Not Started

#### 2.1 Update TerminalServiceMethods Interface
- [ ] Change subscribeToWatcher signature to callback-based
- [ ] Change subscribeToWatcherEvents signature
- [ ] Update return types to `Effect.Effect<() => void, TerminalError, never>`

**File**: `src/main/terminal/terminal-service.ts:34-35`

**Before**:
```typescript
subscribeToWatcher(processId: string): Stream.Stream<OutputChunk, TerminalError, never>
subscribeToWatcherEvents(processId: string): Stream.Stream<ProcessEvent, TerminalError, never>
```

**After**:
```typescript
subscribeToWatcher(
  processId: string,
  onOutput: (chunk: OutputChunk) => void
): Effect.Effect<() => void, TerminalError, never>
subscribeToWatcherEvents(
  processId: string,
  onEvent: (event: ProcessEvent) => void
): Effect.Effect<() => void, TerminalError, never>
```

#### 2.2 Rewrite subscribeToWatcher Implementation
- [ ] Remove Stream.flatMap pattern
- [ ] Change to simple Effect.gen that calls adapter.subscribe
- [ ] Pass callback through to adapter
- [ ] Return cleanup function from adapter

**File**: `src/main/terminal/terminal-service.ts:221-235`

**Before**:
```typescript
const subscribeToWatcher: TerminalServiceMethods['subscribeToWatcher'] = (processId) => {
  return Stream.flatMap(
    Stream.fromEffect(registry.getDefaultAdapter()),
    (adapter) => adapter.subscribe(processId)
  )
}
```

**After**:
```typescript
const subscribeToWatcher: TerminalServiceMethods['subscribeToWatcher'] = (processId, onOutput) => {
  return Effect.gen(function* () {
    const adapter = yield* registry.getDefaultAdapter()
    return yield* adapter.subscribe(processId, onOutput)
  })
}
```

#### 2.3 Rewrite subscribeToWatcherEvents Implementation
- [ ] Same pattern as subscribeToWatcher
- [ ] Pass callback through to adapter
- [ ] Return cleanup function

**File**: `src/main/terminal/terminal-service.ts:237-242`

#### 2.4 Compile Check
- [ ] Run `pnpm compile:app`
- [ ] Verify no Stream imports in terminal-service.ts
- [ ] Fix any remaining TypeScript errors

**Expected Errors**:
- Terminal handlers will have signature mismatches (fixed in Phase 3)

---

### Phase 3: Simplify IPC Handlers (30 minutes)
**Status**: ⏳ Not Started

#### 3.1 Update Subscription Interface
- [ ] Remove `outputFiber: Fiber.RuntimeFiber<void, TerminalError>`
- [ ] Remove `eventFiber: Fiber.RuntimeFiber<void, TerminalError>`
- [ ] Add `cleanupOutput: () => void`
- [ ] Add `cleanupEvents: () => void`

**File**: `src/main/ipc/terminal-handlers.ts:18-23`

**Before**:
```typescript
interface Subscription {
  id: string
  processId: string
  outputFiber: Fiber.RuntimeFiber<void, TerminalError>
  eventFiber: Fiber.RuntimeFiber<void, TerminalError>
}
```

**After**:
```typescript
interface Subscription {
  id: string
  processId: string
  cleanupOutput: () => void
  cleanupEvents: () => void
}
```

#### 3.2 Rewrite subscribe-to-watcher Handler
- [ ] Remove Stream.merge pattern
- [ ] Remove Stream.runDrain
- [ ] Remove Effect.fork (no Fibers needed)
- [ ] Create `sendOutputViaIpc` callback function
- [ ] Create `sendEventViaIpc` callback function
- [ ] Call `terminalService.subscribeToWatcher(processId, sendOutputViaIpc)`
- [ ] Call `terminalService.subscribeToWatcherEvents(processId, sendEventViaIpc)`
- [ ] Store cleanup functions in subscription Map

**File**: `src/main/ipc/terminal-handlers.ts:88-178`

**Key Change**: Replace Fiber-based stream handling with direct callback registration.

**Before** (complex, broken):
```typescript
const outputFiber = yield* outputStream.pipe(
  Stream.tap((chunk) => Effect.sync(() => {
    window.webContents.send(`terminal:stream:${processId}`, { type: 'output', data: chunk })
  })),
  Stream.runDrain,
  Effect.fork
)
```

**After** (simple, works):
```typescript
const sendOutputViaIpc = (chunk: OutputChunk) => {
  const windows = BrowserWindow.getAllWindows()
  windows.forEach((window) => {
    if (!window.isDestroyed()) {
      window.webContents.send(`terminal:stream:${processId}`, { type: 'output', data: chunk })
    }
  })
}

const cleanupOutput = yield* terminalService.subscribeToWatcher(processId, sendOutputViaIpc)
```

#### 3.3 Rewrite unsubscribe-from-watcher Handler
- [ ] Remove Fiber.interrupt calls
- [ ] Call cleanup functions instead
- [ ] Delete subscription from Map

**File**: `src/main/ipc/terminal-handlers.ts:184-196`

**Before**:
```typescript
yield* Fiber.interrupt(subscription.outputFiber)
yield* Fiber.interrupt(subscription.eventFiber)
```

**After**:
```typescript
subscription.cleanupOutput()
subscription.cleanupEvents()
```

#### 3.4 Remove Unused Imports
- [ ] Remove `Stream` import
- [ ] Remove `Fiber` import
- [ ] Keep `Effect` import

**File**: `src/main/ipc/terminal-handlers.ts:8`

#### 3.5 Compile Check
- [ ] Run `pnpm compile:app`
- [ ] Verify zero TypeScript errors
- [ ] All phases should now compile successfully

---

### Phase 4: Verify & Test (30 minutes)
**Status**: ⏳ Not Started

#### 4.1 Check Renderer Code
- [ ] Verify `TerminalSubscriptionManager` class exists
- [ ] Check IPC listener setup with `window.electron.ipcRenderer.on()`
- [ ] Verify output buffer updates
- [ ] No changes needed (renderer already correct)

**File**: `src/renderer/atoms/terminal-atoms.ts:64-138`

**Note**: Renderer code should work as-is. It already listens for IPC events correctly.

#### 4.2 Manual Testing - Basic Flow
- [ ] Run `pnpm dev`
- [ ] Open DevTools console (both main and renderer)
- [ ] Navigate to repository view
- [ ] Open Issues modal
- [ ] Select an issue
- [ ] Click "Launch Watchers"
- [ ] Click blue terminal button

**Expected Console Output** (Main Process):
```
[NodePtyAdapter] Spawning process: { command: '/bin/bash', args: [] }
[NodePtyAdapter] Process spawned successfully, PID: 12345
[TerminalHandlers] Subscribing to watcher: watcher-github:123-issue-456
[TerminalHandlers] Registering callbacks with terminal service
[TerminalHandlers] Callbacks registered
[TerminalHandlers] SUBSCRIPTION CREATED: sub-watcher-github:123-issue-456-1234567890
```

#### 4.3 Manual Testing - Data Flow
- [ ] Terminal should show bash prompt
- [ ] Type some characters (e.g., "hello")
- [ ] Press Enter

**Expected Console Output** (Main Process):
```
[NodePtyAdapter] Received PTY data: h
[NodePtyAdapter] Invoking 1 output callbacks
[TerminalHandlers] Sending output chunk to renderer: h
[TerminalHandlers] Sending to 1 windows
[NodePtyAdapter] Received PTY data: e
[NodePtyAdapter] Invoking 1 output callbacks
[TerminalHandlers] Sending output chunk to renderer: e
```

**Expected Console Output** (Renderer):
```
[TerminalSubscriptionManager] Received IPC message: output
[TerminalSubscriptionManager] Received IPC message: output
```

**Expected Visual Result**:
- Characters appear in xterm.js terminal as you type
- Bash echoes characters back
- Terminal is interactive

#### 4.4 Manual Testing - Echo Test
- [ ] Type `echo "Hello World"` and press Enter
- [ ] Should see "Hello World" printed in terminal
- [ ] Verify full round-trip: input → PTY → bash → output → IPC → renderer → xterm

#### 4.5 Manual Testing - Multiple Processes
- [ ] Launch 2-3 watchers for different issues
- [ ] Switch between processes via LED buttons
- [ ] Type in different terminals
- [ ] Verify each process receives correct input
- [ ] Verify output goes to correct terminal

#### 4.6 Manual Testing - Cleanup
- [ ] Kill a watcher process
- [ ] Verify IPC events stop for that process
- [ ] Check subscriptions Map (should be empty for killed process)
- [ ] Verify no memory leaks (callbacks removed)

#### 4.7 Performance Check
- [ ] Spawn 5 watchers concurrently
- [ ] Check CPU usage (should be low when idle)
- [ ] Check memory usage (reasonable per process)
- [ ] Type rapidly in terminal - no lag?
- [ ] Output should stream in real-time

---

## Issues Encountered

### Issue 1: [Title]
**Phase**: [Which phase]
**Problem**: [Description of problem]
**Solution**: [How it was fixed]
**Impact**: [Time lost, lessons learned]

---

## Migration Metrics

| Metric | Target | Actual |
|--------|--------|--------|
| Total Implementation Time | 2-3 hours | *TBD* |
| TypeScript Errors | 0 | *TBD* |
| Lines of Code Removed | ~150 | *TBD* |
| Terminal Latency | <50ms | *TBD* |
| Memory per Process | <50MB | *TBD* |
| CPU Usage (idle) | <1% | *TBD* |

---

## Code Quality Checklist

### Architecture
- [ ] Callback-based pattern (not Streams)
- [ ] Direct IPC push (no intermediate abstractions)
- [ ] Simple Set<Callback> registration
- [ ] Cleanup via function return

### Effect-TS Patterns
- [ ] Effect.gen for operations
- [ ] Effect.runPromise to bridge callbacks
- [ ] Tagged errors used correctly
- [ ] No unnecessary Stream usage

### Type Safety
- [ ] No `any` types
- [ ] Callback types properly defined
- [ ] Cleanup function type correct
- [ ] IPC message types match schemas

### Performance
- [ ] No queue/stream overhead
- [ ] Direct callback invocation
- [ ] Minimal latency
- [ ] Proper cleanup (no leaks)

---

## Success Criteria

✅ **The fix is complete when**:

1. [ ] PTY onData directly calls all registered callbacks
2. [ ] Callbacks send IPC messages immediately
3. [ ] Renderer receives IPC events with output data
4. [ ] XTerm.js displays output in real-time
5. [ ] Characters typed in terminal echo back
6. [ ] No TypeScript errors (`pnpm compile:app`)
7. [ ] Console logs show complete data flow
8. [ ] Cleanup properly removes callbacks
9. [ ] Multiple subscriptions work concurrently
10. [ ] Performance is excellent (<50ms latency)

---

## Rollback Plan

If the fix causes issues:

1. **Git Revert**:
   ```bash
   git diff > terminal-streaming-fix.patch
   git checkout src/main/terminal/node-pty/adapter.ts
   git checkout src/main/terminal/terminal-service.ts
   git checkout src/main/ipc/terminal-handlers.ts
   ```

2. **Quick Fix**:
   - Keep adapter changes (callbacks work)
   - Revert only handlers if needed
   - Renderer doesn't need rollback

3. **Feature Flag**:
   - Add `USE_CALLBACK_STREAMING` env var
   - Toggle between implementations
   - Test both paths

---

## Dependencies

No new dependencies needed. Removing dependencies:
- ~~`Stream` usage~~ (only for data flow, still used elsewhere)
- ~~`Fiber` usage~~ (for terminal streaming)
- ~~`Queue` usage~~ (in adapter)
- ~~`PubSub` usage~~ (in adapter)

---

## Post-Fix Tasks

- [ ] Remove console.log debugging statements
- [ ] Update CLAUDE.md with new pattern
- [ ] Document callback-based subscription pattern
- [ ] Add comments explaining push architecture
- [ ] Create example for other domains

---

## Completion Summary

**Date Completed**: *TBD*
**Total Time**: *TBD*
**Developer Notes**: *TBD*

### What Went Well
*TBD*

### What Could Be Improved
*TBD*

### Lessons Learned
*TBD*

---

## Next Steps After Fix

1. **Remove tmux dependencies** (if not already done)
2. **Integrate with Issues modal** (launch watchers from UI)
3. **Add process management UI** (kill, restart buttons)
4. **Implement idle detection UI** (LED indicators)
5. **Add terminal panel toggle** (show/hide)
6. **Performance profiling** (ensure no regressions)
7. **Load testing** (10+ concurrent watchers)
8. **Documentation** (architecture diagrams, user guide)
