# Geppetto AI Runners: Quick Reference Guide

## Three Key Documents

1. **ARCHITECTURE_ANALYSIS_SUMMARY.md** (START HERE)
   - High-level overview
   - Design decisions
   - Implementation roadmap
   - Success criteria

2. **TMUX_AI_WATCHERS_ARCHITECTURE.md** (DETAILED)
   - Complete port specifications
   - Service layer design
   - IPC contracts
   - Code examples

3. **TmuxPrompts/** (REFERENCE)
   - ULTIMATE_GUIDE.md - All logger types
   - TMUX_LOGGER_GUIDE.md - Tmux deep dive
   - STRUCTURED_CONCURRENCY.md - Why forkScoped
   - tmux-logger.ts - Implementation reference

---

## Hexagonal Ports Pattern

### Port (Interface)
```typescript
export interface ProcessMonitorPort {
  spawn(command, args, options): Effect<ProcessMonitorHandle, Error, Scope>
  monitorExisting(sessionName, options): Effect<ProcessMonitorHandle, Error, Scope>
}
```

### Adapter (Implementation)
```typescript
export const ProcessMonitorService = Effect.Service.make<ProcessMonitorPort>(
  "ProcessMonitor"
)(/* implementation using tmux-logger patterns */)
```

### Service (High-level)
```typescript
export const AiRunnerRegistry = Effect.Service.make<AiRunnerPort>()(
  Effect.gen(function* () {
    const processMonitor = yield* ProcessMonitorPort
    // ... orchestration ...
  })
)
```

---

## Error Handling Flow

```
Domain Error          ProcessMonitorError
    ↓
Mapper               mapDomainErrorToIpcError()
    ↓
IPC Error            ProcessOperationError
    ↓
Renderer Atom        Result<data, IpcError>
    ↓
Component            Result.builder().onErrorTag(...)
    ↓
UI                   Toast/Modal/Inline
```

---

## Service Composition

```typescript
const MainLayer = Layer.mergeAll(
  // ... existing services ...
  
  // NEW: AI Runners
  TmuxSessionManagerService.Default,
  ProcessMonitorService.Default,
  AiRunnerRegistry.Default,
)
```

---

## IPC Type Safety Pattern

**Use the centralized `registerIpcHandler` utility:**

```typescript
import { registerIpcHandler } from './ipc-handler-setup'

// Register handlers with automatic type safety
registerIpcHandler(
  AiRunnerIpcContracts.getRunner,
  (input) => aiRunnerService.get(input.runnerId)
)
```

**Benefits:**
- ✅ Automatic input validation & output encoding
- ✅ Automatic error mapping
- ✅ Full type safety (dual-type schema pattern handled internally)
- ✅ Less boilerplate, fewer errors

**Key:** The utility handles dual-type schemas internally to prevent type erasure across IPC boundary.

---

## Result.builder Pattern (React)

```typescript
return Result.builder(result)
  .onInitial(() => <LoadingSpinner />)
  .onErrorTag('ProcessOperationError', (error) => (
    <ErrorAlert error={error} action={<RetryButton />} />
  ))
  .onErrorTag('TierLimitError', (error) => (
    <TierLimitAlert requiredTier={error.requiredTier} />
  ))
  .onDefect((defect) => {
    console.error('[Component]', defect)
    return <ErrorAlert message={String(defect)} />
  })
  .onSuccess((data) => <DataView data={data} />)
  .render()
```

**Rules:**
- ✅ Handle all error tags from IPC union
- ✅ Always include .onDefect()
- ✅ Log defects in development
- ✅ Provide actionable UI

---

## Structured Concurrency Pattern

```typescript
Effect.gen(function* () {
  // Create background fiber
  const monitor = pipe(
    checkActivityLoop(),
    Effect.repeat(Schedule.spaced("1 second")),
    Effect.forkScoped  // ← Tied to scope
  )
  
  yield* monitor
  yield* mainWork()
  
  // When done, monitor fiber auto-interrupted
}).pipe(Effect.scoped)  // ← Creates scope
```

**Benefits:**
- No resource leaks
- Automatic cleanup
- Predictable lifetime

---

## File Structure Template

```
src/main/ai-runners/
├── ports.ts                    # ProcessMonitorPort, AiRunnerPort
├── errors.ts                   # Domain errors
├── tmux-session-manager.ts     # Tmux lifecycle
├── process-monitor.ts          # ProcessMonitor adapter
├── ai-runner-service.ts       # High-level service
└── ai-runner-registry.ts      # Multi-runner registry

src/main/ipc/
└── ai-runner-handlers.ts      # IPC handler setup

src/shared/
├── ipc-contracts.ts            # AiRunnerIpcContracts
└── schemas/errors.ts           # ProcessOperationError, etc.

src/renderer/
├── atoms/ai-runner-atoms.ts   # Effect atoms
└── components/
    └── AiRunnerMonitor.tsx    # React components
```

---

## Key Principles

| Principle | Pattern | Benefit |
|-----------|---------|---------|
| **Hexagonal** | Port → Adapter → Service | Swappable implementations |
| **Typed** | Schema.decodeUnknown + type inference | No runtime surprises |
| **Structured** | Effect.forkScoped + Effect.scoped | No resource leaks |
| **Graceful** | Result.builder + exhaustive .onErrorTag() | No silent failures |
| **Extensible** | Provider adapters + registry pattern | Easy to add providers |

---

## Common Tasks

### Add a New Provider Runner

1. Create `src/main/ai-runners/providers/openai-runner-adapter.ts`
2. Implement custom metrics tracking
3. Register in AiRunnerRegistry
4. Update renderer atoms and components

### Add a New Process Monitor Backend

1. Create adapter implementing ProcessMonitorPort
2. Replace TmuxSessionManagerService.Default
3. No changes to AiRunnerRegistry or IPC contracts

### Add a New Error Type

1. Define in `src/main/{domain}/errors.ts`
2. Map in `src/main/ipc/error-mapper.ts`
3. Add to `src/shared/schemas/errors.ts`
4. Handle in `Result.builder().onErrorTag(...)`

---

## Testing Strategy

### Unit Tests
- ProcessMonitor spawning
- AiRunner metrics tracking
- Error mapping

### Integration Tests
- Full workflow: start → monitor → stop
- Error flows: tier limit, network, etc.
- Multi-provider coordination

### E2E Tests
- Real tmux session creation
- User attach/detach
- Log file rotation

---

## Troubleshooting

### "Tmux not installed"
```bash
# Linux
sudo apt install tmux

# macOS
brew install tmux
```

### "Session already exists"
```bash
# Use unique session names
tmux list-sessions
tmux kill-session -t <name>
```

### "Monitoring stops but process continues"
This is by design! Session runs independently.
```bash
tmux attach -t <session-name>
tmux kill-session -t <session-name>
```

---

## Performance Considerations

- **Max Runners:** 5-10 concurrent (depends on available fibers)
- **Log Rotation:** 100MB per file (configurable)
- **Idle Timeout:** 5s default (configurable)
- **Poll Interval:** 5s for atoms (adjustable)

---

## Security Notes

- Tmux sessions inherit user permissions
- Logs may contain sensitive output
- Consider encryption for stored logs
- Audit access to runner metrics

---

## Deliverables

### Week 1 (Foundation)
- ProcessMonitorPort + AiRunnerPort defined
- Domain errors defined
- TmuxSessionManagerService implemented
- Unit tests passing

### Week 2 (Services)
- All service implementations complete
- Error mapper updated
- MainLayer updated
- Integration tests passing

### Week 3 (IPC & Frontend)
- IPC contracts defined
- IPC handlers implemented
- Renderer atoms created
- UI components working

### Week 4 (Polish)
- End-to-end tests
- Error presenter integration
- Documentation complete
- Ready for production

---

## Quick Links

- Main docs: `/home/ken-udovic/Workspace/node/geppetto/docs/`
- TmuxPrompts: `/home/ken-udovic/Workspace/node/geppetto/docs/TmuxPrompts/`
- Current code: `/home/ken-udovic/Workspace/node/geppetto/src/`
- GitHub: [geppetto-ai](https://github.com/ken-udovic/geppetto)

---

## Related Documents

- **ARCHITECTURE_ANALYSIS_SUMMARY.md** - Complete overview
- **TMUX_AI_WATCHERS_ARCHITECTURE.md** - Detailed specifications
- **error-refactor-plan.md** - Error handling design
- **TmuxPrompts/ULTIMATE_GUIDE.md** - Process logger guide
- **CLAUDE.md** - Geppetto's design philosophy

