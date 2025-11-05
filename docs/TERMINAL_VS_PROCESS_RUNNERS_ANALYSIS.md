# Terminal vs Process Runners: Architectural Analysis

## Current State (After Cleanup)

### Two Separate Domains

```
src/main/
├── terminal/
│   ├── terminal-port.ts        (TerminalPort - PTY interface)
│   ├── terminal-service.ts     (TerminalService)
│   ├── terminal-registry.ts    (TerminalRegistry)
│   └── node-pty/adapter.ts     (NodePtyTerminalAdapter)
│
└── ai-runners/                (renamed concept: process-runners)
    ├── adapters/
    │   ├── process-monitor/    (ProcessMonitorAdapter)
    │   └── tmux-session-manager/
    ├── services/
    │   └── ai-runner-service.ts (ProcessRunnerService concept)
    ├── ports.ts                (ProcessMonitorPort, SessionManagerPort)
    ├── schemas.ts
    └── errors.ts
```

## Problem Analysis

### What is "Terminal"?

**Current Port Definition (terminal-port.ts):**
```typescript
interface TerminalPort {
  spawn(config: ProcessConfig): Effect.Effect<ProcessState, TerminalError>
  kill(processId: string): Effect.Effect<void, TerminalError>
  write(processId: string, data: string): Effect.Effect<void, TerminalError>
  resize(processId: string, rows: number, cols: number): Effect.Effect<void, TerminalError>
  subscribe(processId: string, callback): Effect.Effect<() => void, TerminalError>
}
```

**Actual Purpose:**
- Interactive PTY-based terminal sessions
- Focus: **Real-time user interaction** (resize, write, read)
- Uses: node-pty (native binding for full PTY support)
- Lifecycle: Tied to UI window

**Better Name:** `terminal` is actually good (it's a UI terminal emulator driver)

### What is "AI-Runners" → "Process-Runners"?

**Current Port Definitions (ports.ts):**
```typescript
interface ProcessMonitorPort {
  spawn(config): Effect.Effect<ProcessHandle, ProcessSpawnError>
  attach(pid: number): Effect.Effect<ProcessHandle, ProcessAttachError>
  monitor(handle): Stream.Stream<ProcessEvent, ProcessMonitorError>
  kill(handle): Effect.Effect<void, ProcessKillError>
  pipeTmuxSession(handle, targetPane): Effect.Effect<void, ProcessMonitorError>
}

interface SessionManagerPort {
  createSession(name, cmd): Effect.Effect<ProcessHandle, ..., Scope>
  attachToSession(name): Effect.Effect<ProcessHandle, ...>
  listSessions(): Effect.Effect<TmuxSession[], never>
  killSession(name): Effect.Effect<void, ...>
}
```

**Actual Purpose:**
- Background process execution with persistent sessions
- Focus: **Long-running detachable tasks** (logging, monitoring)
- Uses: Tmux (session multiplexer via CLI)
- Lifecycle: Independent from UI, can detach/reattach

**Better Name:** `process-runners` is better (emphasizes running, not watching)

---

## Should We Combine?

### Argument FOR Combining (Under "process-execution" or "process-management")

**Similarities:**
- Both manage process lifecycle (spawn, kill)
- Both monitor stdout/stderr
- Both use different backends (PTY vs Tmux)

**Architecture:**
```
process-execution/
├── adapters/
│   ├── terminal-pty/           (NodePtyTerminalAdapter)
│   └── session-tmux/           (ProcessMonitor + SessionManager)
├── ports.ts                    (ProcessExecutionPort)
├── services/
│   ├── terminal-service.ts
│   └── process-runner-service.ts
└── index.ts
```

**Pros:**
- ✅ Single domain for all process management
- ✅ Unified error types and contracts
- ✅ Single registry/composition

**Cons:**
- ❌ **Conflates two different purposes:**
  - Terminal = interactive **UI component**
  - Process-Runners = background **task executor**
- ❌ Different lifecycle models (UI-tied vs detached)
- ❌ Different port contracts (hard to unify)
- ❌ Terminal needs resize/write (PTY), runners need logging/monitoring (Tmux)
- ❌ Terminal is consumer-facing (user interacts), runners are infrastructure

---

### Argument AGAINST Combining (Keep Separate)

**Fundamental Differences:**

| Aspect | Terminal | Process-Runners |
|--------|----------|-----------------|
| **Purpose** | Interactive TTY UI | Background task execution |
| **Lifecycle** | Tied to window/user | Independent, persistent |
| **Interaction** | Real-time (resize, input) | Event-driven (logging, events) |
| **Backend** | PTY (node-pty) | Session mgr (Tmux) |
| **Use Case** | Terminal emulator in renderer | AI ops, builds, tests, CI/CD |
| **Scaling** | ~1-10 terminals per session | ~Many tasks per session |

**Architecture is Better Separate:**
```
terminal/                          process-runners/
├── InteractivePort                ├── ProcessMonitorPort
├── NodePtyAdapter                 ├── SessionManagerPort
├── TerminalService                ├── ProcessMonitorAdapter
└── terminal-registry              ├── TmuxSessionManagerAdapter
                                   └── ProcessRunnerService
```

**Follows Hexagonal Pattern:**
- Each domain has **single responsibility**
- Each domain has **focused ports**
- Each domain can **evolve independently**
- Each domain can have **multiple implementations**

---

## The Real Issue

The naming problem isn't about combining—it's about **clarifying intent**:

### Current State (Confusing)

```
"terminal" domain     → Actually: PTY-based interactive sessions
"ai-runners" domain  → Actually: Background process runners

Confusion:
- Terminal sounds like it watches terminals
- AI-Runners sounds like it only watches AI operations
```

### After Renaming (Clear)

```
"terminal" domain      → Still: PTY-based interactive sessions (✅ good name)
"process-runners" dom  → Actually: Background process runners (✅ clear name)

Benefits:
- Each name matches purpose
- Future AI, CI/CD, tests all fit in process-runners
- Terminal remains focused on interactive UI
```

---

## Recommendation: KEEP SEPARATE, RENAME

**DO NOT combine.** Keep them separate because:

1. **Different Purposes**
   - Terminal = interactive UI driver
   - Process-Runners = background task executor

2. **Different Ports/Contracts**
   - Terminal has resize, write operations
   - Process-Runners have monitoring, logging operations

3. **Different Lifecycles**
   - Terminal tied to window/user presence
   - Process-Runners independent and persistent

4. **Better for Hexagonal Architecture**
   - Each domain = single responsibility
   - Clear port contracts
   - Independent evolution
   - Proper abstraction layers

5. **Follows Existing Patterns**
   - Similar to how `github/` (provider) is separate from `source-control/` (execution)
   - Similar to how `ai/` (provider) is separate from `process-runners/` (execution)

---

## The Correct Organization

```
src/main/
├── terminal/                      (Interactive PTY-based shell)
│   ├── terminal-port.ts
│   ├── terminal-service.ts
│   ├── terminal-registry.ts
│   └── node-pty/adapter.ts
│
├── process-runners/               (Background process execution + monitoring)
│   ├── adapters/
│   │   ├── process-monitor/
│   │   └── tmux-session-manager/
│   ├── services/
│   │   └── process-runner-service.ts
│   ├── ports.ts
│   ├── schemas.ts
│   ├── errors.ts
│   └── index.ts
│
├── github/                        (VCS provider)
├── ai/                            (AI provider)
└── ... other domains
```

**This is proper hexagonal architecture:**
- Each domain = clear responsibility
- Each domain = focused ports
- Each domain = independent evolution
- Domains DON'T share code (only via IPC)

---

## Next Step: Just Rename

Instead of combining, simply rename `ai-runners` → `process-runners`:

**Files to rename:**
- `ai-runners/` → `process-runners/`
- `AiRunner*` → `ProcessRunner*`
- `ai-runner-*` → `process-runner-*`

**Impact:**
- IPC contracts update
- Renderer components update
- Import paths update
- Same architecture, better naming

**Effort:** 1-2 hours with find/replace

---

## Conclusion

**Keep Terminal and Process-Runners SEPARATE.**

They are fundamentally different concerns:
- **Terminal** = interactive UI component (with PTY backend)
- **Process-Runners** = background task executor (with Tmux backend)

Renaming Process-Runners (from ai-runners) will clarify intent without architectural change.

This maintains clean hexagonal architecture with clear domain boundaries.
