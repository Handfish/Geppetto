# Process Logger with Structured Concurrency - Complete Guide

## 🎯 Overview

A production-ready streaming process logger built with EffectTS using **structured concurrency** principles. This implementation captures stdout/stderr, manages rolling log files (100MB default), tracks process activity (idle/active), and properly manages all background fibers using `Effect.forkScoped` instead of `Effect.forkDaemon`.

## 📚 Documentation Files

### Core Implementation
- **[process-logger.ts](computer:///mnt/user-data/outputs/process-logger.ts)** - Main implementation with all patterns
- **[example-usage.ts](computer:///mnt/user-data/outputs/example-usage.ts)** - Real-world usage examples
- **[test-simple.ts](computer:///mnt/user-data/outputs/test-simple.ts)** - Working tests

### Learning Resources
- **[STRUCTURED_CONCURRENCY.md](computer:///mnt/user-data/outputs/STRUCTURED_CONCURRENCY.md)** - Why we use `forkScoped` instead of `forkDaemon`
- **[MIGRATION_GUIDE.md](computer:///mnt/user-data/outputs/MIGRATION_GUIDE.md)** - Changes from daemon to scoped fibers
- **[minimal-scoped-example.ts](computer:///mnt/user-data/outputs/minimal-scoped-example.ts)** - Simple examples showing the pattern
- **[patterns-reference.ts](computer:///mnt/user-data/outputs/patterns-reference.ts)** - EffectTS patterns catalog
- **[PROCESS_LOGGER_README.md](computer:///mnt/user-data/outputs/PROCESS_LOGGER_README.md)** - Usage documentation

### Supporting Files
- **[package.json](computer:///mnt/user-data/outputs/package.json)** - Dependencies

## 🔑 Key Architectural Decision: Structured Concurrency

### Why Effect.forkScoped (Not Effect.forkDaemon)

This implementation uses **`Effect.forkScoped`** throughout for structured concurrency:

```typescript
// ❌ AVOID: forkDaemon (global, detached)
const badPattern = pipe(
  longTask,
  Effect.forkDaemon  // Runs forever, no cleanup
)

// ✅ PREFER: forkScoped (scoped, structured)
const goodPattern = Effect.gen(function* () {
  const fiber = yield* pipe(
    longTask,
    Effect.forkScoped  // Tied to scope lifecycle
  )
  // ... do work ...
  // fiber automatically cleaned up when scope closes
}).pipe(Effect.scoped)
```

**Benefits:**
1. **Automatic cleanup** - Fibers stop when their scope closes
2. **Predictable lifecycle** - Clear parent-child relationships
3. **Resource safety** - No leaked background tasks
4. **Composability** - Scopes can nest naturally
5. **Structured concurrency** - The foundation of Effect's safety guarantees

## 🏗️ Architecture

### Scope Hierarchy

```
createProcessLogger scope
  ├─ Log Writer
  │   └─ File management logic
  ├─ Activity Tracker
  │   └─ idleChecker fiber (forkScoped)
  └─ Process Stream
      └─ processStream fiber (forkScoped)

User's program scope
  ├─ logger (from createProcessLogger)
  └─ monitoring fibers (user-added, forkScoped)
```

When the logger completes:
1. Logger scope closes
2. `idleChecker` fiber interrupted
3. `processStream` fiber interrupted  
4. All resources cleaned up
5. No orphaned fibers

### Core Components

1. **Schema-based Parsing** - Type-safe data validation
2. **Tagged Errors** - Structured error handling
3. **Ref for State** - Thread-safe mutable state
4. **Deferred for Events** - Bridge Node.js callbacks to Effect
5. **Queue + Stream** - Process stdout/stderr with backpressure
6. **Scoped Fibers** - Background tasks with automatic cleanup

## 🚀 Quick Start

### Installation

```bash
npm install effect
```

### Basic Usage

```typescript
import { createProcessLogger } from "./process-logger"
import * as Effect from "effect/Effect"

const program = Effect.gen(function* () {
  // Logger automatically manages its scope
  const logger = yield* createProcessLogger("npm", ["run", "build"], {
    maxFileSize: 100 * 1024 * 1024, // 100MB
    outputDir: "./logs",
    baseFileName: "build-output",
    idleTimeoutMs: 5000,
  })

  // Check activity state
  const state = yield* logger.getActivityState
  console.log(`Process is ${state}`) // "active" or "idle"

  // Get log file info
  const logState = yield* logger.getLogState
  console.log(`File: ${logState.currentFile}`)
  console.log(`Size: ${logState.currentSize} bytes`)
  console.log(`Rotations: ${logState.rotationCount}`)

  // Wait for completion
  yield* logger.waitForCompletion
})

Effect.runPromise(program)
```

### With Background Monitoring

```typescript
const monitored = Effect.gen(function* () {
  const logger = yield* createProcessLogger("long-task", [])

  // Add your own scoped monitoring fiber
  const monitor = pipe(
    Effect.gen(function* () {
      while (true) {
        const state = yield* logger.getActivityState
        if (state === "idle") {
          console.log("⚠️ Process appears idle!")
        }
        yield* Effect.sleep("2 seconds")
      }
    }),
    Effect.forkScoped  // Tied to this Effect's scope
  )

  yield* monitor
  yield* logger.waitForCompletion
  
  // Both logger and monitor automatically cleaned up here
})
```

### With Timeout and Graceful Shutdown

```typescript
const withTimeout = Effect.gen(function* () {
  const logger = yield* createProcessLogger("my-process", [])

  // Race between completion and timeout
  const result = yield* Effect.race(
    logger.waitForCompletion,
    Effect.sleep("1 hour").pipe(
      Effect.flatMap(() => 
        Effect.gen(function* () {
          console.log("Timeout! Stopping process...")
          yield* logger.stop
          return "timeout"
        })
      )
    )
  )

  return result
})
```

## 🎓 Learning Path

### 1. Start with Minimal Examples
Read **[minimal-scoped-example.ts](computer:///mnt/user-data/outputs/minimal-scoped-example.ts)** first:
- Simple background task pattern
- State monitoring pattern
- Multiple workers pattern
- Nested scopes

Run examples:
```bash
tsx minimal-scoped-example.ts simple
tsx minimal-scoped-example.ts monitor
tsx minimal-scoped-example.ts nested
```

### 2. Understand Why Scoped
Read **[STRUCTURED_CONCURRENCY.md](computer:///mnt/user-data/outputs/STRUCTURED_CONCURRENCY.md)**:
- Problems with `forkDaemon`
- Benefits of `forkScoped`
- How scopes work
- Real-world patterns

### 3. See the Implementation
Review **[process-logger.ts](computer:///mnt/user-data/outputs/process-logger.ts)**:
- Activity tracker implementation
- Log writer with rotation
- Process spawning with Deferred
- Stream processing
- Scope management

### 4. Run the Tests
Execute **[test-simple.ts](computer:///mnt/user-data/outputs/test-simple.ts)**:
```bash
npm test          # Rolling log rotation test
npm test idle     # Idle detection test
```

### 5. Study Real Usage
Check **[example-usage.ts](computer:///mnt/user-data/outputs/example-usage.ts)**:
- Monitoring claude-code sessions
- Multiple concurrent processes
- Activity callbacks

### 6. Learn EffectTS Patterns
Browse **[patterns-reference.ts](computer:///mnt/user-data/outputs/patterns-reference.ts)**:
- Schema parsing
- Tagged errors
- Effect.gen
- Ref, Deferred, Queue, Stream
- Concurrency patterns

## 🔧 Configuration

```typescript
interface LoggerConfig {
  maxFileSize: number      // bytes (default: 100MB)
  outputDir: string        // directory (default: "./logs")
  baseFileName: string     // base name (default: "process-output")
  idleTimeoutMs: number    // idle threshold (default: 5000ms)
}
```

## 📊 Activity Tracking

The logger tracks process state:
- **Active**: Output produced in last `idleTimeoutMs` milliseconds
- **Idle**: No output for `idleTimeoutMs` milliseconds

Use cases:
- UI status indicators
- Automated alerts for hung processes
- Resource scaling decisions
- Conditional logging

## 🔄 Log Rotation

Automatic rotation at `maxFileSize`:
```
process-output.log      # Current active file
process-output.1.log    # First rotation
process-output.2.log    # Second rotation
...
```

No data loss, transparent to your code.

## 🎯 EffectTS Patterns Used

| Pattern | Purpose | Example |
|---------|---------|---------|
| `Schema` | Parse, don't validate | `Schema.decodeUnknown(ProcessOutputSchema)` |
| `TaggedError` | Structured errors | `catchTag("FileWriteError", ...)` |
| `Effect.gen` | Sequential async | `yield*` for blocking operations |
| `Ref` | Mutable state | `Ref.make`, `Ref.update`, `Ref.get` |
| `Deferred` | Event bridging | `proc.on('close')` → Effect |
| `Queue` | Producer-consumer | stdout/stderr buffering |
| `Stream` | Data pipelines | Process output with backpressure |
| `Effect.forkScoped` | Background fibers | Structured concurrency |
| `Effect.scoped` | Scope creation | Resource lifecycle management |

## 🚦 Error Handling

All errors are tagged and can be handled specifically:

```typescript
pipe(
  createProcessLogger("my-command", []),
  Effect.catchTag("FileWriteError", (error) =>
    Effect.gen(function* () {
      yield* Effect.logError(`Cannot write to ${error.path}`)
      // Recovery logic
    })
  ),
  Effect.catchTag("ProcessSpawnError", (error) =>
    Effect.gen(function* () {
      yield* Effect.logError(`Cannot spawn ${error.command}`)
      // Fallback logic
    })
  ),
  Effect.runPromise
)
```

## 🔍 Common Patterns

### Pattern 1: Long-Running Service
```typescript
const service = Effect.gen(function* () {
  const logger = yield* createProcessLogger("server", ["--watch"])
  
  const healthCheck = pipe(
    checkHealth,
    Effect.repeat(Schedule.spaced("30 seconds")),
    Effect.forkScoped
  )
  
  yield* healthCheck
  yield* Effect.never // Run forever
})
```

### Pattern 2: Batch Processing
```typescript
const batch = Effect.gen(function* () {
  const loggers = yield* Effect.all(
    tasks.map(task => 
      createProcessLogger(task.command, task.args)
    ),
    { concurrency: 4 } // Max 4 concurrent
  )
  
  yield* Effect.all(
    loggers.map(l => l.waitForCompletion),
    { concurrency: "unbounded" }
  )
})
```

### Pattern 3: Conditional Monitoring
```typescript
const conditional = Effect.gen(function* () {
  const logger = yield* createProcessLogger("build", [])
  
  const alertOnIdle = pipe(
    Effect.gen(function* () {
      while (true) {
        const state = yield* logger.getActivityState
        if (state === "idle") {
          yield* sendAlert("Build is idle!")
        }
        yield* Effect.sleep("5 seconds")
      }
    }),
    Effect.forkScoped
  )
  
  yield* alertOnIdle
  yield* logger.waitForCompletion
})
```

## 📖 Additional Reading

- [Effect Documentation](https://effect.website/)
- [Structured Concurrency](https://vorpus.org/blog/notes-on-structured-concurrency-or-go-statement-considered-harmful/)
- [Effect Schema](https://effect.website/docs/schema/introduction)
- [Effect Concurrency](https://effect.website/docs/concurrency/)

## 💡 Key Takeaways

1. **Always prefer `Effect.forkScoped`** over `Effect.forkDaemon`
2. **Wrap Effects in `.pipe(Effect.scoped)`** to create managing scopes
3. **Use Schema for parsing**, not validation
4. **Tagged errors enable precise error handling**
5. **Ref provides safe concurrent state** without locks
6. **Deferred bridges callbacks** to Effect world
7. **Structured concurrency ensures cleanup** automatically

## 🤝 Contributing

This is a reference implementation. Feel free to:
- Adapt for your specific needs
- Extract patterns for your projects
- Extend with additional features
- Use as a learning resource

## 📝 License

MIT - Use freely in your projects

---

**Remember:** This process logger is designed to be embedded in larger Effect programs. All background fibers are properly scoped and will be automatically cleaned up when the parent scope closes. No leaked resources, no orphaned processes - just clean, structured concurrency.
