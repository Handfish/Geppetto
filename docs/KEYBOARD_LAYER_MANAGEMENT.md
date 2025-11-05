# Keyboard Layer Management System

**Status**: ✅ Implemented
**Version**: 1.0.0
**Date**: 2025-10-31

## Overview

The Keyboard Layer Management System provides centralized coordination of global keyboard shortcuts between Electron's main process and the React renderer process. It solves the problem of keyboard event conflicts when multiple UI layers (carousel, dropdowns, modals) are active simultaneously.

## Problem Statement

### The Issue

Electron applications can register global shortcuts in the main process that intercept keys **before** they reach the renderer process:

```typescript
// Main process
globalShortcut.register('Left', () => {
  mainWindow.webContents.send('carousel:prev')  // Always fires!
})
```

**Problems**:
1. Global shortcuts fire regardless of renderer UI state
2. Modal opens → user presses Left/Right → carousel navigates (wrong!)
3. No way for renderer to tell main process "I'm handling this key now"
4. Renderer-side `event.stopPropagation()` doesn't help (event never reaches renderer)

### The Solution

**Centralized Layer Stack Pattern**:
- Renderer components declare their keyboard layer needs via `useKeyboardLayer` hook
- Main process maintains a layer stack and adjusts global shortcuts accordingly
- Top of stack determines which shortcuts are active

## Architecture

### Layer Priority (Highest to Lowest)

1. **modal** - Full keyboard control
   - Blocks: Carousel shortcuts (Left/Right arrows)
   - Use for: Full-screen modals, dialogs

2. **dropdown** - Partial keyboard control
   - Blocks: Carousel shortcuts (Left/Right arrows)
   - Use for: Dropdown menus, context menus

3. **carousel** - Default layer
   - Active: Left/Right arrow global shortcuts for carousel navigation
   - Use for: Base application state

### Component Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Renderer Process                         │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ IssuesModal                                          │  │
│  │ ┌────────────────────────────────────────────────┐  │  │
│  │ │ useKeyboardLayer('modal', isOpen)              │  │  │
│  │ │ - Pushes 'modal' layer on mount                │  │  │
│  │ │ - Pops 'modal' layer on unmount                │  │  │
│  │ │                                                  │  │  │
│  │ │ Effect → IPC → Main Process                    │  │  │
│  │ └────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ RepositoryDropdown                                   │  │
│  │ ┌────────────────────────────────────────────────┐  │  │
│  │ │ useKeyboardLayer('dropdown', isOpen)           │  │  │
│  │ └────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ IPC: keyboard-layer:push/pop
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      Main Process                            │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ KeyboardLayerManager                                 │  │
│  │ ┌────────────────────────────────────────────────┐  │  │
│  │ │ layerStack: Ref<KeyboardLayer[]>               │  │  │
│  │ │                                                  │  │  │
│  │ │ Push 'modal' → Stack: [carousel, modal]        │  │  │
│  │ │ Active layer: modal                            │  │  │
│  │ │                                                  │  │  │
│  │ │ → unregisterArrowKeys()                        │  │  │
│  │ │   (Left/Right global shortcuts removed)        │  │  │
│  │ └────────────────────────────────────────────────┘  │  │
│  │                                                      │  │
│  │ Pop 'modal' → Stack: [carousel]                    │  │
│  │ Active layer: carousel                             │  │
│  │                                                      │  │
│  │ → registerArrowKeys()                              │  │
│  │   (Left/Right global shortcuts restored)           │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Guide

### 1. Renderer: Use `useKeyboardLayer` Hook

**Pattern**: Declare layer needs when component mounts/unmounts

```typescript
import { useKeyboardLayer } from '../../hooks/useKeyboardLayer'

function IssuesModal({ isOpen, onClose }) {
  // Push 'modal' layer when modal is open, pop when closed
  useKeyboardLayer('modal', isOpen)

  // Now Left/Right arrows won't trigger carousel navigation
  // Modal's keyboard handlers have full control

  return <div>...</div>
}
```

**Hook Signature**:
```typescript
function useKeyboardLayer(
  layer: 'carousel' | 'dropdown' | 'modal',
  enabled: boolean
): void
```

**Behavior**:
- When `enabled` changes from `false` → `true`: Pushes layer onto stack
- When `enabled` changes from `true` → `false`: Pops layer from stack
- Cleanup on unmount: Automatically pops layer if still enabled

### 2. Main Process: KeyboardLayerManager Service

**Service**: Effect-based service managing layer stack and shortcuts

```typescript
import { KeyboardLayerManager } from './keyboard/keyboard-layer-manager'

// Create layer with mainWindow reference
const KeyboardLayerManagerLayer = KeyboardLayerManager.Live({ mainWindow })

// Provide to IPC handlers
const MainLayerWithKeyboard = Layer.mergeAll(
  MainLayer,
  KeyboardLayerManagerLayer
)
```

**Layer Stack Logic**:
```typescript
// Push layer
layerStack: ['carousel']  →  Push 'modal'  →  ['carousel', 'modal']
activeLayer: 'modal'
→ unregisterArrowKeys() // Disable Left/Right

// Pop layer
layerStack: ['carousel', 'modal']  →  Pop 'modal'  →  ['carousel']
activeLayer: 'carousel'
→ registerArrowKeys() // Enable Left/Right
```

### 3. IPC Contracts

**Type-Safe IPC Communication**:

```typescript
// src/shared/ipc-contracts.ts
export const KeyboardLayerIpcContracts = {
  'keyboard-layer:push': {
    channel: 'keyboard-layer:push' as const,
    input: S.Struct({
      layer: S.Literal('carousel', 'dropdown', 'modal'),
    }),
    output: S.Void,
    errors: S.Never,
  },

  'keyboard-layer:pop': {
    channel: 'keyboard-layer:pop' as const,
    input: S.Struct({
      layer: S.Literal('carousel', 'dropdown', 'modal'),
    }),
    output: S.Void,
    errors: S.Never,
  },
}
```

## Usage Examples

### Example 1: Modal Component

```typescript
import { useKeyboardLayer } from '../../hooks/useKeyboardLayer'
import { useIssueModalKeyboardNavigation } from '../../hooks/useIssueModalKeyboardNavigation'

function IssuesModal({ isOpen, onClose }) {
  // 1. Push 'modal' layer (blocks carousel shortcuts)
  useKeyboardLayer('modal', isOpen)

  // 2. Handle keyboard events in renderer
  useIssueModalKeyboardNavigation({
    isOpen,
    onCycleAgentLeft: () => cycleAgent('left'),  // Left arrow
    onCycleAgentRight: () => cycleAgent('right'), // Right arrow
    onClose,
  })

  // Left/Right arrows now cycle AI agent instead of carousel!
  return <div>...</div>
}
```

**Result**:
- Modal open: `useKeyboardLayer('modal', true)` → Main process unregisters Left/Right
- User presses Left → Renderer hook handles it → Cycles AI agent
- Modal closes: `useKeyboardLayer('modal', false)` → Main process registers Left/Right
- User presses Left → Main process handles it → Carousel navigates

### Example 2: Dropdown Component

```typescript
function RepositoryDropdown({ isOpen, showIssuesModal }) {
  // Only push 'dropdown' layer when dropdown is open AND modal is closed
  useKeyboardLayer('dropdown', isOpen && !showIssuesModal)

  useDropdownKeyboardNavigation({
    isOpen,
    onNavigate: (index) => setFocusedIndex(index),
    enabled: isOpen && !showIssuesModal,
  })

  return <div>...</div>
}
```

**Nested Layer Logic**:
1. Dropdown opens → Push 'dropdown' → Stack: `['carousel', 'dropdown']`
2. Modal opens from dropdown → Push 'modal' → Stack: `['carousel', 'dropdown', 'modal']`
3. Modal closes → Pop 'modal' → Stack: `['carousel', 'dropdown']`
4. Dropdown closes → Pop 'dropdown' → Stack: `['carousel']`

### Example 3: Carousel (Default Layer)

```typescript
function RepositoryCarousel() {
  // Carousel doesn't need useKeyboardLayer - it's the default!
  // Main process starts with 'carousel' layer active

  useEffect(() => {
    window.electron.ipcRenderer.on('carousel:next', handleNext)
    window.electron.ipcRenderer.on('carousel:prev', handlePrev)

    return () => {
      window.electron.ipcRenderer.removeListener('carousel:next', handleNext)
      window.electron.ipcRenderer.removeListener('carousel:prev', handlePrev)
    }
  }, [])

  return <div>...</div>
}
```

## Key Files

### Main Process

- `src/main/keyboard/keyboard-layer-manager.ts` - Effect service managing layer stack
- `src/main/ipc/keyboard-layer-handlers.ts` - IPC handler setup
- `src/main/index.ts` - Layer integration

### Renderer Process

- `src/renderer/hooks/useKeyboardLayer.ts` - React hook for components
- `src/renderer/components/ai-runners/IssuesModal.tsx` - Modal example
- `src/renderer/components/ui/RepositoryDropdown.tsx` - Dropdown example

### Shared

- `src/shared/schemas/keyboard-layer.ts` - Type definitions
- `src/shared/ipc-contracts.ts` - IPC contracts (KeyboardLayerIpcContracts)

## Benefits

### 1. Centralized Control

- **Single source of truth**: Main process owns global shortcut state
- **No duplication**: Don't repeat shortcut logic across components
- **Easy debugging**: Console logs show layer stack changes

### 2. Reusable Pattern

- **One hook**: `useKeyboardLayer(layer, enabled)` - works everywhere
- **Declarative**: Components declare "I need this layer" vs imperative shortcut management
- **Composable**: Layers stack naturally (modal on top of dropdown on top of carousel)

### 3. Type Safety

- **Effect Schema validation**: IPC contracts ensure type safety across process boundary
- **TypeScript types**: Full type inference in renderer hooks
- **Runtime safety**: Invalid layer names rejected at compile time

### 4. Correct Behavior

- **No event conflicts**: Only one layer handles keys at a time
- **Proper cleanup**: useEffect ensures layers are popped on unmount
- **Window focus integration**: All shortcuts disabled when window unfocuses

## Best Practices

### DO ✅

1. **Always use `useKeyboardLayer` for UI that captures keyboard input**
   ```typescript
   useKeyboardLayer('modal', isModalOpen)
   ```

2. **Pass `isOpen` state as the enabled parameter**
   ```typescript
   useKeyboardLayer('dropdown', isDropdownOpen)
   ```

3. **Use conditional logic for nested layers**
   ```typescript
   useKeyboardLayer('dropdown', isDropdownOpen && !isModalOpen)
   ```

4. **Check console logs to verify layer stack**
   ```
   [KeyboardLayerManager] Push 'modal' → Active: 'modal', Stack: [carousel, modal]
   [KeyboardLayerManager] ✗ Arrow keys unregistered (modal layer active)
   ```

### DON'T ❌

1. **Don't register global shortcuts manually**
   ```typescript
   // ❌ BAD: Bypasses layer management
   globalShortcut.register('Left', handleLeft)

   // ✅ GOOD: Use layer system
   useKeyboardLayer('modal', isOpen)
   ```

2. **Don't push the same layer multiple times**
   ```typescript
   // ❌ BAD: Duplicate pushes
   useKeyboardLayer('modal', true)
   useKeyboardLayer('modal', true)

   // ✅ GOOD: Single push per component
   useKeyboardLayer('modal', isOpen)
   ```

3. **Don't forget to tie `enabled` to open state**
   ```typescript
   // ❌ BAD: Always enabled
   useKeyboardLayer('modal', true)

   // ✅ GOOD: Tied to modal state
   useKeyboardLayer('modal', isModalOpen)
   ```

## Troubleshooting

### Issue: Arrow keys not working in modal

**Symptom**: Modal open, Left/Right arrows still trigger carousel

**Fix**: Ensure `useKeyboardLayer('modal', isOpen)` is called:
```typescript
function IssuesModal({ isOpen }) {
  useKeyboardLayer('modal', isOpen) // Add this!

  return <div>...</div>
}
```

### Issue: Arrow keys not working after modal closes

**Symptom**: Modal closes, Left/Right arrows don't navigate carousel

**Fix**: Check console for layer stack errors. Layer should pop when modal closes:
```
[KeyboardLayerManager] Pop 'modal' → Active: 'carousel', Stack: [carousel]
[KeyboardLayerManager] ✓ Arrow keys registered (carousel layer active)
```

If not popping, ensure `enabled` parameter is tied to `isOpen`:
```typescript
useKeyboardLayer('modal', isOpen) // enabled changes with isOpen
```

### Issue: Multiple components pushing same layer

**Symptom**: Layer stack has duplicates: `[carousel, modal, modal]`

**Fix**: Each component instance should push only once. Use conditional logic for nested components:
```typescript
// Parent dropdown
useKeyboardLayer('dropdown', isDropdownOpen && !isModalOpen)

// Child modal
useKeyboardLayer('modal', isModalOpen)
```

## Future Enhancements

### Potential Improvements

1. **Layer Metadata**: Attach component info to layers for debugging
   ```typescript
   useKeyboardLayer('modal', isOpen, { componentName: 'IssuesModal' })
   ```

2. **Layer Priorities**: Explicit priority values instead of stack order
   ```typescript
   useKeyboardLayer({ type: 'modal', priority: 100 }, isOpen)
   ```

3. **Shortcut Customization**: Per-layer shortcut definitions
   ```typescript
   useKeyboardLayer('modal', isOpen, {
     shortcuts: { 'Left': handleLeft, 'Right': handleRight }
   })
   ```

4. **Layer History**: Track layer push/pop history for analytics
   ```typescript
   getLayerHistory() // → [{ layer: 'modal', timestamp, action: 'push' }, ...]
   ```

## References

- **Implementation**: See `docs/dropdown-navigation-ui-progress.md` Issue 1
- **Effect Service Pattern**: See `docs/AI_ADAPTERS_HEXAGONAL_ARCHITECTURE.md`
- **IPC Type Safety**: See `docs/EFFECT_ATOM_IPC_GUIDE.md`
