# Rename ai-runners → process-runners: Multi-Step Plan

## Overview

Renaming `ai-runners` → `process-runners` affects:
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
mv src/main/ai-runners src/main/process-runners
```

**Files affected in src/main/process-runners/:**
- `ports.ts` (NO CHANGES - port names stay generic)
- `schemas.ts` (NO CHANGES - data structures stay generic)
- `errors.ts` (NO CHANGES - error names stay generic)
- `services/ai-runner-service.ts` → `services/process-runner-service.ts`
- `index.ts` (UPDATE exports)
- `adapters/` (NO CHANGES - adapter names stay generic)

### A2: Rename Service File
```bash
mv src/main/process-runners/services/ai-runner-service.ts \
   src/main/process-runners/services/process-runner-service.ts
```

### A3: Update src/main/process-runners/services/process-runner-service.ts

**Change class name:**
```typescript
// BEFORE
export class AiRunnerService extends Effect.Service<AiRunnerService>()(
  'AiRunnerService',
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
interface AiRunnerPort {
  create(config: AiRunnerConfig): Effect.Effect<AiRunner, AiRunnerCreateError>
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
import type { AiRunnerPort } from '../ports'
import { AiRunner, AiRunnerConfig } from '../schemas'

// AFTER
import type { ProcessRunnerPort } from '../ports'
import { ProcessRunner, ProcessRunnerConfig } from '../schemas'
```

### A4: Update src/main/process-runners/index.ts
```typescript
// BEFORE
import { AiRunnerService } from './services'
export { AiRunnerService }
export const AiRunnersLayer = Layer.mergeAll(
  RunnerAdaptersLayer,
  AiRunnerService.Default
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
- `AiRunnersLayer` → `ProcessRunnersLayer`
- `RunnerAdaptersLayer` → `RunnerAdaptersLayer`
- `NodeProcessMonitorAdapter` stays same (generic)
- `TmuxSessionManagerAdapter` stays same (generic)

### A5: Update src/main/index.ts
```typescript
// BEFORE
import { AiRunnersLayer } from './ai-runners'
// ...
const MainLayer = Layer.mergeAll(
  AiRunnersLayer,
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
mv src/shared/schemas/ai-runners src/shared/schemas/process-runners
```

**Files in this directory:**
- `index.ts` - Re-exports all types
- `errors.ts` - Error definitions (NO NAME CHANGES - generic)

### B2: Update src/shared/schemas/process-runners/index.ts
```typescript
// BEFORE
export class AiRunner extends S.Class<AiRunner>('AiRunner') { ... }
export class AiRunnerConfig extends S.Class<AiRunnerConfig>('AiRunnerConfig') { ... }
export class AiRunnerStatus extends S.Class<AiRunnerStatus>('AiRunnerStatus') { ... }
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
- `AiRunner` → `ProcessRunner`
- `AiRunnerConfig` → `ProcessRunnerConfig`
- `AiRunnerStatus` → `ProcessRunnerStatus`
- Keep: `LogEntry`, `TmuxSession`, `ProcessHandle`, `ProcessEvent`, `ProcessConfig`

### B3: Update src/shared/schemas/process-runners/errors.ts
**No changes needed - error names are generic:**
- `ProcessError` ✅ (stays same)
- `RunnerNotFoundError` ✅ (stays same, refers to process runner)
- `RunnerOperationError` ✅ (stays same)
- `TmuxError` ✅ (stays same)

### B4: Update src/shared/ipc-contracts.ts

**Import statement:**
```typescript
// BEFORE
import {
  AiRunner,
  AiRunnerConfig,
  LogEntry,
  TmuxSession,
} from './schemas/ai-runners'

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
export const AiRunnerIpcContracts = {
  'ai-runner:create': { ... },
  'ai-runner:list': { ... },
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
- `'ai-runner:create'` → `'process-runner:create'`
- `'ai-runner:attach-tmux'` → `'process-runner:attach-tmux'`
- `'ai-runner:list'` → `'process-runner:list'`
- `'ai-runner:get'` → `'process-runner:get'`
- `'ai-runner:stop'` → `'process-runner:stop'`
- `'ai-runner:start'` → `'process-runner:start'`
- `'ai-runner:get-logs'` → `'process-runner:get-logs'`
- `'ai-runner:list-tmux'` → `'process-runner:list-tmux'`
- `'ai-runner:switch-tmux'` → `'process-runner:switch-tmux'`
- `'ai-runner:get-output'` → `'process-runner:get-output'`

**Update output types:**
```typescript
// BEFORE
output: AiRunner,
output: S.Array(AiRunner),

// AFTER
output: ProcessRunner,
output: S.Array(ProcessRunner),
```

**Update input types:**
```typescript
// BEFORE
input: AiRunnerConfig,

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
// Wherever AiRunnerIpcContracts is referenced:
// Change to ProcessRunnerIpcContracts
```

---

## PHASE C: Frontend Update

### C1: Rename Components Directory
```bash
mv src/renderer/components/ai-runners src/renderer/components/process-runners
```

**Files:**
- `RunnersPanel.tsx`
- `RunnerStatusLED.tsx`
- `IssuesModal.tsx`

### C2: Rename Atoms File
```bash
mv src/renderer/atoms/ai-runner-atoms.ts \
   src/renderer/atoms/process-runner-atoms.ts
```

### C3: Rename Hooks Files
```bash
mv src/renderer/hooks/useAiRunners.ts \
   src/renderer/hooks/useProcessRunners.ts

mv src/renderer/hooks/useAiRunnerLauncher.ts \
   src/renderer/hooks/useProcessRunnerLauncher.ts
```

### C4: Update src/renderer/atoms/process-runner-atoms.ts

**Rename atom constants:**
```typescript
// BEFORE
export const aiRunnersAtom = Atom.make(...)
export const aiRunnerByIdAtom = Atom.family(...)
export const aiRunnerLogsAtom = Atom.family(...)
export const aiRunnerStatusAtom = Atom.family(...)

// AFTER
export const processRunnersAtom = Atom.make(...)
export const processRunnerByIdAtom = Atom.family(...)
export const processRunnerLogsAtom = Atom.family(...)
export const processRunnerStatusAtom = Atom.family(...)
```

**Update IPC contract reference:**
```typescript
// BEFORE
import { AiRunnerIpcContracts } from '../../shared/ipc-contracts'

// AFTER
import { ProcessRunnerIpcContracts } from '../../shared/ipc-contracts'
```

**Update channel references:**
```typescript
// All references to AiRunnerIpcContracts.* become ProcessRunnerIpcContracts.*
```

### C5: Update src/renderer/hooks/useProcessRunners.ts

**Update hook names:**
```typescript
// BEFORE
export function useAiRunners() { ... }
export const aiRunnersQuery = { ... }
export const aiRunnerQuery = { ... }

// AFTER
export function useProcessRunners() { ... }
export const processRunnersQuery = { ... }
export const processRunnerQuery = { ... }
```

**Update imports:**
```typescript
// BEFORE
import { aiRunnersAtom, aiRunnerByIdAtom } from '../atoms/ai-runner-atoms'

// AFTER
import { processRunnersAtom, processRunnerByIdAtom } from '../atoms/process-runner-atoms'
```

### C6: Update src/renderer/hooks/useProcessRunnerLauncher.ts

**Update hook names:**
```typescript
// BEFORE
export function useAiRunnerLauncher() { ... }

// AFTER
export function useProcessRunnerLauncher() { ... }
```

**Update service references:**
```typescript
// Update any AiRunner references to ProcessRunner
```

### C7: Update Component Files

**src/renderer/components/process-runners/RunnersPanel.tsx:**
```typescript
// BEFORE
import { useAiRunners } from '../../hooks/useAiRunners'
export function AiRunnersPanel() { ... }

// AFTER
import { useProcessRunners } from '../../hooks/useProcessRunners'
export function ProcessRunnersPanel() { ... }
```

**src/renderer/components/process-runners/RunnerStatusLED.tsx:**
```typescript
// BEFORE
export function AiRunnerStatusLED(props: { runnerId: string }) { ... }

// AFTER
export function ProcessRunnerStatusLED(props: { runnerId: string }) { ... }
```

**Update any internal references to `runnerId` → `runnerId`** (optional, for consistency)

**src/renderer/components/process-runners/IssuesModal.tsx:**
```typescript
// Update imports and any runner references to runner
```

### C8: Update Dev Component
**src/renderer/components/dev/AiRunnerDevPanel.tsx:**

Rename and update:
```typescript
// BEFORE
export function AiRunnerDevPanel() { ... }

// AFTER
export function ProcessRunnerDevPanel() { ... }
```

### C9: Update Component Imports in App.tsx

```typescript
// BEFORE
import { AiRunnersPanel } from './components/ai-runners/RunnersPanel'
import { AiRunnerStatusLED } from './components/ai-runners/RunnerStatusLED'

// AFTER
import { ProcessRunnersPanel } from './components/process-runners/RunnersPanel'
import { ProcessRunnerStatusLED } from './components/process-runners/RunnerStatusLED'
```

**Update render calls:**
```typescript
// BEFORE
<AiRunnersPanel />
<AiRunnerStatusLED runnerId={...} />

// AFTER
<ProcessRunnersPanel />
<ProcessRunnerStatusLED runnerId={...} />
```

### C10: Update main.tsx
```typescript
// BEFORE
import { RunnersPanel } from '../components/ai-runners/RunnersPanel'

// AFTER
import { RunnersPanel } from '../components/process-runners/RunnersPanel'
```

### C11: Update RepositoryDropdown.tsx
```typescript
// Find and update any runner references
// If it references AiRunner types, update to ProcessRunner
```

---

## PHASE D: IPC Integration

### D1: Update src/main/ipc/ai-runner-handlers.ts

**Rename file:**
```bash
mv src/main/ipc/ai-runner-handlers.ts \
   src/main/ipc/process-runner-handlers.ts
```

**Update function name:**
```typescript
// BEFORE
export const setupAiRunnerIpcHandlers = Effect.gen(function* () {
  const aiRunnerService = yield* AiRunnerService

// AFTER
export const setupProcessRunnerIpcHandlers = Effect.gen(function* () {
  const processRunnerService = yield* ProcessRunnerService
```

**Update contract references:**
```typescript
// BEFORE
registerIpcHandler(AiRunnerIpcContracts['ai-runner:create'], ...)

// AFTER
registerIpcHandler(ProcessRunnerIpcContracts['process-runner:create'], ...)
```

**Update all handler registrations** (10+ handlers):
- All channel names change
- Service method calls might have different names depending on the service

### D2: Update src/main/index.ts (IPC Setup)

```typescript
// BEFORE
import { setupAiRunnerIpcHandlers } from './ipc/ai-runner-handlers'

app.whenReady().then(async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      yield* setupAiRunnerIpcHandlers
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
export class AiRunnerClient extends Effect.Service<AiRunnerClient>()('AiRunnerClient', ...)

// AFTER
export class ProcessRunnerClient extends Effect.Service<ProcessRunnerClient>()('ProcessRunnerClient', ...)
```

**Update method names:**
```typescript
// BEFORE
readonly createRunner = (config: AiRunnerConfig) => ...
readonly listRunners = () => ...
readonly getRunner = (runnerId: string) => ...

// AFTER
readonly createRunner = (config: ProcessRunnerConfig) => ...
readonly listRunners = () => ...
readonly getRunner = (runnerId: string) => ...
```

**Update channel references:**
```typescript
// BEFORE
invoke('ai-runner:create', config)

// AFTER
invoke('process-runner:create', config)
```

### D4: Update src/main/ipc/error-mapper.ts

**No major changes needed** - error types are generic
- May need to update import path if schemas moved:
```typescript
// BEFORE
import { RunnerNotFoundError } from '../ai-runners/errors'

// AFTER
import { RunnerNotFoundError } from '../process-runners/errors'
```

### D5: Update src/main/ipc/ipc-handler-setup.ts

**Check if any direct references exist:**
```bash
grep -n "ai-runner\|AiRunner" src/main/ipc/ipc-handler-setup.ts
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
# Check DevTools console for no AiRunner/ai-runner references
```

### E3: Feature Testing
1. Open repository dropdown
2. Check runner/runner LED shows
3. Start a process runner (simulate AI runner)
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
git commit -m "refactor: rename ai-runners → process-runners for clarity

CHANGES:
- Rename src/main/ai-runners → src/main/process-runners
- Rename src/shared/schemas/ai-runners → src/shared/schemas/process-runners
- Rename src/renderer/components/ai-runners → src/renderer/components/process-runners

UPDATES:
Main Process:
- AiRunnerService → ProcessRunnerService
- AiRunnersLayer → ProcessRunnersLayer

IPC:
- AiRunnerIpcContracts → ProcessRunnerIpcContracts
- Channel names: 'ai-runner:*' → 'process-runner:*'
- ai-runner-handlers → process-runner-handlers
- AiRunnerClient → ProcessRunnerClient

Schemas:
- AiRunner → ProcessRunner
- AiRunnerConfig → ProcessRunnerConfig
- AiRunnerStatus → ProcessRunnerStatus

Frontend:
- Atoms: aiRunnersAtom → processRunnersAtom
- Hooks: useAiRunners → useProcessRunners
- Components: AiRunnersPanel → ProcessRunnersPanel

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
- [ ] `src/renderer/components/process-runners/RunnersPanel.tsx`
- [ ] `src/renderer/components/process-runners/RunnerStatusLED.tsx`
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
