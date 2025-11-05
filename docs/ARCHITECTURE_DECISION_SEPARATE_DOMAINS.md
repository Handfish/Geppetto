# Architecture Decision: Keep Terminal and Process-Runners Separate

## TL;DR

**Decision: KEEP SEPARATE, RENAME ai-runners → process-runners**

Two fundamentally different concerns should NOT be merged:
- **Terminal** = interactive TTY driver (for UI)
- **Process-Runners** = background task executor (for infrastructure)

---

## Visual Comparison

### Current (Post-Refactoring)

```
┌─────────────────────────────────────────────────────────────────┐
│ MAIN PROCESS                                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  terminal/                    ai-runners/ (→ process-runners/) │
│  ├── terminal-port.ts        ├── ports.ts (Process/Session)   │
│  ├── terminal-service.ts     ├── adapters/                    │
│  ├── terminal-registry.ts    │   ├── process-monitor/         │
│  └── node-pty/adapter.ts     │   └── tmux-session-manager/    │
│                              ├── services/                    │
│  PURPOSE:                    │   └── process-runner-service.ts│
│  Interactive PTY shells       │                                │
│  (user typing, resizing)      │ PURPOSE:                       │
│                              │ Background process execution   │
│                              │ (logging, monitoring)          │
│                              │                                │
└─────────────────────────────────────────────────────────────────┘

These are INDEPENDENT DOMAINS.
They serve DIFFERENT purposes.
They have DIFFERENT port contracts.
They have DIFFERENT lifecycles.
```

### Why Not Combine?

```
COMBINING THEM WOULD BREAK HEXAGONAL ARCHITECTURE:

Before (Separate & Clean):
┌──────────────────┐         ┌──────────────────┐
│ Terminal Domain  │         │ Process-Runners  │
├──────────────────┤         ├──────────────────┤
│ Port: Resize,    │         │ Port: Monitor,   │
│       Write,     │         │       Logging,   │
│       Subscribe  │         │       Events     │
│                  │         │                  │
│ Adapter:         │         │ Adapters:        │
│   Node-Pty       │         │   ProcessMonitor │
│                  │         │   TmuxSession    │
│                  │         │                  │
│ Service:         │         │ Service:         │
│   Terminal       │         │   ProcessRunner  │
│                  │         │                  │
└──────────────────┘         └──────────────────┘

Each has FOCUSED PORT CONTRACT
Each has SINGLE PURPOSE
Clean SEPARATION OF CONCERNS


After (Combined & Messy):
┌─────────────────────────────────┐
│ Process Execution Domain        │
├─────────────────────────────────┤
│ Port: Resize, Write, Subscribe, │
│       Monitor, Logging, Events? │
│                                 │
│ Adapters: Node-Pty, ProcessMon, │
│           TmuxSession?          │
│                                 │
│ Service: ProcessExecution?      │
│          TerminalUI?            │
│                                 │
└─────────────────────────────────┘

Port contract is TOO BROAD
Purpose is CONFUSED
Adapter relationship is UNCLEAR
Service responsibility is MIXED
```

---

## Detailed Comparison

### Terminal Domain (PTY-based Interactive)

**What It Does:**
- Spawns interactive shell processes
- Lets users type input, see output
- Supports resizing terminal window
- Used by renderer for terminal UI

**Port:**
```typescript
interface TerminalPort {
  spawn(ProcessConfig): ProcessState
  write(pid, data): void              ← Interactive input
  resize(pid, rows, cols): void       ← Window resize
  subscribe(pid, callback): void      ← Real-time output
}
```

**Lifecycle:**
- Tied to renderer window
- User opens = process starts
- User closes = process terminates
- **Stateful**: PTY maintains state

**Backend:**
- node-pty (native PTY binding)
- Full terminal emulation support
- Resizing, colors, cursor, etc.

**Scale:**
- ~1-5 terminals per session
- Each one interactive

---

### Process-Runners Domain (Session-based Background)

**What It Does:**
- Executes long-running background tasks
- Detachable from UI (tmux attach -t)
- Full I/O logging to files
- Activity monitoring, idle detection

**Ports:**
```typescript
interface ProcessMonitorPort {
  spawn(ProcessConfig): ProcessHandle
  monitor(handle): Stream<ProcessEvent>  ← Event-driven
  pipeTmuxSession(): void                ← Logging
  kill(handle): void
}

interface SessionManagerPort {
  createSession(name, cmd): ProcessHandle
  attachToSession(name): ProcessHandle    ← Detach/reattach
  listSessions(): TmuxSession[]
}
```

**Lifecycle:**
- Independent from UI
- Can survive window close
- Can be shared across windows
- **Event-driven**: Stream-based events

**Backend:**
- Tmux (CLI-based multiplexer)
- Simple shell commands
- Works on any UNIX system
- No native bindings needed

**Scale:**
- ~Many tasks per session
- Each one asynchronous
- Persistent across restarts

---

## Why Separation Maintains Hexagonal Architecture

### Port Segregation (Clean Contracts)

```
Terminal:
  Port = {spawn, write, resize, subscribe}
         ↓
  Adapter = NodePtyAdapter
         ↓
  Realizes: Interactive shell interface

Process-Runners:
  Ports = {ProcessMonitorPort, SessionManagerPort}
         ↓
  Adapters = ProcessMonitor, SessionManager (Tmux)
         ↓
  Realizes: Background task execution + monitoring
```

### Adapter Segregation (Clear Implementations)

```
Terminal:
  NodePtyAdapter
    ├─ Owns PTY state
    ├─ Handles resize events
    └─ Manages TTY input/output

Process-Runners:
  ProcessMonitorAdapter
    ├─ Streams events from process
    ├─ Detects silence/activity
    └─ Logs to files

  TmuxSessionManagerAdapter
    ├─ Creates tmux sessions
    ├─ Manages panes
    └─ Handles attach/detach
```

### Service Segregation (Clear Responsibility)

```
Terminal:
  TerminalService
    └─ Orchestrates interactive PTY operations

Process-Runners:
  ProcessRunnerService
    └─ Orchestrates background task execution
       and monitoring
```

---

## If We Combined (What Would Break)

```
❌ Port Contracts Would Be Confusing
   - Does resize apply to background tasks?
   - Are write/input needed for logging?
   - Do subscribers get events or stream logs?

❌ Adapters Would Have Overlapping Concerns
   - ProcessMonitor works with events (Tmux)
   - Terminal works with interactions (PTY)
   - Hard to explain why both are in same adapter layer

❌ Service Would Be Ambiguous
   - Is it a terminal service?
   - Is it a background executor?
   - Can't tell from name

❌ IPC Would Be Confusing
   - Some operations for interactive UI
   - Some operations for infrastructure
   - Mixed responsibilities in one interface

❌ Future Extensions Would Be Problematic
   - Want to add Docker process runner?
   - Want to add Kubernetes execution?
   - Where does it go in combined domain?
   - Becomes unclear which adapter for which use case
```

---

## Proper Hexagonal Architecture

Geppetto already follows this pattern successfully:

```
github/ (VCS Provider)
├── Port: GitHubProviderPort
├── Adapter: GitHubAdapter
├── Service: GitHubService
└── Responsibility: GitHub-specific operations

ai/ (AI Provider)
├── Port: AiProviderPort
├── Adapters: OpenAI, Claude, Cursor
├── Service: AiProviderService + Registry
└── Responsibility: AI operations

source-control/ (Git Execution)
├── Port: GitCommandRunnerPort
├── Adapter: NodeGitCommandRunner
├── Service: GitCommandService
└── Responsibility: Git command execution

terminal/ (Interactive Shell)
├── Port: TerminalPort
├── Adapter: NodePtyAdapter
├── Service: TerminalService
└── Responsibility: Interactive terminal UI

process-runners/ (Background Execution)
├── Ports: ProcessMonitorPort, SessionManagerPort
├── Adapters: ProcessMonitor, TmuxSessionManager
├── Service: ProcessRunnerService
└── Responsibility: Long-running task execution
```

**Each domain:**
- ✅ Has ONE clear responsibility
- ✅ Has FOCUSED port contracts
- ✅ Has PROPER adapters
- ✅ Has CLEAR service
- ✅ Can EVOLVE independently
- ✅ Can have MULTIPLE implementations

---

## The Right Solution

### Keep Separate (Maintains Architecture)

```
src/main/
├── terminal/              (Interactive PTY-based UI driver)
│   ├── terminal-port.ts
│   ├── terminal-service.ts
│   ├── terminal-registry.ts
│   └── node-pty/adapter.ts
│
└── process-runners/       (Background task execution + monitoring)
    ├── adapters/
    │   ├── process-monitor/
    │   └── tmux-session-manager/
    ├── services/
    │   └── process-runner-service.ts
    ├── ports.ts
    ├── schemas.ts
    ├── errors.ts
    └── index.ts
```

**Benefits:**
- ✅ Clean hexagonal boundaries
- ✅ Focused port contracts
- ✅ Clear separation of concerns
- ✅ Independent evolution
- ✅ Proper abstraction layers
- ✅ Easy to extend (add Docker, K8s, etc.)

### Don't Combine (Would Break Architecture)

Combining would:
- ❌ Mix two different purposes
- ❌ Create unfocused port contracts
- ❌ Make adapters unclear
- ❌ Confuse IPC interfaces
- ❌ Make future extensions problematic
- ❌ Violate single responsibility principle

---

## Implementation Plan

**Step 1:** Rename ai-runners → process-runners
- Find/replace: `ai-runners` → `process-runners`
- Find/replace: `AiRunner` → `ProcessRunner`
- Find/replace: `ai-runner-*` → `process-runner-*`
- Update IPC contracts
- Update renderer components

**Effort:** 1-2 hours
**Risk:** Low (pure rename, no logic changes)
**Result:** Same architecture, better naming

**Step 2:** Document (already done!)
- Created `TERMINAL_VS_PROCESS_RUNNERS_ANALYSIS.md`
- Created this decision document
- Architecture clarity for future team members

---

## Conclusion

**Keep Terminal and Process-Runners as separate domains.**

This maintains proper hexagonal architecture with:
- Clear port contracts
- Focused adapter implementations
- Single responsibility services
- Independent evolution paths
- Proper abstraction layers

Simply rename `ai-runners` → `process-runners` to clarify intent.

This is the correct architectural decision for a scalable, maintainable codebase.
