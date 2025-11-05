# Terminal Streaming Fix - Implementation Prompts

> **Purpose**: Ready-to-use prompts for fixing the broken terminal streaming implementation using event-driven push architecture.

---

## Prompt #1: Kickoff - Start the Fix

Use this prompt when starting the fix from scratch:

```
Please fix the broken terminal streaming implementation as documented in docs/terminal-streaming-plan.md.

The current implementation uses Stream.asyncScoped with forked fibers to pull from queues, but this pattern doesn't work - the fibers never execute and no data flows.

The fix is to simplify to an event-driven push architecture (like VS Code):
1. PTY onData callback → directly invoke registered callbacks
2. Callbacks send IPC messages immediately
3. Renderer receives IPC events → writes to xterm.js
4. No intermediate Streams, Queues, or Fibers

Follow our established patterns:
- **Effect-TS**: Use Effect.gen for operations, Effect.runPromise to bridge callbacks
- **Schema Validation**: Use Schema.parse() not validate()
- **Hexagonal Architecture**: Keep ports abstract, adapters concrete
- **Type Safety**: No `any` types, proper callback signatures
- **Error Handling**: Tagged errors, proper error propagation
- **Clean Code**: Simple, understandable, minimal abstractions

Start with Phase 1: Simplify Adapter
1. Update ProcessInstance to use `Set<Callback>` instead of `Set<Queue>`
2. Rewrite subscribe() to accept callback parameter, return cleanup function
3. Update PTY onData to directly invoke callbacks (not Queue.offer)
4. Update TerminalPort interface signatures

Work through the phases in order:
- Phase 1: Adapter changes (1 hour)
- Phase 2: Service changes (30 minutes)
- Phase 3: Handler changes (30 minutes)
- Phase 4: Testing & verification (30 minutes)

After each phase, run `pnpm compile:app` to verify no TypeScript errors.
Update docs/terminal-streaming-progress.md as you complete each section.

Key files to modify:
- src/main/terminal/node-pty/adapter.ts (main changes)
- src/main/terminal/terminal-port.ts (signature updates)
- src/main/terminal/terminal-service.ts (signature updates)
- src/main/ipc/terminal-handlers.ts (remove Fibers, use callbacks)

Expected duration: 2-3 hours total.

The goal: Characters typed in terminal should echo back, proving the full round-trip works: input → PTY → bash → output → IPC → renderer → xterm.js
```

---

## Prompt #2: Continue - Same Session

Use this prompt to continue work in the same conversation:

```
Let's continue fixing the terminal streaming implementation.

First, check the progress document at docs/terminal-streaming-progress.md to see what's been completed.

Continue with the next uncompleted phase, following the plan in docs/terminal-streaming-plan.md.

Remember the key simplifications:
- Callback-based subscriptions (not Stream-returning)
- Direct callback invocation (not Queue.offer)
- Return cleanup functions (not Fibers)
- IPC send in callbacks (not in forked fibers)

After completing each section:
1. Run `pnpm compile:app` to check for errors
2. Update the progress document with checkmarks
3. Note any issues encountered

The architecture should be:
PTY onData → invoke callbacks → send IPC → renderer receives → write to xterm

Focus on simplicity and clarity. If you see complexity, you're probably doing it wrong.
```

---

## Prompt #3: Resume - After Context Loss

Use this prompt when starting a new conversation to resume work:

```
I need to resume fixing the broken terminal streaming implementation.

Please:
1. Read docs/terminal-streaming-plan.md to understand the fix strategy
2. Read docs/terminal-streaming-progress.md to see what's completed
3. Read docs/terminal-streaming-debug.md to understand the original problem
4. Review the actual code to verify implementation state:
   - Check src/main/terminal/node-pty/adapter.ts for ProcessInstance structure
   - Check if subscribe() methods use callbacks or return Streams
   - Check src/main/ipc/terminal-handlers.ts for Fiber usage
   - Verify if compilation works: `pnpm compile:app`

Based on the actual state vs. documented progress, determine:
- What's actually implemented and working
- What's partially implemented but broken
- What needs to be completed

Then continue from where we left off, following these patterns:

**Current Problem**:
- Stream.asyncScoped + forked fiber pattern doesn't work
- PTY data never reaches renderer
- Terminal shows no output

**Solution Pattern**:
- Simple callback-based subscriptions
- Direct IPC push from callbacks
- No intermediate abstractions

**Key Principles**:
1. **Push > Pull**: Data flows via callbacks (push), not pulling from queues
2. **Direct > Abstracted**: Callbacks call IPC send directly, no streams
3. **Simple > Complex**: Fewer abstractions, easier debugging
4. **Effect for Ops**: Use Effect for operations, not for data flow

**Testing**:
After each phase, verify with:
- `pnpm compile:app` (should have 0 errors)
- Check console logs show "Invoking N callbacks"
- Type in terminal, should see echo

The ultimate test:
1. Run `pnpm dev`
2. Spawn a runner
3. Type characters in terminal
4. See them echo back
5. Check logs show data flow from PTY → callbacks → IPC → renderer

Update the progress document as you work.
```

---

## Quick Reference

### Commands

```bash
# Development
pnpm dev              # Run in development mode
pnpm compile:app      # Check TypeScript compilation

# Testing
# After changes, restart dev server and test terminal
pkill -f "electron"   # Kill existing dev server
pnpm dev              # Restart
```

### Key Files

```
src/main/terminal/
├── node-pty/
│   └── adapter.ts           # MAIN CHANGES: callbacks, not queues
├── terminal-port.ts         # UPDATE: signatures
├── terminal-service.ts      # UPDATE: pass callbacks through
└── terminal-registry.ts     # NO CHANGES

src/main/ipc/
└── terminal-handlers.ts     # MAJOR CHANGES: remove Fibers, use callbacks

src/renderer/atoms/
└── terminal-atoms.ts        # NO CHANGES (already correct)

docs/
├── terminal-streaming-plan.md        # The fix strategy
├── terminal-streaming-progress.md    # Migration tracker
├── terminal-streaming-prompts.md     # This file
└── terminal-streaming-debug.md       # Original problem analysis
```

### Pattern Examples

#### ❌ Before (Broken)

```typescript
// Adapter - creates Queue per subscriber
const subscribe = (processId: string): Stream.Stream<OutputChunk, TerminalError> => {
  return Stream.asyncScoped<OutputChunk, TerminalError>((emit) =>
    Effect.gen(function* () {
      const queue = yield* Queue.unbounded<OutputChunk>()
      instance.outputQueues.add(queue)

      yield* Effect.forkScoped(
        Effect.gen(function* () {
          while (true) {
            const chunk = yield* Queue.take(queue)  // Never executes
            emit.single(chunk)
          }
        })
      )
    })
  )
}

// PTY handler - offers to queues
ptyProcess.onData((data) => {
  for (const queue of instance.outputQueues) {
    yield* Queue.offer(queue, chunk)  // Queues fill up but never consumed
  }
})

// Handler - tries to consume stream
const outputFiber = yield* outputStream.pipe(
  Stream.tap((chunk) => window.webContents.send(...)),
  Stream.runDrain,
  Effect.fork  // Fiber created but stream has no data
)
```

#### ✅ After (Fixed)

```typescript
// Adapter - simple callback registration
const subscribe = (
  processId: string,
  onOutput: (chunk: OutputChunk) => void
): Effect.Effect<() => void, TerminalError> => {
  return Effect.gen(function* () {
    // Get instance
    instance.outputCallbacks.add(onOutput)

    // Return cleanup function
    return () => {
      instance.outputCallbacks.delete(onOutput)
    }
  })
}

// PTY handler - directly invokes callbacks
ptyProcess.onData((data) => {
  const chunk = new OutputChunk({ /* ... */ })

  // Call all callbacks immediately
  for (const callback of instance.outputCallbacks) {
    callback(chunk)
  }
})

// Handler - just register callback
const sendViaIpc = (chunk: OutputChunk) => {
  window.webContents.send(`terminal:stream:${processId}`, {
    type: 'output',
    data: chunk
  })
}

const cleanupOutput = yield* terminalService.subscribeToRunner(processId, sendViaIpc)
```

### Data Flow Diagram

```
┌─────────────────────┐
│  PTY Process        │
│  (bash, claude, etc)│
└──────────┬──────────┘
           │ onData callback
           ▼
┌─────────────────────┐
│  Adapter            │
│  for (callback of   │
│    callbacks) {     │
│    callback(chunk)  │  ◄── Direct invocation
│  }                  │
└──────────┬──────────┘
           │ callback executes
           ▼
┌─────────────────────┐
│  IPC Handler        │
│  window.webContents │
│    .send(message)   │  ◄── Immediate push
└──────────┬──────────┘
           │ IPC event
           ▼
┌─────────────────────┐
│  Renderer           │
│  ipcRenderer.on()   │
│  terminal.write()   │  ◄── XTerm update
└─────────────────────┘
```

### Debugging Checklist

If data still doesn't flow after fix:

1. **Check adapter**:
   - [ ] outputCallbacks is Set<Function>, not Set<Queue>
   - [ ] PTY onData invokes callbacks, not Queue.offer
   - [ ] console.log shows "Invoking N callbacks"

2. **Check service**:
   - [ ] subscribeToRunner accepts callback parameter
   - [ ] Returns cleanup function
   - [ ] Passes callback to adapter

3. **Check handler**:
   - [ ] No Fiber imports/usage
   - [ ] sendViaIpc callback defined
   - [ ] Calls terminalService.subscribeToRunner(processId, sendViaIpc)
   - [ ] Stores cleanup function (not fiber)

4. **Check renderer**:
   - [ ] ipcRenderer.on listener registered
   - [ ] Listener receives events (add console.log)
   - [ ] xterm.write() called with data

5. **Check IPC**:
   - [ ] Main process: BrowserWindow.getAllWindows()
   - [ ] Check window.isDestroyed() before send
   - [ ] Renderer: correct channel name `terminal:stream:${processId}`

### Common Mistakes

1. **Still using Streams**:
   - If you see `Stream.asyncScoped`, remove it
   - If you see `Stream.fromPubSub`, remove it
   - Streams are for transformation, not simple forwarding

2. **Still using Queues**:
   - If you see `Queue.unbounded`, remove it
   - If you see `Queue.offer` or `Queue.take`, remove it
   - Use direct callback invocation instead

3. **Still using Fibers**:
   - If you see `Effect.fork` in handlers, remove it
   - If you see `Fiber.interrupt`, remove it
   - Callbacks execute synchronously, no fibers needed

4. **Wrong callback signature**:
   - Should be: `(chunk: OutputChunk) => void`
   - Not: `(chunk: OutputChunk) => Effect.Effect<...>`
   - Callbacks are imperative, not effectful

5. **Forgetting cleanup**:
   - subscribe() must return cleanup function
   - Cleanup removes callback from Set
   - Otherwise: memory leak

### Performance Expectations

After fix:
- **Latency**: <50ms from keystroke to display
- **CPU (idle)**: <1% per process
- **Memory**: ~30-50MB per process
- **Responsiveness**: No lag when typing rapidly
- **Scalability**: 10+ processes without issues

### Success Indicators

You know the fix is working when:

1. **Console logs show data flow**:
   ```
   [NodePtyAdapter] Received PTY data: h
   [NodePtyAdapter] Invoking 1 output callbacks
   [TerminalHandlers] Sending output chunk to renderer: h
   [TerminalSubscriptionManager] Received IPC message: output
   ```

2. **Terminal is interactive**:
   - Type characters → see them appear
   - Press Enter → see newline
   - Run commands → see output

3. **Multiple processes work**:
   - Switch between terminals
   - Each shows correct output
   - No cross-contamination

4. **Cleanup works**:
   - Kill process → callbacks stop
   - No memory leaks
   - Can restart process

## Troubleshooting

### Issue: "Invoking 0 callbacks"

**Symptom**: PTY receives data but no callbacks registered.

**Diagnosis**:
```bash
# Add to adapter.ts:379
console.log('subscribe() called, callbacks Set size:', instance.outputCallbacks.size)
```

**Solution**:
- Check if handler actually calls subscribe()
- Verify Effect is being run (not just created)
- Check processId matches between spawn and subscribe

### Issue: "Cannot read properties of undefined (reading 'webContents')"

**Symptom**: window.webContents.send() fails.

**Diagnosis**:
```typescript
const windows = BrowserWindow.getAllWindows()
console.log('Windows:', windows.length, windows.map(w => w.id))
```

**Solution**:
- Check window exists: `windows.length > 0`
- Check not destroyed: `!window.isDestroyed()`
- Wait for window ready before spawning processes

### Issue: "Renderer not receiving events"

**Symptom**: Handler sends IPC but renderer doesn't receive.

**Diagnosis**:
```typescript
// Renderer:
window.electron.ipcRenderer.on('terminal:stream:test', (_, msg) => {
  console.log('Test message received:', msg)
})

// Main:
windows[0].webContents.send('terminal:stream:test', { test: true })
```

**Solution**:
- Check channel name matches exactly
- Verify preload script exposes ipcRenderer
- Check DevTools console for errors

### Issue: "XTerm not displaying output"

**Symptom**: Renderer receives data but terminal blank.

**Diagnosis**:
```typescript
// In TerminalSubscriptionManager listener:
console.log('Writing to xterm:', chunk.data)
```

**Solution**:
- Check XTerminal component mounted
- Verify xtermRef.current exists
- Check xterm.write() being called
- Inspect xterm buffer: `xtermRef.current.buffer.active`

## Validation Script

Run this after implementing the fix:

```typescript
// Add to src/main/terminal/__tests__/streaming.test.ts

test('callback-based streaming works', async () => {
  // Spawn process
  const { processId } = await spawnAiRunner({ /* config */ })

  // Subscribe with test callback
  let receivedData = ''
  const cleanup = await subscribeToRunner(processId, (chunk) => {
    receivedData += chunk.data
  })

  // Write to PTY
  await writeToRunner(processId, 'echo test\n')

  // Wait for output
  await sleep(500)

  // Verify callback received data
  expect(receivedData).toContain('test')

  // Cleanup
  cleanup()
  await killRunner(processId)
})
```

## Completion Checklist

Before marking the fix as complete:

- [ ] All 4 phases implemented
- [ ] Zero TypeScript errors
- [ ] Console logs show data flow
- [ ] Terminal displays typed characters
- [ ] Echo test passes (type → see output)
- [ ] Multiple processes work
- [ ] Cleanup verified (no leaks)
- [ ] Progress document updated
- [ ] Performance acceptable
- [ ] Code reviewed for simplicity

## Next Steps After Fix

Once terminal streaming works:

1. **Remove debug logs** - Clean up console.log statements
2. **Add error boundaries** - Handle edge cases gracefully
3. **Performance tuning** - Profile with 10+ processes
4. **UI polish** - Improve terminal panel UX
5. **Documentation** - Update architecture docs
6. **Integration** - Connect with Issues modal workflow
7. **Testing** - Add automated tests
