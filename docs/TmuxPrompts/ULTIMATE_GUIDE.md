# Process Logger Collection - Ultimate Guide

## 🎯 What You Have

A complete suite of **production-ready process loggers** built with EffectTS, featuring:

- ✅ **Streaming I/O capture** with backpressure handling
- ✅ **Rolling 100MB log files** with automatic rotation
- ✅ **Activity tracking** (idle/active detection)
- ✅ **Structured concurrency** with `Effect.forkScoped`
- ✅ **Interactive modes** (3 different approaches!)
- ✅ **Type-safe** with Schema validation
- ✅ **Tagged errors** for precise error handling

## 📚 Complete File Index

### Core Implementations

| File | Purpose | Best For |
|------|---------|----------|
| **[process-logger.ts](computer:///mnt/user-data/outputs/process-logger.ts)** | Base logger - background processes | Non-interactive tasks |
| **[interactive-logger.ts](computer:///mnt/user-data/outputs/interactive-logger.ts)** | Basic interactive mode | Simple CLI tools |
| **[pty-logger.ts](computer:///mnt/user-data/outputs/pty-logger.ts)** | Full PTY with colors | Rich TUIs (needs node-pty) |
| **[tmux-logger.ts](computer:///mnt/user-data/outputs/tmux-logger.ts)** | ⭐ Tmux-based detachable | **Claude Code** (BEST!) |

### Examples & Tests

| File | Purpose |
|------|---------|
| **[example-usage.ts](computer:///mnt/user-data/outputs/example-usage.ts)** | Base logger examples |
| **[test-simple.ts](computer:///mnt/user-data/outputs/test-simple.ts)** | Working tests |
| **[tmux-examples.ts](computer:///mnt/user-data/outputs/tmux-examples.ts)** | Tmux logger examples |
| **[minimal-scoped-example.ts](computer:///mnt/user-data/outputs/minimal-scoped-example.ts)** | Learning EffectTS patterns |
| **[patterns-reference.ts](computer:///mnt/user-data/outputs/patterns-reference.ts)** | EffectTS pattern catalog |

### Documentation

| File | Purpose |
|------|---------|
| **[COMPLETE_GUIDE.md](computer:///mnt/user-data/outputs/COMPLETE_GUIDE.md)** | ⭐ START HERE - Overview |
| **[INTERACTIVE_COMPARISON.md](computer:///mnt/user-data/outputs/INTERACTIVE_COMPARISON.md)** | Compare 3 interactive modes |
| **[TMUX_LOGGER_GUIDE.md](computer:///mnt/user-data/outputs/TMUX_LOGGER_GUIDE.md)** | Complete tmux guide |
| **[STRUCTURED_CONCURRENCY.md](computer:///mnt/user-data/outputs/STRUCTURED_CONCURRENCY.md)** | Why forkScoped not forkDaemon |
| **[MIGRATION_GUIDE.md](computer:///mnt/user-data/outputs/MIGRATION_GUIDE.md)** | Changes from daemon to scoped |
| **[PROCESS_LOGGER_README.md](computer:///mnt/user-data/outputs/PROCESS_LOGGER_README.md)** | Base logger usage |

## 🚀 Quick Start

### For Claude Code (RECOMMENDED)

Use the **tmux logger** for detachable sessions:

```typescript
import { createTmuxProcessLogger } from "./tmux-logger"
import * as Effect from "effect/Effect"

const program = Effect.gen(function* () {
  const logger = yield* createTmuxProcessLogger(
    "claude-code",
    ["--project", "./my-project"],
    {
      sessionName: "claude-work",
      outputDir: "./logs",
      maxFileSize: 100 * 1024 * 1024,
    }
  )

  console.log(`Attach with: ${logger.sessionInfo.attachCommand}`)
  console.log("Detach with: Ctrl+B, D")
  console.log("Monitoring...\n")

  // Monitor in background
  const monitor = pipe(
    Effect.gen(function* () {
      while (true) {
        const state = yield* logger.getActivityState
        console.log(`Status: ${state}`)
        yield* Effect.sleep("5 seconds")
      }
    }),
    Effect.forkScoped
  )

  yield* monitor
  yield* logger.waitForCompletion
})

Effect.runPromise(program)
```

**User workflow:**
1. Script runs, creates tmux session
2. User attaches: `tmux attach -t claude-work`
3. User interacts with claude-code
4. User detaches: `Ctrl+B, D`
5. Session keeps running, still being logged!
6. User can re-attach anytime
7. Eventually exits claude-code
8. Logger finalizes and reports stats

### For Background Tasks

Use the **base logger**:

```typescript
import { createProcessLogger } from "./process-logger"

const program = Effect.gen(function* () {
  const logger = yield* createProcessLogger("npm", ["run", "build"], {
    outputDir: "./logs",
    maxFileSize: 100 * 1024 * 1024,
  })

  yield* logger.waitForCompletion
})
```

## 🎯 Which Logger Should You Use?

### Decision Tree

```
Is it interactive?
├─ NO → Use base logger (process-logger.ts)
│
└─ YES → Do you need to detach/reattach?
    ├─ YES → Use tmux logger (tmux-logger.ts) ⭐
    │
    └─ NO → Do you need colors/formatting?
        ├─ YES → Use PTY logger (pty-logger.ts)
        └─ NO → Use interactive logger (interactive-logger.ts)
```

### Specific Use Cases

| Use Case | Logger | Why |
|----------|--------|-----|
| **claude-code** | **Tmux** | Long sessions, detach/reattach |
| npm build/test | Base | Background, no interaction |
| npm run dev | PTY or Tmux | Interactive, colors |
| bash scripts | Interactive | Basic I/O, simple |
| docker build | Base | Background, lots of output |
| Python REPL | Tmux | Interactive, long session |

## 🔑 Key EffectTS Patterns

All loggers use these patterns:

### 1. Schema for Parsing (Not Validation)

```typescript
const ProcessOutputSchema = Schema.Struct({
  source: Schema.Literal("stdout", "stderr"),
  data: Schema.String,
  timestamp: Schema.Number,
})

// Parse with type inference
yield* Schema.decodeUnknown(ProcessOutputSchema)(data)
```

### 2. Tagged Errors

```typescript
class FileWriteError extends Schema.TaggedError<FileWriteError>()(
  "FileWriteError",
  { path: Schema.String, cause: Schema.Unknown }
) {}

// Handle specifically
pipe(
  logger,
  Effect.catchTag("FileWriteError", (e) => handleFileError(e))
)
```

### 3. Structured Concurrency with forkScoped

```typescript
// ❌ WRONG: forkDaemon (global, leaks)
const fiber = yield* task.pipe(Effect.forkDaemon)

// ✅ RIGHT: forkScoped (tied to scope)
Effect.gen(function* () {
  const fiber = yield* task.pipe(Effect.forkScoped)
  // fiber cleaned up when scope closes
}).pipe(Effect.scoped)
```

### 4. Ref for Safe State

```typescript
const counter = yield* Ref.make(0)
yield* Ref.update(counter, n => n + 1)  // Thread-safe!
const value = yield* Ref.get(counter)
```

### 5. Deferred for Callbacks

```typescript
const done = yield* Deferred.make<void>()

proc.on('exit', () => {
  pipe(Deferred.succeed(done, void 0), Effect.runFork)
})

yield* Deferred.await(done)  // Wait for exit
```

### 6. Queue + Stream for Backpressure

```typescript
const queue = yield* Queue.unbounded<Output>()

// Producer
proc.stdout.on('data', data => {
  pipe(
    Queue.offer(queue, data),
    Effect.runFork
  )
})

// Consumer with backpressure
pipe(
  Stream.fromQueue(queue),
  Stream.map(process),
  Stream.runDrain
)
```

## 📊 Features Comparison

| Feature | Base | Interactive | PTY | Tmux |
|---------|------|-------------|-----|------|
| Rolling logs | ✅ | ✅ | ✅ | ✅ |
| Activity tracking | ✅ | ✅ | ✅ | ✅ |
| Scoped fibers | ✅ | ✅ | ✅ | ✅ |
| User input | ❌ | ✅ | ✅ | ✅ |
| Colors | ❌ | ❌ | ✅ | ✅ |
| Detach/reattach | ❌ | ❌ | ❌ | ✅ |
| Session persistence | ❌ | ❌ | ❌ | ✅ |
| External deps | None | None | node-pty | tmux |

## 🎓 Learning Path

### 1. Start with Minimal Examples

Read **[minimal-scoped-example.ts](computer:///mnt/user-data/outputs/minimal-scoped-example.ts)**:
```bash
tsx minimal-scoped-example.ts simple
tsx minimal-scoped-example.ts monitor
```

### 2. Understand Structured Concurrency

Read **[STRUCTURED_CONCURRENCY.md](computer:///mnt/user-data/outputs/STRUCTURED_CONCURRENCY.md)**

Key takeaway: Use `forkScoped`, not `forkDaemon`!

### 3. Run the Tests

```bash
npm test          # Rolling logs test
npm test idle     # Idle detection test
```

### 4. Try Interactive Modes

Read **[INTERACTIVE_COMPARISON.md](computer:///mnt/user-data/outputs/INTERACTIVE_COMPARISON.md)**

Then try:
```bash
# Tmux logger
tsx tmux-examples.ts basic

# Interactive logger
tsx example-usage.ts
```

### 5. Study the Patterns

Browse **[patterns-reference.ts](computer:///mnt/user-data/outputs/patterns-reference.ts)** to learn:
- Schema parsing
- Tagged errors
- Effect.gen
- Ref, Deferred, Queue, Stream
- Concurrency patterns

## 🛠️ Installation

```bash
npm install effect

# For PTY logger (optional)
npm install node-pty

# For tmux logger
# Ubuntu/Debian
sudo apt install tmux
# macOS
brew install tmux
```

## 📦 Package Structure

```
.
├── Core Loggers
│   ├── process-logger.ts          # Base logger
│   ├── interactive-logger.ts      # Basic interactive
│   ├── pty-logger.ts              # PTY-based
│   └── tmux-logger.ts             # Tmux-based ⭐
│
├── Examples & Tests
│   ├── example-usage.ts           # Base examples
│   ├── test-simple.ts             # Tests
│   ├── tmux-examples.ts           # Tmux examples
│   ├── minimal-scoped-example.ts  # Learning
│   └── patterns-reference.ts      # Pattern catalog
│
├── Documentation
│   ├── COMPLETE_GUIDE.md          # START HERE
│   ├── INTERACTIVE_COMPARISON.md  # Interactive modes
│   ├── TMUX_LOGGER_GUIDE.md       # Tmux deep dive
│   ├── STRUCTURED_CONCURRENCY.md  # Why scoped
│   └── MIGRATION_GUIDE.md         # Daemon→Scoped
│
└── Config
    └── package.json
```

## 🎯 Common Patterns

### Pattern 1: Monitor Activity

```typescript
const monitor = pipe(
  Effect.gen(function* () {
    while (true) {
      const state = yield* logger.getActivityState
      if (state === "idle") {
        console.log("⚠️ Process idle!")
      }
      yield* Effect.sleep("2 seconds")
    }
  }),
  Effect.forkScoped
)
```

### Pattern 2: With Timeout

```typescript
yield* Effect.race(
  logger.waitForCompletion,
  Effect.sleep("1 hour").pipe(
    Effect.flatMap(() => logger.stop)
  )
)
```

### Pattern 3: Alert on Rotation

```typescript
let lastRotation = 0
while (true) {
  const logState = yield* logger.getLogState
  if (logState.rotationCount > lastRotation) {
    console.log(`🔄 Log rotated! (${logState.rotationCount})`)
    lastRotation = logState.rotationCount
  }
  yield* Effect.sleep("5 seconds")
}
```

### Pattern 4: Multiple Processes

```typescript
const loggers = yield* Effect.all(
  tasks.map(task => createProcessLogger(task.cmd, task.args)),
  { concurrency: 4 }
)

yield* Effect.all(
  loggers.map(l => l.waitForCompletion),
  { concurrency: "unbounded" }
)
```

## 🚨 Error Handling

All errors are tagged and composable:

```typescript
pipe(
  createProcessLogger("command", []),
  Effect.catchTag("FileWriteError", handleFileError),
  Effect.catchTag("ProcessSpawnError", handleSpawnError),
  Effect.catchTag("TmuxError", handleTmuxError),
  Effect.catchAllDefect(handleUnexpected)
)
```

## 🎉 Summary

You have a **complete, production-ready process logging system** with:

- ✅ **4 different loggers** for different use cases
- ✅ **Structured concurrency** (proper cleanup!)
- ✅ **Rolling logs** (100MB default)
- ✅ **Activity tracking** (idle/active)
- ✅ **Interactive modes** (3 approaches)
- ✅ **Type safety** (Schema + TypeScript)
- ✅ **Composable errors** (tagged)
- ✅ **EffectTS best practices** throughout

## 🎯 Recommendations

For **claude-code** specifically:

1. **Use tmux-logger.ts** - Best match for interactive development
2. **Read TMUX_LOGGER_GUIDE.md** - Complete guide
3. **Try tmux-examples.ts** - See it in action

The tmux approach gives users full control while maintaining comprehensive logging and monitoring!
