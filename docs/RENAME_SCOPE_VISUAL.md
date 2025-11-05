# Rename Scope Visualization: ai-watchers → process-runners

## Impact Layers

```
┌─────────────────────────────────────────────────────────────────────┐
│                          USER EXPERIENCE                             │
│                                                                       │
│  ✅ No changes visible - Same functionality, better naming            │
└─────────────────────────────────────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────┐
│                        RENDERER PROCESS                              │
│                                                                       │
│  Frontend Components & UI State:                                     │
│  - ProcessRunnersPanel component                                     │
│  - ProcessRunnerStatusLED component                                  │
│  - processRunnersAtom (state)                                        │
│  - useProcessRunners() hook                                          │
│  - useProcessRunnerLauncher() hook                                   │
│  - IPC client (ProcessRunnerClient)                                  │
│                                                                       │
│  Files Changed: 11 (components, atoms, hooks)                        │
└─────────────────────────────────────────────────────────────────────┘
                                   ↓
                        (IPC Communication)
                                   ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    MAIN PROCESS - IPC LAYER                          │
│                                                                       │
│  IPC Contracts & Handlers:                                           │
│  - ProcessRunnerIpcContracts (10 channel types)                      │
│  - process-runner-handlers (10 handler registrations)                │
│  - ProcessRunnerClient class                                         │
│  - Error mapping (ProcessError types)                                │
│                                                                       │
│  Files Changed: 3 (contracts, handlers, client)                      │
└─────────────────────────────────────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────┐
│                   SHARED LAYER - Schemas & Types                     │
│                                                                       │
│  Type Definitions:                                                   │
│  - ProcessRunner (renamed from AiWatcher)                            │
│  - ProcessRunnerConfig (renamed from AiWatcherConfig)                │
│  - ProcessRunnerStatus (renamed from AiWatcherStatus)                │
│  - Error types (unchanged - generic)                                 │
│                                                                       │
│  Files Changed: 3 (schemas directory + files)                        │
└─────────────────────────────────────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────┐
│                MAIN PROCESS - Service & Domain Layer                 │
│                                                                       │
│  Domain Implementation:                                              │
│  - ProcessRunnerService (renamed from AiWatcherService)              │
│  - ProcessRunnersLayer (renamed from AiWatchersLayer)                │
│  - RunnerAdaptersLayer (renamed from WatcherAdaptersLayer)           │
│  - Adapters (unchanged - ProcessMonitor, TmuxSessionManager)         │
│  - Ports (unchanged - ProcessMonitorPort, SessionManagerPort)        │
│                                                                       │
│  Files Changed: 7 (service, index.ts, layer composition)             │
│  Directory: process-runners/ (renamed from ai-watchers/)             │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Change Matrix

### By Layer

```
RENDERER (Frontend)
├── Components: ai-watchers/ → process-runners/
│   ├── WatchersPanel.tsx
│   ├── WatcherStatusLED.tsx
│   └── IssuesModal.tsx
├── Atoms: ai-watcher-atoms.ts → process-runner-atoms.ts
├── Hooks: useAiWatchers → useProcessRunners (2 files)
├── IPC Client: AiWatcherClient → ProcessRunnerClient
├── App Integration: updated imports in App.tsx, main.tsx
└── Total: 11 files

SHARED (Cross-process)
├── Schemas: ai-watchers/ → process-runners/
│   ├── AiWatcher → ProcessRunner
│   ├── AiWatcherConfig → ProcessRunnerConfig
│   └── AiWatcherStatus → ProcessRunnerStatus
├── IPC Contracts: AiWatcherIpcContracts → ProcessRunnerIpcContracts
│   └── 10 channel names change: 'ai-watcher:*' → 'process-runner:*'
└── Total: 3 files

MAIN PROCESS (Backend)
├── Domain: ai-watchers/ → process-runners/
│   ├── Service: AiWatcherService → ProcessRunnerService
│   ├── Layer: AiWatchersLayer → ProcessRunnersLayer
│   └── Adapters: unchanged (generic names)
├── IPC: ai-watcher-handlers → process-runner-handlers
├── Integration: MainLayer updated
└── Total: 7 files
```

---

## Dependency Graph

```
User Interaction (Renderer UI)
    ↓
ProcessRunnersPanel Component
    ↓
useProcessRunners() Hook
    ↓
processRunnersAtom (Effect Atom)
    ↓
ProcessRunnerClient (IPC Client)
    ↓↓↓ IPC Communication ↓↓↓
    ↓
process-runner-handlers (IPC Handler)
    ↓
ProcessRunnerService (Business Logic)
    ↓
ProcessMonitorAdapter (Low-level: Node.js)
    +
TmuxSessionManagerAdapter (Low-level: Tmux CLI)
    ↓
Operating System (Processes, Tmux)
```

---

## Type Transformation Trail

```
User Input (Renderer)
    ↓
ProcessRunnerConfig (Type)
    ↓
    send via IPC: 'process-runner:create' channel
    ↓
ProcessRunnerIpcContracts['process-runner:create']
    ↓
process-runner-handlers (Main Process)
    ↓
ProcessRunnerService.create(config)
    ↓
ProcessMonitorAdapter.spawn()
    ↓
Child Process (Tmux Session)
    ↓
    event stream back through handlers
    ↓
ProcessRunnerClient (Renderer receives response)
    ↓
processRunnersAtom (Re-renders UI)
    ↓
ProcessRunnersPanel (Displays runner)
```

---

## Files Overview

### Type Changes (What Gets Renamed)

```typescript
// AiWatcher Domain Names (CHANGE)
AiWatcher                    → ProcessRunner
AiWatcherConfig              → ProcessRunnerConfig
AiWatcherStatus              → ProcessRunnerStatus
AiWatcherPort                → ProcessRunnerPort
AiWatcherService             → ProcessRunnerService
AiWatchersLayer              → ProcessRunnersLayer
WatcherAdaptersLayer         → RunnerAdaptersLayer

// Generic Names (STAY THE SAME)
ProcessMonitorPort           ✅ (generic - all processes)
SessionManagerPort           ✅ (generic - all sessions)
ProcessMonitorAdapter        ✅ (generic)
TmuxSessionManagerAdapter    ✅ (generic)
ProcessHandle                ✅ (generic)
ProcessEvent                 ✅ (generic)
ProcessConfig                ✅ (generic)
LogEntry                     ✅ (generic)
TmuxSession                  ✅ (generic)
```

---

## Risk Analysis

### By Layer

```
RENDERER (Frontend): MEDIUM RISK
├── Many files (11) spread across components, hooks, atoms
├── But: Pure rename, type-safe with TypeScript
├── Mitigation: Compile catches all mismatches
└── Risk: High file count, but low logic complexity

SHARED (Contracts): MEDIUM RISK
├── IPC channel names MUST match between main ↔ renderer
├── If mismatch: IPC calls fail with "channel not found"
├── Type names affect both processes
└── Risk: Synchronization critical - compile catches mismatches

MAIN PROCESS (Backend): LOW RISK
├── Only service name changes
├── Adapters stay same (they're generic)
├── Layer composition changes
└── Risk: Single domain, easier to track

IPC INTEGRATION: MEDIUM RISK
├── Channel names MUST match handler registrations
├── Client invocations MUST match contract definitions
├── If mismatch: Runtime errors
└── Risk: Synchronization - compile catches issues
```

---

## Compilation Safety

TypeScript compilation will **catch errors in:**
```
✅ Import path mismatches
✅ Type name changes not propagated
✅ Missing/extra function parameters
✅ Service method signatures
✅ IPC contract definitions
✅ Hook/component prop types
✅ Atom state types

❌ Runtime errors (like channel name strings not matching)
   → Need manual verification: check channel strings match between:
     - ProcessRunnerIpcContracts definition
     - registerIpcHandler calls
     - ProcessRunnerClient invoke calls
```

---

## Change Distribution

```
Total Changes: 20 files, 18 type renames, 5 directory changes

By Category:
├── Type Renames:        60% (11 names)
├── Import Updates:      25% (path changes)
├── Channel Renames:     10% (IPC only)
├── Function Renames:     5% (minimal)

By Severity:
├── High Visibility:     30% (Component names)
├── Medium Visibility:   40% (Hook/atom names)
├── Low Visibility:      30% (Internal types)
```

---

## Verification Points

```
Phase A (Backend): After renaming domain
├── Can compile?          → pnpm compile:app:pro
└── No import errors?     → TypeScript check

Phase B (Shared): After updating schemas & IPC
├── IPC contracts valid?  → TypeScript check
└── Channel names OK?     → Manual review

Phase C (Frontend): After updating components
├── Components compile?   → TypeScript check
└── Hook types match?     → TypeScript check

Phase D (Integration): After updating handlers
├── Handlers register?    → Manual review (no errors = ok)
└── Channels match?       → Verify 'process-runner:*' everywhere

Phase E (Verification): Full system test
├── Dev server starts?    → pnpm dev:pro
├── No console errors?    → Check DevTools
└── Feature works?        → Manual test start/stop
```

---

## Rollback Complexity

```
If need to rollback at ANY point:

  git reset --hard HEAD~1

Why safe:
✅ Pure rename (no logic changes)
✅ All changes are string/name replacements
✅ No altered functionality
✅ No database migrations
✅ No deployment changes

Time to rollback: < 1 minute
Risk of rollback: Minimal (just reverts strings)
```

---

## Success Criteria

```
✅ All 20 files renamed/updated
✅ Compilation succeeds with zero errors
✅ Dev server starts without crashing
✅ No "ai-watcher" or "AiWatcher" in console
✅ No "cannot find module" errors
✅ Feature test passes (start/stop runner works)
✅ Git log shows single commit with all changes
✅ All related docs updated
```
