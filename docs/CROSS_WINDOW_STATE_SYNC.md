# Cross-Window State Synchronization

**Date:** 2025-10-26
**Purpose:** Centralized pattern for keeping state synchronized across multiple Electron renderer windows

---

## Problem

Electron applications with multiple `BrowserWindow` instances have isolated renderer processes. Each window has its own JavaScript context, meaning atom state and React state are **NOT shared** between windows.

### The Issue

When state changes in one window:
1. ✅ Backend (main process) updates the stored state
2. ✅ The window that triggered the change updates its atom cache
3. ❌ Other windows have stale atom caches
4. ❌ UI in other windows shows outdated data

### Example Scenario

```
User signs in via console window
  ↓
Backend creates account and saves to disk ✅
  ↓
Console window's accountContextAtom refreshes ✅
  ↓
Main window's accountContextAtom stays stale ❌
  ↓
Main window still shows "Sign In" button ❌
```

---

## Solution: Centralized BroadcastService

Use a centralized service to broadcast state changes from the main process to **all renderer windows**, triggering atom refreshes in each.

```
Service modifies state
  ↓
Save to disk (electron-store)
  ↓
BroadcastService.broadcast('event-name')
  ↓
All renderer windows receive IPC event
  ↓
Each window refreshes relevant atoms
  ↓
All UIs update in sync ✅
```

---

## Architecture

### Main Process (src/main/)

#### 1. BroadcastService

Central service for broadcasting state changes to all windows.

**File:** `src/main/broadcast/broadcast-service.ts`

```typescript
import { Effect } from 'effect'
import { BrowserWindow } from 'electron'

export type StateChangeEvent =
  | 'accounts:changed'        // Account context modified
  | 'ai:usage:changed'        // AI usage data updated
  | 'workspace:changed'       // Workspace path changed
  | 'repositories:changed'    // Repository cache updated

export class BroadcastService extends Effect.Service<BroadcastService>()(
  'BroadcastService',
  {
    sync: () => ({
      broadcast: <T = void>(event: StateChangeEvent, payload?: T) =>
        Effect.sync(() => {
          const eventChannel = `state:${event}`
          console.log(`[BroadcastService] Broadcasting ${eventChannel}`)

          // Send to all windows
          BrowserWindow.getAllWindows().forEach(window => {
            if (!window.isDestroyed()) {
              window.webContents.send(eventChannel, payload)
            }
          })
        }),
    }),
  }
) {}
```

**Key Points:**
- Single source of truth for event types
- Broadcasts to ALL windows via `BrowserWindow.getAllWindows()`
- Event channel format: `state:{event-name}`
- Ignores destroyed windows

#### 2. Service Integration

Services that modify state must broadcast changes.

**Example:** `src/main/account/account-context-service.ts`

```typescript
export class AccountContextService extends Effect.Service<AccountContextService>()(
  'AccountContextService',
  {
    dependencies: [TierService.Default, BroadcastService.Default],
    effect: Effect.gen(function* () {
      const tierService = yield* TierService
      const broadcastService = yield* BroadcastService

      return {
        addAccount: (params) =>
          Effect.gen(function* () {
            // ... create account logic
            saveContext(updatedContext)

            // Broadcast to all windows
            yield* broadcastService.broadcast('accounts:changed')

            return account
          }),

        removeAccount: (accountId) =>
          Effect.gen(function* () {
            // ... remove account logic
            saveContext(updatedContext)

            // Broadcast to all windows
            yield* broadcastService.broadcast('accounts:changed')
          }),
      }
    }),
  }
) {}
```

**Best Practice:** Broadcast AFTER saving to disk, ensuring consistency.

#### 3. MainLayer Integration

Add `BroadcastService` to the application's main layer.

**File:** `src/main/index.ts`

```typescript
import { BroadcastService } from './broadcast/broadcast-service'

const MainLayer = Layer.mergeAll(
  // ... other services
  BroadcastService.Default,  // Enable cross-window broadcasting
  // ... more services
)
```

---

### Renderer Process (src/renderer/)

#### 1. Cross-Window Sync Hook

Centralized hook for listening to state changes and refreshing atoms.

**File:** `src/renderer/hooks/useCrossWindowSync.ts`

```typescript
import { useEffect } from 'react'
import { useAtomRefresh } from '@effect-atom/atom-react'
import { accountContextAtom } from '../atoms/account-atoms'
import { selectAiProviderUsageAtom } from '../atoms/ai-provider-atoms'
import { providerAccountsAtom, providerRepositoriesAtom } from '../atoms/provider-atoms'

export function useCrossWindowSync() {
  const refreshAccountContext = useAtomRefresh(accountContextAtom)
  const refreshAiUsage = useAtomRefresh(selectAiProviderUsageAtom('openai'))
  const refreshClaudeUsage = useAtomRefresh(selectAiProviderUsageAtom('claude'))

  // Refresh provider-level atoms which cascade to account-specific atoms
  const refreshGitHubAccounts = useAtomRefresh(providerAccountsAtom('github'))
  const refreshGitHubRepos = useAtomRefresh(providerRepositoriesAtom('github'))

  useEffect(() => {
    const handleAccountsChanged = () => {
      // Refresh all account-related atoms
      refreshAccountContext()
      refreshGitHubAccounts()
      refreshGitHubRepos()
    }

    const handleAiUsageChanged = () => {
      refreshAiUsage()
      refreshClaudeUsage()
    }

    // Subscribe to events
    window.electron.ipcRenderer.on('state:accounts:changed', handleAccountsChanged)
    window.electron.ipcRenderer.on('state:ai:usage:changed', handleAiUsageChanged)

    // Cleanup
    return () => {
      window.electron.ipcRenderer.removeListener('state:accounts:changed', handleAccountsChanged)
      window.electron.ipcRenderer.removeListener('state:ai:usage:changed', handleAiUsageChanged)
    }
  }, [
    refreshAccountContext,
    refreshAiUsage,
    refreshClaudeUsage,
    refreshGitHubAccounts,
    refreshGitHubRepos,
  ])
}
```

**Key Points:**
- One hook to handle all cross-window sync
- Maps events to atom refreshes
- Refreshes provider-level atoms (accounts, repos) which cascade to account-specific atoms
- Proper cleanup on unmount

#### 2. Usage in Components

Call the hook once per window, typically in the root screen component.

**Example:** `src/renderer/screens/main.tsx`

```typescript
import { useCrossWindowSync } from '../hooks/useCrossWindowSync'

export function MainScreen() {
  // Enable cross-window state synchronization
  useCrossWindowSync()

  // ... rest of component
}
```

**Best Practice:** Call at the root of each window's component tree (not in every component).

---

## Adding a New Synchronized State

### Step 1: Define Event Type

**File:** `src/main/broadcast/broadcast-service.ts`

```typescript
export type StateChangeEvent =
  | 'accounts:changed'
  | 'ai:usage:changed'
  | 'workspace:changed'
  | 'repositories:changed'
  | 'your-new-event'  // ← Add here
```

### Step 2: Broadcast from Service

**File:** `src/main/your-domain/your-service.ts`

```typescript
export class YourService extends Effect.Service<YourService>()(
  'YourService',
  {
    dependencies: [BroadcastService.Default],
    effect: Effect.gen(function* () {
      const broadcastService = yield* BroadcastService

      return {
        modifyState: () =>
          Effect.gen(function* () {
            // ... modify state
            saveState()

            // Broadcast to all windows
            yield* broadcastService.broadcast('your-new-event')
          }),
      }
    }),
  }
) {}
```

### Step 3: Add Listener in Hook

**File:** `src/renderer/hooks/useCrossWindowSync.ts`

```typescript
export function useCrossWindowSync() {
  // ... existing refreshes
  const refreshYourAtom = useAtomRefresh(yourAtom)

  useEffect(() => {
    // ... existing handlers

    const handleYourEvent = () => {
      console.log('[useCrossWindowSync] Received your-new-event, refreshing...')
      refreshYourAtom()
    }

    // ... existing subscriptions
    window.electron.ipcRenderer.on('state:your-new-event', handleYourEvent)

    return () => {
      // ... existing cleanup
      window.electron.ipcRenderer.removeListener('state:your-new-event', handleYourEvent)
    }
  }, [/* ... */, refreshYourAtom])
}
```

---

## Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ User Action (e.g., Sign In)                                     │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│ Renderer Window 1 (Console)                                     │
├─────────────────────────────────────────────────────────────────┤
│ 1. User clicks "Sign In"                                        │
│ 2. providerSignInAtom executes                                  │
│ 3. IPC call to main process                                     │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│ Main Process                                                     │
├─────────────────────────────────────────────────────────────────┤
│ 1. AccountContextService.addAccount()                           │
│ 2. Save account to disk (electron-store)                        │
│ 3. broadcastService.broadcast('accounts:changed')               │
│    ↓                                                             │
│    BroadcastService sends 'state:accounts:changed' to ALL       │
│    windows via webContents.send()                               │
└───────┬─────────────────────────────────┬───────────────────────┘
        │                                 │
        ↓                                 ↓
┌──────────────────────┐      ┌──────────────────────┐
│ Renderer Window 1    │      │ Renderer Window 2    │
│ (Console)            │      │ (Main)               │
├──────────────────────┤      ├──────────────────────┤
│ 1. Receives event    │      │ 1. Receives event    │
│ 2. handleAccountsChanged│   │ 2. handleAccountsChanged│
│ 3. refreshAccountContext()│ │ 3. refreshAccountContext()│
│ 4. accountContextAtom │    │ 4. accountContextAtom │
│    refetches         │      │    refetches         │
│ 5. UI updates ✅     │      │ 5. UI updates ✅     │
└──────────────────────┘      └──────────────────────┘
```

---

## Best Practices

### ✅ DO

1. **Broadcast AFTER persisting** - Ensure disk write completes before broadcasting
2. **Use specific event names** - `accounts:changed` not `data:changed`
3. **Centralize in one hook** - `useCrossWindowSync()` handles all events
4. **Log events** - Aid debugging cross-window issues
5. **Clean up listeners** - Return cleanup function in useEffect

### ❌ DON'T

1. **Don't broadcast before saving** - Windows might refetch old data
2. **Don't use generic events** - Hard to trace what changed
3. **Don't scatter listeners** - Centralize in useCrossWindowSync
4. **Don't forget cleanup** - Memory leaks in long-running windows
5. **Don't send large payloads** - IPC has size limits; refresh atoms instead

---

## Debugging

### Main Process Logs

```
[BroadcastService] Broadcasting state:accounts:changed
[AccountContextService] Account added: github:7737624
```

### Renderer Process Logs

```
[useCrossWindowSync] Received accounts:changed event, refreshing atoms...
[accountContextAtom] Fetching account context...
[accountContextAtom] Account context fetched: {totalAccounts: 1, ...}
[useProviderAuth] Hook state: {accountsCount: 1, activeAccountId: 'github:7737624'}
```

### Troubleshooting

**Problem:** Window not updating after state change

1. Check main process broadcasts event:
   ```
   [BroadcastService] Broadcasting state:accounts:changed
   ```

2. Check renderer receives event:
   ```
   [useCrossWindowSync] Received accounts:changed event
   ```

3. Check atom refreshes:
   ```
   [accountContextAtom] Fetching account context...
   ```

4. If no event received, check `useCrossWindowSync()` is called in that window

**Problem:** Event fires but atom doesn't refresh

- Verify atom is listed in `useCrossWindowSync` dependencies array
- Check `useAtomRefresh` is called for the correct atom

---

## Related Documentation

- **Effect Services**: See `docs/effect_ports_migration_guide.md`
- **Atom Architecture**: See `docs/RESULT_API_AND_ERROR_HANDLING.md`
- **VCS Provider Lifecycle**: See `docs/VCS_PROVIDER_LIFECYCLE.md`

---

**Author:** AI Assistant
**Date:** 2025-10-26
**Purpose:** Developer guide for cross-window state synchronization
