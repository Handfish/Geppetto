# Cross-Window State Synchronization

## Problem

Electron applications with multiple `BrowserWindow` instances have isolated renderer processes. Each window has its own JavaScript context, meaning atom state and React state are **NOT shared** between windows.

When a user updates state in one window (e.g., workspace path, auth state), other windows don't automatically see the change.

## Solution: IPC Event Broadcasting

Use Electron's IPC events to broadcast state changes to all windows, then have each window refresh its atom state.

### Pattern

#### 1. Broadcast from Main Process

When state changes, notify all windows:

```typescript
// src/main/ipc/workspace-handlers.ts
import { BrowserWindow } from 'electron'

const broadcastWorkspaceChange = () => {
  BrowserWindow.getAllWindows().forEach(window => {
    window.webContents.send('workspace:changed')
  })
}

setupHandler('setWorkspacePath', input =>
  Effect.gen(function* () {
    yield* workspaceService.setWorkspacePath(input.path)
    broadcastWorkspaceChange() // Notify all windows
  })
)
```

#### 2. Listen in Renderer

Each component subscribes to the broadcast event and refreshes its atoms:

```typescript
// src/renderer/components/WorkspaceSelector.tsx
import { useAtomRefresh } from '@effect-atom/atom-react'
import { workspaceConfigAtom } from '../atoms/workspace-atoms'

export function WorkspaceSelector() {
  const refreshConfig = useAtomRefresh(workspaceConfigAtom)

  React.useEffect(() => {
    const handleWorkspaceChange = () => {
      refreshConfig() // Refetch from main process
    }

    window.electron.ipcRenderer.on('workspace:changed', handleWorkspaceChange)

    return () => {
      window.electron.ipcRenderer.removeListener('workspace:changed', handleWorkspaceChange)
    }
  }, [refreshConfig])

  // ... rest of component
}
```

#### 3. Keep Atoms Alive

Ensure atoms stay active to receive invalidations:

```typescript
// src/renderer/atoms/workspace-atoms.ts
export const workspaceConfigAtom = workspaceRuntime
  .atom(Effect.gen(/* ... */))
  .pipe(
    Atom.withReactivity(['workspace:config']),
    Atom.setIdleTTL(Duration.minutes(5)),
    Atom.keepAlive // CRITICAL: keeps atom mounted
  )
```

## When to Use This Pattern

Use IPC broadcasting when:
- ✅ You have multiple Electron windows
- ✅ State needs to stay synchronized across windows
- ✅ State is stored in the main process (electron-store, etc.)

Examples:
- **Workspace path changes** (one window changes, all windows need to update)
- **Authentication changes** (sign in/out should reflect everywhere)
- **Settings/preferences updates**
- **Account switching**

## Event Naming Convention

Use namespaced event names to avoid conflicts:

```typescript
'workspace:changed'
'auth:signed-in'
'auth:signed-out'
'account:switched'
'settings:updated'
```

## Complete Flow

```
┌─────────────┐                  ┌─────────────┐
│  Window A   │                  │  Window B   │
│  (Renderer) │                  │  (Renderer) │
└──────┬──────┘                  └──────┬──────┘
       │ 1. User action                 │
       │ (click button)                 │
       │                                │
       │ 2. Call atom action            │
       │    (selectDirectory)           │
       ▼                                │
┌─────────────────────────────────────┐│
│       Main Process (IPC)            ││
├─────────────────────────────────────┤│
│ 3. Update electron-store            ││
│ 4. Broadcast event to ALL windows   ││
└──────┬────────────────────┬─────────┘│
       │                    │          │
       │ workspace:changed  │ workspace:changed
       ▼                    ▼          │
┌──────────────┐      ┌──────────────┐│
│   Window A   │      │   Window B   ││
│ (Renderer)   │      │ (Renderer)   ││
├──────────────┤      ├──────────────┤│
│ 5. Refresh   │      │ 5. Refresh   ││
│    atom      │      │    atom      ││
│ 6. Re-render │      │ 6. Re-render ││
│    with new  │      │    with new  ││
│    data      │      │    data      ││
└──────────────┘      └──────────────┘│
                                       ▼
                              Both windows now
                              show updated state
```

## Alternatives (Not Recommended)

❌ **Polling**: Inefficient, adds latency, wastes resources
❌ **Shared atom state**: Not possible across renderer processes
❌ **Manual window management**: Error-prone, hard to maintain

## Related Files

- Event listener pattern: `src/renderer/components/WorkspaceSelector.tsx`
- Broadcast pattern: `src/main/ipc/workspace-handlers.ts`
- Atom configuration: `src/renderer/atoms/workspace-atoms.ts`
