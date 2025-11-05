# AI-Watchers → Process-Runners: Quick Reference

## Rename Mappings

### Directory Structure
```
ai-watchers/          → process-runners/
ai-watcher-atoms.ts   → process-runner-atoms.ts
ai-watcher-handlers   → process-runner-handlers.ts
ai-watchers/          → process-runners/ (components)
```

### Type Names
```
AiWatcher             → ProcessRunner
AiWatcherConfig       → ProcessRunnerConfig
AiWatcherStatus       → ProcessRunnerStatus
AiWatcherPort         → ProcessRunnerPort
```

### Service Names
```
AiWatcherService      → ProcessRunnerService
AiWatchersLayer       → ProcessRunnersLayer
WatcherAdaptersLayer  → RunnerAdaptersLayer
```

### IPC Names
```
AiWatcherIpcContracts → ProcessRunnerIpcContracts
ai-watcher:*          → process-runner:*
AiWatcherClient       → ProcessRunnerClient
```

### Atom/Hook Names
```
aiWatchersAtom        → processRunnersAtom
aiWatcherByIdAtom     → processRunnerByIdAtom
aiWatcherLogsAtom     → processRunnerLogsAtom
useAiWatchers         → useProcessRunners
useAiWatcherLauncher  → useProcessRunnerLauncher
```

### Component Names
```
AiWatchersPanel       → ProcessRunnersPanel
AiWatcherStatusLED    → ProcessRunnerStatusLED
AiWatcherDevPanel     → ProcessRunnerDevPanel
```

---

## What STAYS the Same

**Generic type/adapter names (they're not AI-specific):**
```
NodeProcessMonitorAdapter    ✅ (no change)
TmuxSessionManagerAdapter    ✅ (no change)
ProcessMonitorPort           ✅ (no change)
SessionManagerPort           ✅ (no change)
ProcessHandle                ✅ (no change)
ProcessEvent                 ✅ (no change)
ProcessConfig                ✅ (no change)
LogEntry                     ✅ (no change)
TmuxSession                  ✅ (no change)
ProcessError                 ✅ (no change)
WatcherNotFoundError         ✅ (no change)
TmuxError                    ✅ (no change)
```

---

## Channel Names Mapping

```
'ai-watcher:create'        → 'process-runner:create'
'ai-watcher:attach-tmux'   → 'process-runner:attach-tmux'
'ai-watcher:list'          → 'process-runner:list'
'ai-watcher:get'           → 'process-runner:get'
'ai-watcher:stop'          → 'process-runner:stop'
'ai-watcher:start'         → 'process-runner:start'
'ai-watcher:get-logs'      → 'process-runner:get-logs'
'ai-watcher:list-tmux'     → 'process-runner:list-tmux'
'ai-watcher:switch-tmux'   → 'process-runner:switch-tmux'
'ai-watcher:get-output'    → 'process-runner:get-output'
```

---

## Scope Summary

| Layer | Type Changes | Directory Changes | Files |
|-------|--------------|-------------------|-------|
| Main | 3 | 1 | 7 |
| Shared | 3 | 1 | 3 |
| Frontend | 8 | 2 | 11 |
| IPC | 4 | 1 | 3 |
| **Total** | **18** | **5** | **24** |

---

## Find & Replace Cheatsheet

Use these in your editor (VS Code find/replace):

### Main Process
- Find: `ai-watcher-service` Replace: `process-runner-service`
- Find: `AiWatcherService` Replace: `ProcessRunnerService`
- Find: `AiWatchersLayer` Replace: `ProcessRunnersLayer`
- Find: `WatcherAdaptersLayer` Replace: `RunnerAdaptersLayer`

### Shared Layer
- Find: `AiWatcher` Replace: `ProcessRunner` (context-aware!)
- Find: `ai-watchers` Replace: `process-runners`

### Frontend
- Find: `AiWatcher` Replace: `ProcessRunner`
- Find: `aiWatcher` Replace: `processRunner`
- Find: `useAiWatcher` Replace: `useProcessRunner`

### IPC Channels
- Find: `'ai-watcher:` Replace: `'process-runner:`

---

## Git Commands

```bash
# Rename directory
mv src/main/ai-watchers src/main/process-runners
mv src/shared/schemas/ai-watchers src/shared/schemas/process-runners
mv src/renderer/components/ai-watchers src/renderer/components/process-runners

# Rename files
mv src/renderer/atoms/ai-watcher-atoms.ts src/renderer/atoms/process-runner-atoms.ts
mv src/renderer/hooks/useAiWatchers.ts src/renderer/hooks/useProcessRunners.ts
mv src/renderer/hooks/useAiWatcherLauncher.ts src/renderer/hooks/useProcessRunnerLauncher.ts
mv src/main/ipc/ai-watcher-handlers.ts src/main/ipc/process-runner-handlers.ts
mv src/renderer/components/dev/AiWatcherDevPanel.tsx src/renderer/components/dev/ProcessRunnerDevPanel.tsx

# Stage all changes
git add -A

# Check what will be committed
git status

# Commit
git commit -m "refactor: rename ai-watchers → process-runners"
```

---

## Verification Checklist

After all changes:

- [ ] `git status` shows expected renames and changes
- [ ] `pnpm compile:app:pro` succeeds with no errors
- [ ] `pnpm dev:pro` starts without errors
- [ ] DevTools console has no "ai-watcher" or "AiWatcher" errors
- [ ] Can open repository dropdown
- [ ] Status LED appears and works
- [ ] Can start/stop process runner
- [ ] Logs display correctly
- [ ] No broken imports in editor

---

## Estimated Time

- Phase A (Backend): 30 min
- Phase B (Shared): 20 min
- Phase C (Frontend): 45 min
- Phase D (IPC): 20 min
- Phase E (Verify): 15 min

**Total: ~2 hours**

---

## Panic Button

If anything breaks:
```bash
git reset --hard HEAD~1
# Reverts all changes
```

---

## Reference Files

- Full plan: `docs/RENAME_AI_WATCHERS_TO_PROCESS_RUNNERS_PLAN.md`
- Architecture decision: `docs/ARCHITECTURE_DECISION_SEPARATE_DOMAINS.md`
- Analysis: `docs/TERMINAL_VS_PROCESS_RUNNERS_ANALYSIS.md`
