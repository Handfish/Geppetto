# Structured Concurrency with Effect.forkScoped

## Why Not Effect.forkDaemon?

The original implementation used `Effect.forkDaemon`, but this is **antipattern** for most use cases. Here's why:

### The Problem with forkDaemon

```typescript
// ❌ BAD: Daemon fibers are detached
Effect.gen(function* () {
  yield* someLongRunningTask.pipe(Effect.forkDaemon)
  // Parent can finish, but daemon keeps running globally
  // No structured cleanup, unpredictable lifecycle
})
```

**Issues:**
- Daemon fibers run **globally**, detached from your program's lifecycle
- They can continue running even after main logic finishes
- Resource management becomes unpredictable
- You lose structured concurrency (Effect's superpower)
- Difficult to reason about when things actually stop

### The Solution: Effect.forkScoped

```typescript
// ✅ GOOD: Scoped fibers tied to scope lifecycle
Effect.gen(function* () {
  yield* someLongRunningTask.pipe(Effect.forkScoped)
  // Fiber is tied to the current scope
  // When scope closes, fiber is gracefully interrupted
}).pipe(Effect.scoped)
```

**Benefits:**
- Fibers are tied to a **scope**, not just the immediate parent
- Automatic cleanup when scope closes
- Structured concurrency maintained
- Predictable resource management
- Composable with other Effect patterns

## How It Works in the Process Logger

### 1. The Logger Creates a Scope

```typescript
export const createProcessLogger = (...) => {
  return Effect.gen(function* () {
    // ... setup code ...
    
    // Background fiber for processing stream
    const processStream = pipe(
      processHandle.outputStream,
      Stream.tap((output) => /* process output */),
      Stream.runDrain,
      Effect.forkScoped  // ← Tied to logger's scope
    )
    
    yield* processStream
    
    // ... return logger API ...
  }).pipe(Effect.scoped)  // ← Creates the scope
}
```

**Key points:**
- `Effect.scoped` creates a scope for the logger
- `Effect.forkScoped` creates fibers within that scope
- When the logger's scope closes (e.g., process completes), all scoped fibers are interrupted

### 2. Activity Tracker is Scoped

```typescript
const makeActivityTracker = (config: LoggerConfig) => {
  return Effect.gen(function* () {
    // ... refs setup ...
    
    // Background fiber that checks for idle state
    const idleChecker = pipe(
      checkIdleStatus,
      Effect.repeat(Schedule.spaced("1 second")),
      Effect.forkScoped  // ← Scoped to the tracker (and logger)
    )
    
    yield* idleChecker
    return { markActive, getState }
  })
}
```

**Lifecycle:**
- The idle checker runs in the background
- It's scoped to the logger's lifetime
- When logger completes/stops, idle checker is automatically interrupted

### 3. User Code Can Add More Scoped Fibers

```typescript
const monitor = Effect.gen(function* () {
  const logger = yield* createProcessLogger("npm", ["run", "dev"])
  
  // User's monitoring fiber - also scoped
  const activityMonitor = pipe(
    Effect.gen(function* () {
      while (true) {
        const state = yield* logger.getActivityState
        console.log(`State: ${state}`)
        yield* Effect.sleep("1 second")
      }
    }),
    Effect.forkScoped  // ← Scoped to this Effect
  )
  
  yield* activityMonitor
  yield* logger.waitForCompletion
})
```

**The hierarchy:**
```
monitor scope
  ├─ logger scope
  │   ├─ processStream fiber
  │   └─ idleChecker fiber
  └─ activityMonitor fiber
```

When `monitor` completes:
1. `activityMonitor` fiber is interrupted
2. `logger` scope closes
3. `processStream` and `idleChecker` fibers are interrupted
4. All resources cleaned up

## Comparison: fork vs forkDaemon vs forkScoped

### Effect.fork
```typescript
Effect.gen(function* () {
  const child = yield* longTask.pipe(Effect.fork)
  // Child tied to THIS Effect's lifetime
  return "done"
  // ⚠️ Child interrupted when parent returns
})
```
**Problem:** Parent completes too early, child work is lost.

### Effect.forkDaemon
```typescript
Effect.gen(function* () {
  yield* longTask.pipe(Effect.forkDaemon)
  return "done"
  // ⚠️ Child keeps running globally, no structure
})
```
**Problem:** Child never stops, leaks resources.

### Effect.forkScoped
```typescript
Effect.gen(function* () {
  yield* longTask.pipe(Effect.forkScoped)
  yield* otherWork
  return "done"
  // ✅ Child lives until scope closes
}).pipe(Effect.scoped)
```
**Solution:** Child lives as long as the scope, structured cleanup.

## Real-World Pattern: Process Logger

The process logger is designed to be **embedded** in a larger Effect program:

```typescript
// Larger program with its own scope
const myApp = Effect.gen(function* () {
  // Logger runs in its own scope
  const logger = yield* createProcessLogger("build", ["--watch"])
  
  // Do other work while build runs
  yield* handleWebhooks
  yield* updateDatabase
  
  // Wait for build to complete
  yield* logger.waitForCompletion
  
  // When myApp completes, logger scope closes automatically
  // All background fibers (processStream, idleChecker) are cleaned up
})

Effect.runPromise(myApp)
```

## Key Takeaways

1. **Use `Effect.forkScoped` for background fibers** - They're tied to a scope, not a specific parent
2. **Wrap your Effect in `Effect.scoped`** - This creates the scope that manages fiber lifetimes
3. **Avoid `Effect.forkDaemon`** - Only use for truly global background work (rare!)
4. **Structured concurrency = predictable cleanup** - Resources are automatically managed

## When to Actually Use forkDaemon?

Only use `Effect.forkDaemon` when you need:
- A fiber that outlives your entire program (e.g., metrics collector)
- Background work that's truly independent of any scope
- You're managing cleanup manually with explicit interruption

For 99% of cases, **use `Effect.forkScoped`** instead.

## Further Reading

- [Effect Concurrency Documentation](https://effect.website/docs/concurrency/)
- [Scope Documentation](https://effect.website/docs/resource-management/scope)
- [Structured Concurrency Explained](https://vorpus.org/blog/notes-on-structured-concurrency-or-go-statement-considered-harmful/)
