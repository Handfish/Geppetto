# Terminal Streaming - Event-Driven Push Architecture Plan

> **Goal**: Fix terminal streaming to use event-driven push architecture (like VS Code), not polling or broken Stream patterns. Data should flow: PTY → IPC Push → Renderer → XTerm.

## Executive Summary

The current implementation attempts to use Effect Streams with Queue/PubSub but has a fundamental flaw: the Stream.asyncScoped pattern with forked fibers never actually consumes data. VS Code's simpler push-based architecture provides the correct pattern: PTY emits data → immediately push via IPC → renderer receives → write to xterm.js.

**Core Problem**: Trying to bridge imperative PTY callbacks with functional Effect Streams using complex asyncScoped patterns that don't properly consume queues.

**Solution**: Simplify to direct callback-based IPC push, following VS Code's event-driven architecture.

**Estimated Duration**: 2-3 hours
**Complexity**: Medium (simplification of existing broken code)

---

## Architecture Comparison

### ❌ Current Broken Architecture

```
PTY onData callback
  ↓
Offer to Set<Queue<OutputChunk>>
  ↓
Stream.asyncScoped creates queue + forked fiber
  ↓
Fiber should pull from queue (BUT NEVER EXECUTES)
  ↓
Stream.runDrain (NOTHING TO DRAIN)
  ↓
IPC send (NEVER REACHED)
  ↓
Renderer (NO DATA)
```

**Problems**:
1. Stream.asyncScoped + forked fiber pattern doesn't work as expected
2. Queue.take loop inside fiber never executes
3. Over-engineered for simple callback-based data flow
4. Mixing imperative callbacks with functional streams incorrectly

### ✅ Target Architecture (VS Code Pattern)

```
PTY onData callback
  ↓
DIRECTLY send IPC message (push)
  ↓
Renderer ipcRenderer.on (push event)
  ↓
Write to xterm.js terminal
```

**Benefits**:
1. Simple, proven pattern from VS Code
2. Event-driven push (no polling)
3. Direct callback → IPC (no intermediate abstractions)
4. Minimal latency
5. Easy to debug and understand

### 🎯 Effect-ful Implementation (Our Pattern)

```
PTY onData callback
  ↓
Effect.runPromise(sendOutput effect)
  ↓
  Effect: Get BrowserWindow → Send IPC
  ↓
Renderer ipcRenderer.on
  ↓
Update atom → trigger xterm.js write
```

**Key Insight**: We don't need Streams for push-based data. Use Effect for the send operation itself, not for creating a stream of data.

---

## Phase 1: Simplify Adapter (1 hour)

### Problem Analysis

**Current Code** (`src/main/terminal/node-pty/adapter.ts:379-422`):
```typescript
const subscribe = (processId: string): Stream.Stream<OutputChunk, TerminalError> => {
  return Stream.asyncScoped<OutputChunk, TerminalError>((emit) =>
    Effect.gen(function* () {
      // ...
      const queue = yield* Queue.unbounded<OutputChunk>()
      instance.outputQueues.add(queue)

      // ❌ This fiber never executes!
      yield* Effect.forkScoped(
        Effect.gen(function* () {
          while (true) {
            const chunk = yield* Queue.take(queue)
            emit.single(chunk)  // Never called
          }
        })
      )
    })
  )
}
```

**Why it fails**:
- Stream.asyncScoped expects the effect to call `emit` to push data into the stream
- The forked fiber should pull from queue and emit, but it never runs
- Stream.runDrain in handler has nothing to consume

### Solution: Remove Streams Entirely

**File**: `src/main/terminal/node-pty/adapter.ts`

Replace complex Stream subscription with simple callback registration:

```typescript
interface ProcessInstance {
  config: ProcessConfig
  ptyProcess: pty.IPty
  state: Ref.Ref<ProcessState>
  outputCallbacks: Set<(chunk: OutputChunk) => void>  // Simple callbacks
  eventCallbacks: Set<(event: ProcessEvent) => void>
  idleTimer: Ref.Ref<number | null>
}

// Simplified subscription - just register a callback
const subscribe = (processId: string, onOutput: (chunk: OutputChunk) => void): Effect.Effect<() => void, TerminalError> => {
  return Effect.gen(function* () {
    const option = yield* pipe(
      Ref.get(processes),
      Effect.map(HashMap.get(processId as ProcessId))
    )

    if (option._tag === 'None') {
      return yield* Effect.fail(
        new TerminalError({ reason: 'ProcessNotFound', message: `Process ${processId} not found` })
      )
    }

    const instance = option.value

    // Add callback to set
    instance.outputCallbacks.add(onOutput)

    // Return cleanup function
    return () => {
      instance.outputCallbacks.delete(onOutput)
    }
  })
}

const subscribeToEvents = (processId: string, onEvent: (event: ProcessEvent) => void): Effect.Effect<() => void, TerminalError> => {
  return Effect.gen(function* () {
    const option = yield* pipe(
      Ref.get(processes),
      Effect.map(HashMap.get(processId as ProcessId))
    )

    if (option._tag === 'None') {
      return yield* Effect.fail(
        new TerminalError({ reason: 'ProcessNotFound', message: `Process ${processId} not found` })
      )
    }

    const instance = option.value
    instance.eventCallbacks.add(onEvent)

    return () => {
      instance.eventCallbacks.delete(onEvent)
    }
  })
}
```

### Update PTY onData Handler

**File**: `src/main/terminal/node-pty/adapter.ts:168-196`

Change from Queue.offer to direct callback invocation:

```typescript
ptyProcess.onData((data: string) => {
  console.log('[NodePtyAdapter] Received PTY data:', data.substring(0, 100))

  Effect.runPromise(Effect.gen(function* () {
    const chunk = new OutputChunk({
      processId: config.id,
      data,
      timestamp: new Date(),
      type: 'stdout',
    })

    console.log('[NodePtyAdapter] Invoking', instance.outputCallbacks.size, 'output callbacks')

    // Call all registered callbacks DIRECTLY
    for (const callback of instance.outputCallbacks) {
      callback(chunk)
    }

    console.log('[NodePtyAdapter] All callbacks invoked')

    yield* Ref.update(state, (s) => ({
      ...s,
      lastActivity: new Date(),
    }))

    yield* resetIdleTimer(instance)
  })).catch((error) => {
    console.error('[NodePtyAdapter] Error in onData handler:', error)
  })
})
```

### Update Port Interface

**File**: `src/main/terminal/terminal-port.ts`

Change from Stream-returning methods to callback-based subscriptions:

```typescript
export interface TerminalPort {
  // ... existing methods ...

  // Stream subscriptions (for IPC) - now callback-based
  readonly subscribe: (processId: string, onOutput: (chunk: OutputChunk) => void) => Effect.Effect<() => void, TerminalError>
  readonly subscribeToEvents: (processId: string, onEvent: (event: ProcessEvent) => void) => Effect.Effect<() => void, TerminalError>
}
```

**Key Changes**:
1. Remove `Stream.Stream<OutputChunk, TerminalError>` return type
2. Add callback parameter: `onOutput: (chunk: OutputChunk) => void`
3. Return cleanup function: `Effect.Effect<() => void, TerminalError>`
4. This matches the Event Emitter pattern (addListener/removeListener)

---

## Phase 2: Simplify Service (30 minutes)

### Update Terminal Service

**File**: `src/main/terminal/terminal-service.ts:221-242`

Change from Stream-returning methods to callback-based:

```typescript
interface TerminalServiceMethods {
  // ... existing methods ...

  // Change from Stream to callback-based
  subscribeToWatcher(processId: string, onOutput: (chunk: OutputChunk) => void): Effect.Effect<() => void, TerminalError, never>
  subscribeToWatcherEvents(processId: string, onEvent: (event: ProcessEvent) => void): Effect.Effect<() => void, TerminalError, never>
}

const subscribeToWatcher: TerminalServiceMethods['subscribeToWatcher'] = (processId, onOutput) => {
  console.log('[TerminalService] subscribeToWatcher called for:', processId)
  return Effect.gen(function* () {
    const adapter = yield* registry.getDefaultAdapter()
    console.log('[TerminalService] Got adapter, calling subscribe')
    return yield* adapter.subscribe(processId, onOutput)
  })
}

const subscribeToWatcherEvents: TerminalServiceMethods['subscribeToWatcherEvents'] = (processId, onEvent) => {
  return Effect.gen(function* () {
    const adapter = yield* registry.getDefaultAdapter()
    return yield* adapter.subscribeToEvents(processId, onEvent)
  })
}
```

---

## Phase 3: Simplify IPC Handlers (30 minutes)

### Update Terminal Handlers

**File**: `src/main/ipc/terminal-handlers.ts:88-180`

Replace complex Fiber-based stream handling with simple callback registration:

```typescript
/**
 * Subscription tracking for callback-based IPC
 */
interface Subscription {
  id: string
  processId: string
  cleanupOutput: () => void
  cleanupEvents: () => void
}

// Subscribe to watcher output/events
console.log('[TerminalHandlers] Registering subscribe-to-watcher handler')
registerIpcHandler(
  TerminalIpcContracts['terminal:subscribe-to-watcher'],
  ({ processId }) => {
    console.log('[TerminalHandlers] ========== SUBSCRIPTION HANDLER CALLED ==========')
    console.log('[TerminalHandlers] ProcessId:', processId)

    return Effect.gen(function* () {
      console.log('[TerminalHandlers] ========== INSIDE EFFECT.GEN ==========')
      console.log('[TerminalHandlers] Subscribing to watcher:', processId)

      const subscriptionId = `sub-${processId}-${Date.now()}`

      // Define callback that sends via IPC
      const sendOutputViaIpc = (chunk: OutputChunk) => {
        console.log('[TerminalHandlers] !!!!! Sending output chunk to renderer:', chunk.data.substring(0, 50))

        // Send to all renderer windows (check if not destroyed)
        const windows = BrowserWindow.getAllWindows()
        console.log('[TerminalHandlers] Sending to', windows.length, 'windows')

        windows.forEach((window) => {
          if (!window.isDestroyed() && window.webContents && !window.webContents.isDestroyed()) {
            window.webContents.send(`terminal:stream:${processId}`, {
              type: 'output' as const,
              data: chunk,
            })
          }
        })
      }

      const sendEventViaIpc = (event: ProcessEvent) => {
        console.log('[TerminalHandlers] Sending event to renderer:', event.type)

        const windows = BrowserWindow.getAllWindows()
        windows.forEach((window) => {
          if (!window.isDestroyed() && window.webContents && !window.webContents.isDestroyed()) {
            window.webContents.send(`terminal:stream:${processId}`, {
              type: 'event' as const,
              data: event,
            })
          }
        })
      }

      // Register callbacks with terminal service
      console.log('[TerminalHandlers] Registering callbacks with terminal service')
      const cleanupOutput = yield* terminalService.subscribeToWatcher(processId, sendOutputViaIpc)
      const cleanupEvents = yield* terminalService.subscribeToWatcherEvents(processId, sendEventViaIpc)
      console.log('[TerminalHandlers] Callbacks registered')

      // Store subscription
      subscriptions.set(subscriptionId, {
        id: subscriptionId,
        processId,
        cleanupOutput,
        cleanupEvents,
      })

      console.log('[TerminalHandlers] ========== SUBSCRIPTION CREATED:', subscriptionId, '==========')
      return { subscriptionId }
    })
  }
)

// Unsubscribe from watcher
console.log('[TerminalHandlers] Registering unsubscribe-from-watcher handler')
registerIpcHandler(
  TerminalIpcContracts['terminal:unsubscribe-from-watcher'],
  ({ subscriptionId }) => Effect.gen(function* () {
    const subscription = subscriptions.get(subscriptionId)
    if (subscription) {
      // Call cleanup functions (removes callbacks from adapter)
      subscription.cleanupOutput()
      subscription.cleanupEvents()
      subscriptions.delete(subscriptionId)
    }
  })
)
```

**Key Changes**:
1. Remove Fiber management entirely
2. Use direct callbacks that call `BrowserWindow.webContents.send()`
3. Store cleanup functions instead of fibers
4. Much simpler, follows VS Code's pattern exactly

---

## Phase 4: Verify Renderer (15 minutes)

### Check Terminal Atoms

**File**: `src/renderer/atoms/terminal-atoms.ts`

The renderer side should already work - it just needs to receive IPC events:

```typescript
// Terminal subscription manager (handles IPC streaming)
class TerminalSubscriptionManager {
  private subscriptions = new Map<string, string>() // processId -> subscriptionId
  private listeners = new Map<string, (data: any) => void>()

  subscribe(processId: string, onData: (data: OutputChunk | ProcessEvent) => void) {
    return Effect.gen(function* () {
      // If already subscribed, just add listener
      if (this.subscriptions.has(processId)) {
        return { unsubscribe: () => this.unsubscribe(processId) }
      }

      const ipc = yield* ElectronIpcClient
      const { subscriptionId } = yield* ipc.invoke('terminal:subscribe-to-watcher', { processId })

      this.subscriptions.set(processId, subscriptionId)

      // Set up IPC listener - THIS ALREADY WORKS
      const listener = (_event: any, message: { type: 'output' | 'event', data: any }) => {
        console.log('[TerminalSubscriptionManager] Received IPC message:', message.type)

        if (message.type === 'output') {
          const chunk = message.data as OutputChunk
          // Update output buffer
          const buffer = outputBuffers.get(processId)
          if (buffer) {
            const newLines = chunk.data.split('\n')
            buffer.lines.push(...newLines)

            if (buffer.lines.length > buffer.maxLines) {
              buffer.lines = buffer.lines.slice(-buffer.maxLines)
            }
          }
        }

        onData(message.data)
      }

      this.listeners.set(processId, listener)
      window.electron.ipcRenderer.on(`terminal:stream:${processId}`, listener)

      return {
        unsubscribe: () => this.unsubscribe(processId),
      }
    }.bind(this))
  }

  // ... rest of class
}
```

**This code should work as-is!** The renderer is already set up correctly to receive IPC events.

---

## Testing Checklist

### Phase 1: Adapter Changes
- [ ] Compile with `pnpm compile:app` - verify no TypeScript errors
- [ ] Check adapter exports callback-based subscribe methods
- [ ] Verify ProcessInstance has callback Sets, not Queue Sets

### Phase 2: Service Changes
- [ ] Compile with `pnpm compile:app`
- [ ] Verify service methods accept callback parameters
- [ ] Check return type is `Effect<() => void, TerminalError>`

### Phase 3: Handler Changes
- [ ] Compile with `pnpm compile:app`
- [ ] Verify no Fiber imports/usage
- [ ] Check subscriptions store cleanup functions

### Phase 4: Integration Test
- [ ] Run `pnpm dev`
- [ ] Spawn a watcher process
- [ ] Type in terminal - should see characters echoed
- [ ] Check console logs for:
  - "Received PTY data"
  - "Invoking N output callbacks"
  - "Sending output chunk to renderer"
  - "Received IPC message: output"
- [ ] Verify xterm.js displays output

## Key Principles

### 1. Push > Pull
- Data flows via callbacks (push), not by pulling from queues
- PTY pushes to callbacks, callbacks push to IPC, IPC pushes to renderer
- No polling, no queue consumers

### 2. Direct Callbacks > Streams
- Streams are for composable transformations
- Simple data forwarding doesn't need streams
- Callbacks are more direct and easier to debug

### 3. Effect for Operations, Not Data Flow
- Use Effect for operations (subscribe, unsubscribe, send)
- Don't use Effect Streams for simple event forwarding
- Effect.runPromise to bridge imperative PTY callbacks to functional code

### 4. Follow VS Code's Pattern
- They solved this problem well
- Don't over-engineer with unnecessary abstractions
- Event-driven push is the right pattern

### 5. Cleanup via Functions, Not Fibers
- Return cleanup functions from subscribe
- Cleanup just removes callback from Set
- No complex Fiber interruption needed

## Performance Considerations

### Before (Broken)
- Create Queue per subscription
- Fork Fiber to pull from Queue
- Stream.asyncScoped overhead
- Never actually works

### After (Fixed)
- Simple Set of callbacks
- Direct function invocation
- Minimal overhead
- Actually works!

## Success Criteria

The fix is complete when:

1. ✅ PTY onData callback invokes all registered output callbacks
2. ✅ Callbacks send IPC messages immediately
3. ✅ Renderer receives IPC events with output chunks
4. ✅ XTerm.js displays output in real-time
5. ✅ Characters typed in terminal echo back
6. ✅ No TypeScript errors
7. ✅ Logs show complete data flow
8. ✅ Cleanup properly removes callbacks
9. ✅ Multiple subscriptions work concurrently
10. ✅ Event-driven push architecture verified

## Migration Notes

### Breaking Changes
- `subscribe()` and `subscribeToEvents()` signatures changed from Stream-returning to callback-accepting
- Handlers no longer use Fibers
- Subscriptions store cleanup functions, not Fiber references

### Backward Compatibility
- No external API changes (IPC contracts unchanged)
- Internal refactor only
- Terminal components work without changes

## Conclusion

This plan replaces the broken Stream-based approach with a simple, event-driven push architecture that matches VS Code's proven pattern. By removing unnecessary abstractions (Streams, Queues, Fibers) and using direct callbacks, we get:

- **Simpler code** - easier to understand and debug
- **Better performance** - no queue/stream overhead
- **Actually works** - proven pattern from VS Code
- **Effect-ful** - still uses Effect for operations, just not for data flow

The key insight: **Use the right tool for the job**. Streams are great for transformation pipelines, but simple event forwarding is better done with callbacks.
