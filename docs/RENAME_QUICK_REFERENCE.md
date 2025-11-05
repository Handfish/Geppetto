# AI-Runners → Process-Runners: Quick Reference

## Rename Mappings

### Directory Structure
```
ai-runners/          → process-runners/
ai-runner-atoms.ts   → process-runner-atoms.ts
ai-runner-handlers   → process-runner-handlers.ts
ai-runners/          → process-runners/ (components)
```

### Type Names
```
AiRunner             → ProcessRunner
AiRunnerConfig       → ProcessRunnerConfig
AiRunnerStatus       → ProcessRunnerStatus
AiRunnerPort         → ProcessRunnerPort
```

### Service Names
```
AiRunnerService      → ProcessRunnerService
AiRunnersLayer       → ProcessRunnersLayer
RunnerAdaptersLayer  → RunnerAdaptersLayer
```

### IPC Names
```
AiRunnerIpcContracts → ProcessRunnerIpcContracts
ai-runner:*          → process-runner:*
AiRunnerClient       → ProcessRunnerClient
```

### Atom/Hook Names
```
aiRunnersAtom        → processRunnersAtom
aiRunnerByIdAtom     → processRunnerByIdAtom
aiRunnerLogsAtom     → processRunnerLogsAtom
useAiRunners         → useProcessRunners
useAiRunnerLauncher  → useProcessRunnerLauncher
```

### Component Names
```
AiRunnersPanel       → ProcessRunnersPanel
AiRunnerStatusLED    → ProcessRunnerStatusLED
AiRunnerDevPanel     → ProcessRunnerDevPanel
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
RunnerNotFoundError         ✅ (no change)
TmuxError                    ✅ (no change)
```

---

## Channel Names Mapping

```
'ai-runner:create'        → 'process-runner:create'
'ai-runner:attach-tmux'   → 'process-runner:attach-tmux'
'ai-runner:list'          → 'process-runner:list'
'ai-runner:get'           → 'process-runner:get'
'ai-runner:stop'          → 'process-runner:stop'
'ai-runner:start'         → 'process-runner:start'
'ai-runner:get-logs'      → 'process-runner:get-logs'
'ai-runner:list-tmux'     → 'process-runner:list-tmux'
'ai-runner:switch-tmux'   → 'process-runner:switch-tmux'
'ai-runner:get-output'    → 'process-runner:get-output'
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
- Find: `ai-runner-service` Replace: `process-runner-service`
- Find: `AiRunnerService` Replace: `ProcessRunnerService`
- Find: `AiRunnersLayer` Replace: `ProcessRunnersLayer`
- Find: `RunnerAdaptersLayer` Replace: `RunnerAdaptersLayer`

### Shared Layer
- Find: `AiRunner` Replace: `ProcessRunner` (context-aware!)
- Find: `ai-runners` Replace: `process-runners`

### Frontend
- Find: `AiRunner` Replace: `ProcessRunner`
- Find: `aiRunner` Replace: `processRunner`
- Find: `useAiRunner` Replace: `useProcessRunner`

### IPC Channels
- Find: `'ai-runner:` Replace: `'process-runner:`

---

## Git Commands

```bash
# Rename directory
mv src/main/ai-runners src/main/process-runners
mv src/shared/schemas/ai-runners src/shared/schemas/process-runners
mv src/renderer/components/ai-runners src/renderer/components/process-runners

# Rename files
mv src/renderer/atoms/ai-runner-atoms.ts src/renderer/atoms/process-runner-atoms.ts
mv src/renderer/hooks/useAiRunners.ts src/renderer/hooks/useProcessRunners.ts
mv src/renderer/hooks/useAiRunnerLauncher.ts src/renderer/hooks/useProcessRunnerLauncher.ts
mv src/main/ipc/ai-runner-handlers.ts src/main/ipc/process-runner-handlers.ts
mv src/renderer/components/dev/AiRunnerDevPanel.tsx src/renderer/components/dev/ProcessRunnerDevPanel.tsx

# Stage all changes
git add -A

# Check what will be committed
git status

# Commit
git commit -m "refactor: rename ai-runners → process-runners"
```

---

## Verification Checklist

After all changes:

- [ ] `git status` shows expected renames and changes
- [ ] `pnpm compile:app:pro` succeeds with no errors
- [ ] `pnpm dev:pro` starts without errors
- [ ] DevTools console has no "ai-runner" or "AiRunner" errors
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
