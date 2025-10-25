# Tmux Process Logger - Interactive Monitoring

## Overview

The tmux logger spawns processes in **detached tmux sessions** that users can attach to and interact with, while simultaneously monitoring and logging all I/O in the background.

## 🎯 Key Features

1. **Detached Sessions** - Process runs in tmux, survives monitoring script
2. **User Can Attach** - `tmux attach -t session-name` for interactive use
3. **Continuous Monitoring** - Logger monitors the session even when user isn't attached
4. **Full Logging** - All I/O captured to rolling log files
5. **Structured Concurrency** - All monitoring fibers properly scoped

## 🔧 How It Works

### Architecture

```
┌─────────────────────────────────────────┐
│  Your Effect Program                     │
│  ┌────────────────────────────────────┐ │
│  │  Tmux Logger (Scoped)              │ │
│  │  ├─ Activity Tracker Fiber         │ │
│  │  ├─ Stream Processor Fiber         │ │
│  │  └─ Session Status Checker Fiber   │ │
│  └────────────────────────────────────┘ │
└─────────────────────────────────────────┘
            │
            ▼
    ┌─────────────────┐
    │  Tmux Session   │ ◄─── User can attach here
    │  (claude-code)  │
    └─────────────────┘
            │
            ▼
    ┌─────────────────┐
    │  pipe-pane      │ ──► Capture to temp file
    └─────────────────┘
            │
            ▼
    ┌─────────────────┐
    │  tail -f        │ ──► Stream to logger
    └─────────────────┘
            │
            ▼
    ┌─────────────────┐
    │  Rolling Logs   │
    └─────────────────┘
```

### Workflow

1. **Create Session**: `tmux new-session -d -s <name> 'command args'`
2. **Start Capture**: `tmux pipe-pane -t <session> 'cat >> file'`
3. **Tail Output**: `tail -f file` streams to our logger
4. **User Attaches**: `tmux attach -t <name>` (optional)
5. **Monitor Status**: Poll with `tmux list-sessions` to detect exit
6. **Cleanup**: Stop pipe-pane, kill tail, remove temp file

## 📖 Usage

### Basic Example

```typescript
import { createTmuxProcessLogger } from "./tmux-logger"
import * as Effect from "effect/Effect"

const program = Effect.gen(function* () {
  // Create session and start monitoring
  const logger = yield* createTmuxProcessLogger(
    "claude-code",
    ["--project", "./my-project"],
    {
      sessionName: "claude-work",
      outputDir: "./logs",
      baseFileName: "claude-session",
      maxFileSize: 100 * 1024 * 1024, // 100MB
    }
  )

  console.log(`Attach with: ${logger.sessionInfo.attachCommand}`)
  console.log(`Detach with: Ctrl+B, then D`)

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

### Auto-Attach After Creation

```typescript
const autoAttach = Effect.gen(function* () {
  const logger = yield* createTmuxProcessLogger("claude-code", [])

  console.log("Attaching in 2 seconds...")
  yield* Effect.sleep("2 seconds")

  // This blocks until user presses Ctrl+B, D
  yield* logger.attachToSession

  console.log("You detached! Monitoring continues...")
  yield* logger.waitForCompletion
})
```

### Monitor Existing Session

```typescript
import { monitorExistingTmuxSession } from "./tmux-logger"

const monitor = Effect.gen(function* () {
  // Attach to already-running session
  const logger = yield* monitorExistingTmuxSession("my-existing-session", {
    outputDir: "./logs",
    baseFileName: "existing",
  })

  yield* logger.waitForCompletion
})
```

### Multiple Sessions

```typescript
const multiple = Effect.gen(function* () {
  const sessions = yield* Effect.all(
    [
      createTmuxProcessLogger("claude-code", ["--project", "./frontend"], {
        sessionName: "frontend",
      }),
      createTmuxProcessLogger("claude-code", ["--project", "./backend"], {
        sessionName: "backend",
      }),
    ],
    { concurrency: 2 }
  )

  // All sessions run independently
  // User can attach to any: tmux attach -t frontend

  yield* Effect.all(
    sessions.map((s) => s.waitForCompletion),
    { concurrency: "unbounded" }
  )
})
```

## 🎮 User Interaction

### Attach to Session

```bash
# While your Effect program is running
tmux attach -t claude-work

# Now you're in the session and can interact
# Type commands, see output, etc.
```

### Detach from Session

Press `Ctrl+B`, then press `D`

The session keeps running! Your monitoring continues.

### List Sessions

```bash
tmux list-sessions
```

### Kill Session Manually

```bash
tmux kill-session -t claude-work
```

Or programmatically:
```typescript
yield* logger.killSession
```

## 📊 What Gets Logged

Everything that appears in the tmux session:
- ✅ stdout from the process
- ✅ stderr from the process
- ✅ User input (when attached)
- ✅ Terminal control sequences (colors, etc.)
- ✅ All timing information

Log format:
```
[2025-10-24T12:34:56.789Z] Line of output here
[2025-10-24T12:34:57.123Z] Another line
```

## 🔄 Rolling Logs

Just like the base logger:
- Files rotate at `maxFileSize` (default 100MB)
- Old files renamed with rotation number
- No data loss during rotation

```
claude-session.log      # Current
claude-session.1.log    # First rotation
claude-session.2.log    # Second rotation
```

## 📡 Activity Tracking

The logger tracks whether the session is producing output:

```typescript
const state = yield* logger.getActivityState
// "active" or "idle"
```

- **Active**: Output produced in last `idleTimeoutMs` ms
- **Idle**: No output for `idleTimeoutMs` ms

Perfect for detecting hung processes!

## 🎯 Common Patterns

### Pattern 1: Start and Forget

```typescript
const startAndForget = Effect.gen(function* () {
  const logger = yield* createTmuxProcessLogger("long-task", [])
  
  console.log("Session running!")
  console.log("Attach: tmux attach -t long-task")
  console.log("Logs: ./logs/")
  
  // Don't wait - just return
  // Session and monitoring continue independently
})
```

### Pattern 2: Supervise with Restart

```typescript
const supervised = pipe(
  Effect.gen(function* () {
    const logger = yield* createTmuxProcessLogger("claude-code", [])
    yield* logger.waitForCompletion
    
    const exitCode = yield* logger.waitForCompletion
    if (exitCode !== 0) {
      yield* Effect.fail("Process failed")
    }
  }),
  Effect.retry({ times: 3 }),
  Effect.catchAll(() => Effect.log("Max retries reached"))
)
```

### Pattern 3: Conditional Attachment

```typescript
const conditional = Effect.gen(function* () {
  const logger = yield* createTmuxProcessLogger("claude-code", [])
  
  // Check if terminal is interactive
  if (process.stdout.isTTY) {
    console.log("Attaching...")
    yield* logger.attachToSession
  } else {
    console.log("Running headless")
    yield* logger.waitForCompletion
  }
})
```

### Pattern 4: Timeout with Graceful Shutdown

```typescript
const withTimeout = Effect.gen(function* () {
  const logger = yield* createTmuxProcessLogger("claude-code", [])
  
  yield* Effect.race(
    logger.waitForCompletion,
    Effect.sleep("1 hour").pipe(
      Effect.flatMap(() => logger.killSession)
    )
  )
})
```

## 🚨 Error Handling

All errors are tagged:

```typescript
pipe(
  createTmuxProcessLogger("command", []),
  Effect.catchTag("TmuxError", (error) =>
    Effect.gen(function* () {
      yield* Effect.log(`Tmux problem: ${error.message}`)
      // Handle: maybe tmux isn't installed?
    })
  ),
  Effect.catchTag("FileWriteError", (error) =>
    Effect.gen(function* () {
      yield* Effect.log(`Can't write to ${error.path}`)
      // Handle: check permissions?
    })
  )
)
```

## ⚙️ Configuration

```typescript
interface TmuxLoggerConfig {
  maxFileSize: number      // Rotation threshold (default: 100MB)
  outputDir: string        // Log directory (default: "./logs")
  baseFileName: string     // Log file base name
  idleTimeoutMs: number    // Idle detection (default: 5000ms)
  sessionName: string      // Tmux session name
  autoAttach: boolean      // Auto-attach after creation (default: true)
}
```

## 🔍 Monitoring Best Practices

### 1. Unique Session Names

```typescript
const sessionName = `claude-${Date.now()}`
// or
const sessionName = `claude-${process.env.USER}-${projectName}`
```

### 2. Clean Up Old Sessions

```bash
# List all sessions
tmux list-sessions

# Kill old sessions
tmux kill-session -t old-session-name
```

### 3. Resource Limits

```typescript
const config = {
  maxFileSize: 50 * 1024 * 1024,  // 50MB per file
  idleTimeoutMs: 30000,            // 30s idle = probably stuck
}
```

### 4. Graceful Shutdown

```typescript
Effect.gen(function* () {
  const logger = yield* createTmuxProcessLogger("cmd", [])
  
  // Ensure cleanup
  yield* Effect.ensuring(
    logger.waitForCompletion,
    logger.killSession  // Always cleanup
  )
})
```

## 🎓 Advanced: Why Tmux?

### Advantages

1. **Session Persistence** - Survives SSH disconnects, monitoring restarts
2. **User Control** - User can attach/detach at will
3. **Terminal Features** - Colors, cursor movement, everything works
4. **Multiplexing** - Can split panes, windows, etc.
5. **Native Tooling** - `tmux` is mature, battle-tested

### Alternatives Considered

| Approach | Pros | Cons |
|----------|------|------|
| **spawn with inherit** | Simple | No detach, no persistence |
| **node-pty** | Full PTY, colors | Complex, native deps |
| **tmux** | ✅ Best of both | Requires tmux installed |
| **screen** | Similar to tmux | Less features |

## 🐛 Troubleshooting

### "tmux not installed"

```bash
# Ubuntu/Debian
sudo apt install tmux

# macOS
brew install tmux
```

### "Session already exists"

Either attach to it or kill it:
```bash
tmux attach -t session-name
# or
tmux kill-session -t session-name
```

### "pipe-pane not capturing"

Check tmux version:
```bash
tmux -V  # Should be 2.0+
```

### "Monitoring stops but session continues"

This is by design! The tmux session is independent. You can:
- Re-run monitor: `monitorExistingTmuxSession("session-name")`
- Or just attach: `tmux attach -t session-name`

## 📚 Further Reading

- [Tmux Manual](https://man7.org/linux/man-pages/man1/tmux.1.html)
- [Effect Concurrency](https://effect.website/docs/concurrency/)
- [Structured Concurrency](STRUCTURED_CONCURRENCY.md)

## 🎉 Summary

The tmux logger gives you the best of both worlds:

- ✅ **Interactive** - User can attach and use claude-code normally
- ✅ **Persistent** - Session survives monitoring restarts
- ✅ **Monitored** - All I/O logged with rolling files
- ✅ **Structured** - Proper scoped concurrency with EffectTS

Perfect for long-running interactive tools like `claude-code`!
