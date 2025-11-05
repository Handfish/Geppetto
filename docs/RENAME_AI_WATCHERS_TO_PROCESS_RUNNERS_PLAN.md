# Rename ai-watchers → process-runners: Multi-Step Plan

## Overview

Renaming `ai-watchers` → `process-runners` affects:
- **IPC contracts** (6 channel names)
- **Shared schemas** (types and errors)
- **Main process** (service, handlers, layer composition)
- **Renderer** (11 files, 83+ references)
- **Git organization** (directories and imports)

**Total Effort:** 2-3 hours
**Risk Level:** Low (pure rename, no logic changes)
**Verification:** Compile + test

---

## Phase Breakdown

### Phase A: Backend Foundation (30 min)
- Rename main process domain directory
- Update import paths in backend
- Verify compilation

### Phase B: Shared Layer (20 min)
- Rename shared schemas directory
- Rename IPC contracts and channels
- Update all imports

### Phase C: Frontend Update (45 min)
- Rename renderer components directory
- Rename atoms and hooks
- Update component imports

### Phase D: IPC Integration (20 min)
- Update IPC handlers
- Update IPC client
- Update error mapper

### Phase E: Verification & Commit (15 min)
- Compile and test
- Verify both drivers work
- Create commit

---

## Detailed Steps

## PHASE A: Backend Foundation

### A1: Rename Main Domain Directory
```bash
mv src/main/ai-watchers src/main/process-runners
```

**Files affected in src/main/process-runners/:**
- `ports.ts` (NO CHANGES - port names stay generic)
- `schemas.ts` (NO CHANGES - data structures stay generic)
- `errors.ts` (NO CHANGES - error names stay generic)
- `services/ai-watcher-service.ts` → `services/process-runner-service.ts`
- `index.ts` (UPDATE exports)
- `adapters/` (NO CHANGES - adapter names stay generic)

### A2: Rename Service File
```bash
mv src/main/process-runners/services/ai-watcher-service.ts \
   src/main/process-runners/services/process-runner-service.ts
```

### A3: Update src/main/process-runners/services/process-runner-service.ts

**Change class name:**
```typescript
// BEFORE
export class AiWatcherService extends Effect.Service<AiWatcherService>()(
  'AiWatcherService',
  // ...
)

// AFTER
export class ProcessRunnerService extends Effect.Service<ProcessRunnerService>()(
  'ProcessRunnerService',
  // ...
)
```

**Update interface:**
```typescript
// BEFORE
interface AiWatcherPort {
  create(config: AiWatcherConfig): Effect.Effect<AiWatcher, AiWatcherCreateError>
  // ...
}

// AFTER
interface ProcessRunnerPort {
  create(config: ProcessRunnerConfig): Effect.Effect<ProcessRunner, ProcessRunnerCreateError>
  // ...
}
```

**Update type imports:**
```typescript
// BEFORE
import type { AiWatcherPort } from '../ports'
import { AiWatcher, AiWatcherConfig } from '../schemas'

// AFTER
import type { ProcessRunnerPort } from '../ports'
import { ProcessRunner, ProcessRunnerConfig } from '../schemas'
```

### A4: Update src/main/process-runners/index.ts
```typescript
// BEFORE
import { AiWatcherService } from './services'
export { AiWatcherService }
export const AiWatchersLayer = Layer.mergeAll(
  WatcherAdaptersLayer,
  AiWatcherService.Default
)

// AFTER
import { ProcessRunnerService } from './services'
export { ProcessRunnerService }
export const ProcessRunnersLayer = Layer.mergeAll(
  RunnerAdaptersLayer,
  ProcessRunnerService.Default
)
```

**Rename exports:**
- `AiWatchersLayer` → `ProcessRunnersLayer`
- `WatcherAdaptersLayer` → `RunnerAdaptersLayer`
- `NodeProcessMonitorAdapter` stays same (generic)
- `TmuxSessionManagerAdapter` stays same (generic)

### A5: Update src/main/index.ts
```typescript
// BEFORE
import { AiWatchersLayer } from './ai-watchers'
// ...
const MainLayer = Layer.mergeAll(
  AiWatchersLayer,
  // ...
)

// AFTER
import { ProcessRunnersLayer } from './process-runners'
// ...
const MainLayer = Layer.mergeAll(
  ProcessRunnersLayer,
  // ...
)
```

### A6: Verify Compilation (Backend Only)
```bash
pnpm compile:app:pro
# Should succeed with no errors
```

---

## PHASE B: Shared Layer (Schemas & IPC)

### B1: Rename Shared Schemas Directory
```bash
mv src/shared/schemas/ai-watchers src/shared/schemas/process-runners
```

**Files in this directory:**
- `index.ts` - Re-exports all types
- `errors.ts` - Error definitions (NO NAME CHANGES - generic)

### B2: Update src/shared/schemas/process-runners/index.ts
```typescript
// BEFORE
export class AiWatcher extends S.Class<AiWatcher>('AiWatcher') { ... }
export class AiWatcherConfig extends S.Class<AiWatcherConfig>('AiWatcherConfig') { ... }
export class AiWatcherStatus extends S.Class<AiWatcherStatus>('AiWatcherStatus') { ... }
export type LogEntry = { ... }
export type TmuxSession = { ... }

// AFTER
export class ProcessRunner extends S.Class<ProcessRunner>('ProcessRunner') { ... }
export class ProcessRunnerConfig extends S.Class<ProcessRunnerConfig>('ProcessRunnerConfig') { ... }
export class ProcessRunnerStatus extends S.Class<ProcessRunnerStatus>('ProcessRunnerStatus') { ... }
export type LogEntry = { ... }
export type TmuxSession = { ... }
```

**Classes to rename:**
- `AiWatcher` → `ProcessRunner`
- `AiWatcherConfig` → `ProcessRunnerConfig`
- `AiWatcherStatus` → `ProcessRunnerStatus`
- Keep: `LogEntry`, `TmuxSession`, `ProcessHandle`, `ProcessEvent`, `ProcessConfig`

### B3: Update src/shared/schemas/process-runners/errors.ts
**No changes needed - error names are generic:**
- `ProcessError` ✅ (stays same)
- `WatcherNotFoundError` ✅ (stays same, refers to process runner)
- `WatcherOperationError` ✅ (stays same)
- `TmuxError` ✅ (stays same)

### B4: Update src/shared/ipc-contracts.ts

**Import statement:**
```typescript
// BEFORE
import {
  AiWatcher,
  AiWatcherConfig,
  LogEntry,
  TmuxSession,
} from './schemas/ai-watchers'

// AFTER
import {
  ProcessRunner,
  ProcessRunnerConfig,
  LogEntry,
  TmuxSession,
} from './schemas/process-runners'
```

**Rename contract object:**
```typescript
// BEFORE
export const AiWatcherIpcContracts = {
  'ai-watcher:create': { ... },
  'ai-watcher:list': { ... },
  // ...
}

// AFTER
export const ProcessRunnerIpcContracts = {
  'process-runner:create': { ... },
  'process-runner:list': { ... },
  // ...
}
```

**Rename channel names:**
- `'ai-watcher:create'` → `'process-runner:create'`
- `'ai-watcher:attach-tmux'` → `'process-runner:attach-tmux'`
- `'ai-watcher:list'` → `'process-runner:list'`
- `'ai-watcher:get'` → `'process-runner:get'`
- `'ai-watcher:stop'` → `'process-runner:stop'`
- `'ai-watcher:start'` → `'process-runner:start'`
- `'ai-watcher:get-logs'` → `'process-runner:get-logs'`
- `'ai-watcher:list-tmux'` → `'process-runner:list-tmux'`
- `'ai-watcher:switch-tmux'` → `'process-runner:switch-tmux'`
- `'ai-watcher:get-output'` → `'process-runner:get-output'`

**Update output types:**
```typescript
// BEFORE
output: AiWatcher,
output: S.Array(AiWatcher),

// AFTER
output: ProcessRunner,
output: S.Array(ProcessRunner),
```

**Update input types:**
```typescript
// BEFORE
input: AiWatcherConfig,

// AFTER
input: ProcessRunnerConfig,
```

**Export the new contracts:**
```typescript
// ADD at end of ipc-contracts file
export { ProcessRunnerIpcContracts }
```

### B5: Update src/shared/ipc-contracts.ts Export in Index

Make sure ProcessRunnerIpcContracts is exported where used:
```typescript
// Wherever AiWatcherIpcContracts is referenced:
// Change to ProcessRunnerIpcContracts
```

---

## PHASE C: Frontend Update

### C1: Rename Components Directory
```bash
mv src/renderer/components/ai-watchers src/renderer/components/process-runners
```

**Files:**
- `WatchersPanel.tsx`
- `WatcherStatusLED.tsx`
- `IssuesModal.tsx`

### C2: Rename Atoms File
```bash
mv src/renderer/atoms/ai-watcher-atoms.ts \
   src/renderer/atoms/process-runner-atoms.ts
```

### C3: Rename Hooks Files
```bash
mv src/renderer/hooks/useAiWatchers.ts \
   src/renderer/hooks/useProcessRunners.ts

mv src/renderer/hooks/useAiWatcherLauncher.ts \
   src/renderer/hooks/useProcessRunnerLauncher.ts
```

### C4: Update src/renderer/atoms/process-runner-atoms.ts

**Rename atom constants:**
```typescript
// BEFORE
export const aiWatchersAtom = Atom.make(...)
export const aiWatcherByIdAtom = Atom.family(...)
export const aiWatcherLogsAtom = Atom.family(...)
export const aiWatcherStatusAtom = Atom.family(...)

// AFTER
export const processRunnersAtom = Atom.make(...)
export const processRunnerByIdAtom = Atom.family(...)
export const processRunnerLogsAtom = Atom.family(...)
export const processRunnerStatusAtom = Atom.family(...)
```

**Update IPC contract reference:**
```typescript
// BEFORE
import { AiWatcherIpcContracts } from '../../shared/ipc-contracts'

// AFTER
import { ProcessRunnerIpcContracts } from '../../shared/ipc-contracts'
```

**Update channel references:**
```typescript
// All references to AiWatcherIpcContracts.* become ProcessRunnerIpcContracts.*
```

### C5: Update src/renderer/hooks/useProcessRunners.ts

**Update hook names:**
```typescript
// BEFORE
export function useAiWatchers() { ... }
export const aiWatchersQuery = { ... }
export const aiWatcherQuery = { ... }

// AFTER
export function useProcessRunners() { ... }
export const processRunnersQuery = { ... }
export const processRunnerQuery = { ... }
```

**Update imports:**
```typescript
// BEFORE
import { aiWatchersAtom, aiWatcherByIdAtom } from '../atoms/ai-watcher-atoms'

// AFTER
import { processRunnersAtom, processRunnerByIdAtom } from '../atoms/process-runner-atoms'
```

### C6: Update src/renderer/hooks/useProcessRunnerLauncher.ts

**Update hook names:**
```typescript
// BEFORE
export function useAiWatcherLauncher() { ... }

// AFTER
export function useProcessRunnerLauncher() { ... }
```

**Update service references:**
```typescript
// Update any AiWatcher references to ProcessRunner
```

### C7: Update Component Files

**src/renderer/components/process-runners/WatchersPanel.tsx:**
```typescript
// BEFORE
import { useAiWatchers } from '../../hooks/useAiWatchers'
export function AiWatchersPanel() { ... }

// AFTER
import { useProcessRunners } from '../../hooks/useProcessRunners'
export function ProcessRunnersPanel() { ... }
```

**src/renderer/components/process-runners/WatcherStatusLED.tsx:**
```typescript
// BEFORE
export function AiWatcherStatusLED(props: { watcherId: string }) { ... }

// AFTER
export function ProcessRunnerStatusLED(props: { runnerId: string }) { ... }
```

**Update any internal references to `watcherId` → `runnerId`** (optional, for consistency)

**src/renderer/components/process-runners/IssuesModal.tsx:**
```typescript
// Update imports and any watcher references to runner
```

### C8: Update Dev Component
**src/renderer/components/dev/AiWatcherDevPanel.tsx:**

Rename and update:
```typescript
// BEFORE
export function AiWatcherDevPanel() { ... }

// AFTER
export function ProcessRunnerDevPanel() { ... }
```

### C9: Update Component Imports in App.tsx

```typescript
// BEFORE
import { AiWatchersPanel } from './components/ai-watchers/WatchersPanel'
import { AiWatcherStatusLED } from './components/ai-watchers/WatcherStatusLED'

// AFTER
import { ProcessRunnersPanel } from './components/process-runners/WatchersPanel'
import { ProcessRunnerStatusLED } from './components/process-runners/WatcherStatusLED'
```

**Update render calls:**
```typescript
// BEFORE
<AiWatchersPanel />
<AiWatcherStatusLED watcherId={...} />

// AFTER
<ProcessRunnersPanel />
<ProcessRunnerStatusLED runnerId={...} />
```

### C10: Update main.tsx
```typescript
// BEFORE
import { WatchersPanel } from '../components/ai-watchers/WatchersPanel'

// AFTER
import { WatchersPanel } from '../components/process-runners/WatchersPanel'
```

### C11: Update RepositoryDropdown.tsx
```typescript
// Find and update any watcher references
// If it references AiWatcher types, update to ProcessRunner
```

---

## PHASE D: IPC Integration

### D1: Update src/main/ipc/ai-watcher-handlers.ts

**Rename file:**
```bash
mv src/main/ipc/ai-watcher-handlers.ts \
   src/main/ipc/process-runner-handlers.ts
```

**Update function name:**
```typescript
// BEFORE
export const setupAiWatcherIpcHandlers = Effect.gen(function* () {
  const aiWatcherService = yield* AiWatcherService

// AFTER
export const setupProcessRunnerIpcHandlers = Effect.gen(function* () {
  const processRunnerService = yield* ProcessRunnerService
```

**Update contract references:**
```typescript
// BEFORE
registerIpcHandler(AiWatcherIpcContracts['ai-watcher:create'], ...)

// AFTER
registerIpcHandler(ProcessRunnerIpcContracts['process-runner:create'], ...)
```

**Update all handler registrations** (10+ handlers):
- All channel names change
- Service method calls might have different names depending on the service

### D2: Update src/main/index.ts (IPC Setup)

```typescript
// BEFORE
import { setupAiWatcherIpcHandlers } from './ipc/ai-watcher-handlers'

app.whenReady().then(async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      yield* setupAiWatcherIpcHandlers
      // ...
    })
  )
})

// AFTER
import { setupProcessRunnerIpcHandlers } from './ipc/process-runner-handlers'

app.whenReady().then(async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      yield* setupProcessRunnerIpcHandlers
      // ...
    })
  )
})
```

### D3: Update src/renderer/lib/ipc-client.ts

**Rename class:**
```typescript
// BEFORE
export class AiWatcherClient extends Effect.Service<AiWatcherClient>()('AiWatcherClient', ...)

// AFTER
export class ProcessRunnerClient extends Effect.Service<ProcessRunnerClient>()('ProcessRunnerClient', ...)
```

**Update method names:**
```typescript
// BEFORE
readonly createWatcher = (config: AiWatcherConfig) => ...
readonly listWatchers = () => ...
readonly getWatcher = (watcherId: string) => ...

// AFTER
readonly createRunner = (config: ProcessRunnerConfig) => ...
readonly listRunners = () => ...
readonly getRunner = (runnerId: string) => ...
```

**Update channel references:**
```typescript
// BEFORE
invoke('ai-watcher:create', config)

// AFTER
invoke('process-runner:create', config)
```

### D4: Update src/main/ipc/error-mapper.ts

**No major changes needed** - error types are generic
- May need to update import path if schemas moved:
```typescript
// BEFORE
import { WatcherNotFoundError } from '../ai-watchers/errors'

// AFTER
import { WatcherNotFoundError } from '../process-runners/errors'
```

### D5: Update src/main/ipc/ipc-handler-setup.ts

**Check if any direct references exist:**
```bash
grep -n "ai-watcher\|AiWatcher" src/main/ipc/ipc-handler-setup.ts
# Should be none or minimal
```

---

## PHASE E: Verification & Commit

### E1: Full Compilation
```bash
pnpm compile:app:pro
# Should succeed with no errors
# Check: ✓ 121+ modules transformed
```

### E2: Dev Server Test
```bash
pnpm dev:pro
# Should start without errors
# Check DevTools console for no AiWatcher/ai-watcher references
```

### E3: Feature Testing
1. Open repository dropdown
2. Check watcher/runner LED shows
3. Start a process runner (simulate AI watcher)
4. Check logs display
5. Stop process runner
6. Verify no errors in console

### E4: Git Status Check
```bash
git status
# Should show:
# - Renamed directories
# - Modified files across all layers
# - No unexpected changes
```

### E5: Create Commit
```bash
git add -A
git commit -m "refactor: rename ai-watchers → process-runners for clarity

CHANGES:
- Rename src/main/ai-watchers → src/main/process-runners
- Rename src/shared/schemas/ai-watchers → src/shared/schemas/process-runners
- Rename src/renderer/components/ai-watchers → src/renderer/components/process-runners

UPDATES:
Main Process:
- AiWatcherService → ProcessRunnerService
- AiWatchersLayer → ProcessRunnersLayer

IPC:
- AiWatcherIpcContracts → ProcessRunnerIpcContracts
- Channel names: 'ai-watcher:*' → 'process-runner:*'
- ai-watcher-handlers → process-runner-handlers
- AiWatcherClient → ProcessRunnerClient

Schemas:
- AiWatcher → ProcessRunner
- AiWatcherConfig → ProcessRunnerConfig
- AiWatcherStatus → ProcessRunnerStatus

Frontend:
- Atoms: aiWatchersAtom → processRunnersAtom
- Hooks: useAiWatchers → useProcessRunners
- Components: AiWatchersPanel → ProcessRunnersPanel

Generic names (unchanged):
- ProcessMonitorAdapter, TmuxSessionManagerAdapter
- ProcessHandle, ProcessEvent, ProcessConfig
- LogEntry, TmuxSession

VERIFICATION:
- TypeScript compilation successful
- Dev server runs without errors
- All 83+ references updated
- All 11 renderer files updated
- All IPC contracts updated

This rename clarifies that process-runners is a general-purpose domain
for executing long-running background tasks (AI, builds, tests, CI/CD),
not just for watching AI operations.

🤖 Generated with Claude Code
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Summary Table

| Phase | Task | Duration | Files | Risk |
|-------|------|----------|-------|------|
| A | Backend (rename dir, service, layer) | 30 min | 3 | Low |
| B | Shared (schemas, IPC contracts) | 20 min | 3 | Low |
| C | Frontend (components, atoms, hooks) | 45 min | 11 | Low |
| D | IPC Integration (handlers, client) | 20 min | 3 | Low |
| E | Verification & Commit | 15 min | - | Low |
| **TOTAL** | | **2 hours** | **20 files** | **Low** |

---

## Files to Change (Complete List)

### Main Process (7 files)
- [ ] `src/main/process-runners/` (directory rename)
- [ ] `src/main/process-runners/services/process-runner-service.ts`
- [ ] `src/main/process-runners/index.ts`
- [ ] `src/main/index.ts`
- [ ] `src/main/ipc/process-runner-handlers.ts` (renamed)
- [ ] `src/main/ipc/error-mapper.ts` (import update)
- [ ] `src/main/ipc/ipc-handler-setup.ts` (if needed)

### Shared (3 files)
- [ ] `src/shared/schemas/process-runners/` (directory rename)
- [ ] `src/shared/schemas/process-runners/index.ts`
- [ ] `src/shared/ipc-contracts.ts`

### Frontend (11 files)
- [ ] `src/renderer/components/process-runners/` (directory rename)
- [ ] `src/renderer/atoms/process-runner-atoms.ts`
- [ ] `src/renderer/hooks/useProcessRunners.ts`
- [ ] `src/renderer/hooks/useProcessRunnerLauncher.ts`
- [ ] `src/renderer/components/process-runners/WatchersPanel.tsx`
- [ ] `src/renderer/components/process-runners/WatcherStatusLED.tsx`
- [ ] `src/renderer/components/process-runners/IssuesModal.tsx`
- [ ] `src/renderer/components/dev/ProcessRunnerDevPanel.tsx`
- [ ] `src/renderer/lib/ipc-client.ts`
- [ ] `src/renderer/App.tsx`
- [ ] `src/renderer/screens/main.tsx`

---

## Rollback Plan (If Needed)

If any step fails:
```bash
git reset --hard HEAD~1
# Reverts to pre-rename state
```

---

## Risk Mitigation

**Low Risk Because:**
- ✅ Pure rename (no logic changes)
- ✅ Generic types stay same (ProcessConfig, ProcessHandle, etc.)
- ✅ Port contracts stay same (ProcessMonitorPort, SessionManagerPort)
- ✅ Error types stay same
- ✅ Full compilation verification
- ✅ Can easily revert with git

**Testing:**
- ✅ Compile
- ✅ Dev server start
- ✅ Feature test
- ✅ Console check

---

## Ready to Proceed?

Ready to start Phase A, or would you like any adjustments to the plan?
