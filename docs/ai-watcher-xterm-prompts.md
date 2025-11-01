# AI Watcher XTerm.js Terminal - Implementation Prompts

> **Purpose**: Ready-to-use prompts for implementing the xterm.js terminal migration following our established patterns and Effect-TS best practices.

## Prompt #1: Initial Implementation (Start Fresh)

Use this prompt when starting the implementation from scratch:

```
Please implement the AI Watcher XTerm.js terminal migration as documented in docs/ai-watcher-xterm-plan.md.

Follow our established patterns:
1. **Hexagonal Architecture**: Start with the port definition, then create adapters as Effect Layers
2. **Effect-TS**: Use Effect.gen for all async operations, proper service dependencies
3. **Schema Validation**: Use Schema.parse() not validate() or decode()
4. **Layer Memoization**: Export layers as module-level constants
5. **Type Safety**: No `any` types, use `unknown` at boundaries only
6. **IPC Contracts**: Define schemas first, then use registerIpcHandler utility
7. **Error Handling**: Tagged errors with Data.TaggedError, proper error mapping

Start with Phase 1: Terminal Port & Adapter Architecture
- Create the TerminalPort interface in src/main/terminal/terminal-port.ts
- Implement NodePtyTerminalAdapter as an Effect Layer
- Create the Terminal Registry and Service
- Follow the pattern from src/main/ai/ (AiProviderPort, adapters, registry)

Key requirements:
- Process management with spawn/kill/restart
- Stream-based output handling with PubSub
- Idle detection (30s for issues, 60s default)
- Support for multiple concurrent processes
- Integration with AccountContextService for credentials

After each phase, run `pnpm compile:app` to verify no TypeScript errors.
Update docs/ai-watcher-xterm-progress.md as you complete each section.

Expected duration: 10-12 hours across 4 phases.
```

## Prompt #2: Continue Progress (Same Session)

Use this prompt to continue work in the same conversation:

```
Let's continue implementing the xterm.js terminal migration.

First, check the progress document at docs/ai-watcher-xterm-progress.md to see what's been completed.

Continue with the next uncompleted phase, following the plan in docs/ai-watcher-xterm-plan.md.

Remember our key patterns:
- Hexagonal architecture with ports and adapters
- Effect.gen for async operations
- Schema.parse() for validation
- Layer composition with memoization
- Tagged errors for domain errors
- Result.builder for UI error handling
- TTL caching for atoms

After completing each section:
1. Run `pnpm compile:app` to check for errors
2. Update the progress document
3. Note any issues encountered

Focus on clean, maintainable code that follows our established patterns.
```

## Prompt #3: Resume After Context Loss (New Conversation)

Use this prompt when starting a new conversation to resume work:

```
I need to resume implementing the AI Watcher xterm.js terminal migration.

Please:
1. Read docs/ai-watcher-xterm-plan.md to understand the full implementation plan
2. Read docs/ai-watcher-xterm-progress.md to see what's already completed
3. Review the codebase to verify actual implementation state:
   - Check if src/main/terminal/ exists
   - Check if terminal IPC contracts are defined
   - Check if XTerminal component exists
   - Verify Main Layer includes TerminalLayer

Based on the actual state vs. documented progress, determine:
- What's actually implemented
- What's partially implemented
- What needs to be completed

Then continue from where we left off, following these patterns:
- **Hexagonal Architecture**: Ports define contracts, adapters implement them
- **Effect Services**: Use Effect.Service<T>() pattern with explicit dependencies
- **IPC**: Contract-based with Schema validation at boundaries
- **Atoms**: Reactive state with Result types and TTL caching
- **UI**: React components with proper memoization

Our goal is to replace tmux with an integrated xterm.js terminal that:
- Shows LED status indicators for each AI watcher
- Allows switching between multiple processes
- Provides native terminal emulation
- Integrates seamlessly with the Issues modal workflow

Update the progress document as you work.
```

## Quick Reference

### Commands

```bash
# Development
pnpm dev           # Run in development mode
pnpm dev:pro       # Run pro tier in development

# Compilation
pnpm compile:app   # Check TypeScript compilation

# Testing
pnpm lint          # Run linter
pnpm lint:fix      # Fix linting issues

# Dependencies
pnpm add node-pty @xterm/xterm @xterm/addon-fit @xterm/addon-web-links @xterm/addon-search
```

### File Structure

```
src/
├── main/
│   └── terminal/                    # NEW: Terminal domain
│       ├── terminal-port.ts         # Port definition
│       ├── node-pty/
│       │   └── adapter.ts          # NodePty adapter
│       ├── terminal-registry.ts     # Registry service
│       └── terminal-service.ts      # Domain service
├── shared/
│   ├── ipc-contracts/
│   │   └── terminal-contracts.ts    # IPC contracts
│   └── schemas/
│       └── terminal/
│           └── index.ts            # Terminal schemas
├── renderer/
│   ├── atoms/
│   │   └── terminal-atoms.ts       # Terminal state
│   ├── components/
│   │   └── terminal/
│   │       ├── XTerminal.tsx       # Terminal component
│   │       ├── TerminalLED.tsx     # LED indicator
│   │       └── TerminalPanel.tsx   # Panel container
│   └── hooks/
│       └── useTerminalOperations.ts # Terminal operations
```

### Pattern Reminders

#### Hexagonal Architecture
```typescript
// 1. Port (abstract interface)
export interface TerminalPort {
  spawn: (config: ProcessConfig) => Effect.Effect<ProcessState, TerminalError>
}

// 2. Adapter (concrete implementation)
export class NodePtyTerminalAdapter extends Effect.Service<NodePtyTerminalAdapter>()('NodePtyTerminalAdapter', {
  effect: Effect.gen(function* () { /* implementation */ }),
  dependencies: []
}) {}

// 3. Layer export
export const NodePtyTerminalAdapterLayer = Layer.succeed(TerminalPort, NodePtyTerminalAdapter.Default)
```

#### Effect Service Pattern
```typescript
export class TerminalService extends Effect.Service<TerminalService>()('TerminalService', {
  effect: Effect.gen(function* () {
    const registry = yield* TerminalRegistry
    // Service implementation
    return { /* methods */ }
  }),
  dependencies: [TerminalRegistry, AccountContextService]
}) {}
```

#### IPC Handler Registration
```typescript
registerIpcHandler(
  TerminalIpcContracts.spawnWatcher,
  (input) => terminalService.spawnAiWatcher(input)
)
```

#### Atom Pattern
```typescript
export const activeWatchersAtom = Atom.make(() =>
  Effect.gen(function* () {
    const ipc = yield* ElectronIpcClient
    return yield* ipc.terminal.listActiveWatchers()
  }).pipe(
    Effect.map(Result.success),
    Effect.catchAll((error) => Effect.succeed(Result.fail(error)))
  )
).pipe(
  Atom.setIdleTTL(Duration.minutes(1)),
  Atom.withKeys(['terminal:watchers'])
)
```

#### Result.builder Pattern
```typescript
{Result.builder(watchersResult)
  .onInitial(() => <div>Loading...</div>)
  .onErrorTag('TerminalError', (error) => <div>Error: {error.message}</div>)
  .onSuccess((watchers) => <WatcherList watchers={watchers} />)
  .render()}
```

## Migration Strategy

### Phase Priorities

1. **Core Architecture First**: Get the port/adapter/service structure working
2. **IPC Communication**: Establish main-renderer communication
3. **Basic UI**: Simple terminal display without fancy features
4. **Enhanced Features**: LED indicators, multiple processes, keyboard shortcuts

### Testing Strategy

After each phase:
1. Compile check: `pnpm compile:app`
2. Manual test in development: `pnpm dev`
3. Test basic operations:
   - Spawn a watcher
   - See output in terminal
   - Kill the process
4. Document any issues in progress tracker

### Rollback Points

- After Phase 1: Can rollback without UI impact
- After Phase 2: Can keep IPC, rollback UI only
- After Phase 3: Can use feature flag to toggle
- After Phase 4: Full migration complete

## Common Issues & Solutions

### Issue: PTY spawn fails on Windows
**Solution**: Ensure correct shell detection and path handling
```typescript
shell: process.platform === 'win32' ? 'powershell.exe' : '/bin/bash'
```

### Issue: Terminal output buffering
**Solution**: Limit buffer size and implement circular buffer
```typescript
if (buffer.lines.length > buffer.maxLines) {
  buffer.lines = buffer.lines.slice(-buffer.maxLines)
}
```

### Issue: Memory leaks from streams
**Solution**: Proper cleanup in useEffect
```typescript
return () => {
  subscriptionRef.current?.unsubscribe()
  terminal.dispose()
}
```

### Issue: Process zombies
**Solution**: Kill all processes on app close
```typescript
app.on('before-quit', () => {
  Effect.runPromise(terminalService.killAllWatchers())
})
```

## Success Criteria

The migration is complete when:
1. ✅ All tmux functionality replaced with xterm.js
2. ✅ LED indicators show process status
3. ✅ Multiple watchers can run concurrently
4. ✅ Terminal accepts input and shows output
5. ✅ Process management (kill/restart) works
6. ✅ Integration with Issues modal seamless
7. ✅ No TypeScript errors
8. ✅ Performance acceptable (<500ms startup)
9. ✅ Memory usage reasonable (<50MB per process)
10. ✅ All tests in progress document pass