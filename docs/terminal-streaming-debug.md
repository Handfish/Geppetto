# Terminal Streaming Debug Summary

## Problem Statement
Xterm.js terminal displays no output. Typed characters are not echoed in the terminal even though they reach the PTY process.

## Current Status
**Partially Fixed** - Data flow reaches PubSub but Stream.fromPubSub is not consuming.

## Data Flow Architecture
```
User Types → XTerminal.onData → writeToWatcher → PTY Process
                                                        ↓
                                                 PTY echoes back
                                                        ↓
                                                 PubSub.publish
                                                        ↓
                                    ❌ Stream.fromPubSub (NOT CONSUMING)
                                                        ↓
                                           (Stream.runDrain never runs)
                                                        ↓
                                            (No IPC to renderer)
                                                        ↓
                                           (No terminal display)
```

## Fixes Applied

### 1. ✅ Fiber Lifecycle (Effect.forkScoped)
**File**: `/src/main/ipc/terminal-handlers.ts`
- Changed from `Effect.fork` to `Effect.forkScoped` wrapped in `Effect.scoped`
- Ensures fibers survive beyond parent Effect lifetime

### 2. ✅ Multi-Consumer Support (PubSub)
**File**: `/src/main/terminal/node-pty/adapter.ts`
- Changed from `Queue` (single-consumer) to `PubSub` (multi-consumer)
- Allows multiple subscriptions to same process

### 3. ✅ IPC Listener Signature
**File**: `/src/renderer/atoms/terminal-atoms.ts`
- Fixed callback signature from spread operator to explicit parameters
- Prevents "Cannot read properties of undefined" errors

### 4. ✅ Window Destruction Checks
**File**: `/src/main/ipc/terminal-handlers.ts`
- Added `isDestroyed()` checks before sending IPC
- Prevents crashes from destroyed windows

## Progress Update

### ✅ Adapter Now Emitting (Stream.async pattern)
Adapter successfully emits chunks after switching to `Stream.async` with manual queue pulling.

### ❌ Terminal Handlers Not Consuming
Stream emits in adapter but fiber in terminal-handlers doesn't consume/forward to IPC.

## Remaining Issue

### Stream Not Reaching Terminal Handlers ❌

**Current Implementation** (partially working):
```typescript
return Stream.unwrap(
  Effect.map(
    PubSub.subscribe(instance.outputStream),
    (subscription) => {
      console.log('[NodePtyAdapter] PubSub subscription created')
      return Stream.fromPubSub(subscription)
    }
  )
)
```

**What Happens**:
1. PubSub subscription is created ✓
2. Stream.fromPubSub is returned ✓
3. Stream is NOT consumed by Stream.runDrain ✗
4. No data flows through the stream ✗

**Evidence from Logs**:
- "Publishing chunk to PubSub" appears
- "PubSub subscription created" appears
- "Stream emitting chunk" NEVER appears
- "Sending output chunk to renderer" NEVER appears
- "Stream.runDrain is consuming" NEVER appears

## Potential Solutions to Try

### Option 1: Direct Stream Creation
Instead of `Stream.unwrap`, try creating the stream directly:
```typescript
Stream.fromPubSub(instance.outputStream)
```

### Option 2: Explicit Pull Pattern
Use `Stream.async` to manually pull from PubSub:
```typescript
Stream.async<OutputChunk>((emit) => {
  // Manually pull from PubSub and emit
})
```

### Option 3: Debug Stream Consumption
Add explicit logging in the Stream.runDrain pipeline to see where it stops:
```typescript
Stream.tap(() => console.log('Before runDrain')),
Stream.runDrain,
Effect.tap(() => console.log('After runDrain'))
```

## Test Procedure

1. Open app and navigate to repository
2. Open Issues modal (select issues)
3. Launch AI watchers
4. Click blue terminal button to show terminal panel
5. Type characters in terminal
6. Check both main process console and browser DevTools

## Expected Behavior
- Characters should echo in terminal as typed
- PTY output should appear in terminal display
- "Stream emitting chunk" logs should appear
- IPC messages should reach renderer

## Actual Behavior
- No output in terminal display
- Characters are sent to PTY and echoed back
- Data published to PubSub but not consumed
- No IPC messages sent to renderer