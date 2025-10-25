# Toast Usage Guide

This document tracks all places where Sonner toast notifications are used in the codebase.

## Overview

The application uses [Sonner](https://sonner.emilkowal.ski/) for toast notifications with stock Sonner styles and stacking.

## Core Toast Infrastructure

### 1. Toast Utilities (`src/renderer/lib/toast.tsx`)

**Main exports:**
- `showErrorToast(message, options?)` - Show error toast (stock Sonner error)
- `showSuccessToast(message, options?)` - Show success toast (stock Sonner success)
- `showWarningToast(message, options?)` - Show warning toast (stock Sonner warning)
- `showProFeatureLockedToast(message?)` - Convenience function for tier-locked features
- `withToast()` - Legacy Effect wrapper for loading/success/error toasts (deprecated, use `withErrorHandling` instead)

**Direct Usage:**
```typescript
import { toast } from 'sonner'

toast.success('Operation successful')
toast.error('Operation failed')
toast.warning('Warning message')
toast.info('Info message')
```

**Configuration:**
- Position: `top-left` with offset `{ top: 32, left: 500 }`
- Rich colors enabled for better visual distinction
- Default duration: 6 seconds
- Automatic stacking of multiple toasts

### 2. Toast Viewport (`src/renderer/components/ui/ToastViewport.tsx`)

**Purpose:** Renders the Sonner `<Toaster>` component for the main window only.

**Configuration:**
- Only renders in main window (not in child windows)
- Position: `top-left`
- Offset: `{ top: 32, left: 500 }`
- Rich colors enabled
- Default duration: 6000ms (6 seconds)
- Uses stock Sonner styles with automatic stacking

**Usage:** Imported once in `src/renderer/screens/main.tsx`

### 3. Error Presenter (`src/renderer/lib/error-handling/adapters/toast-error-presenter.tsx`)

**Purpose:** Default error presentation adapter that shows errors as toast notifications.

**How it works:**
- Receives IPC errors from `withErrorHandling()` wrapper
- Formats error title based on error type and context
- Adds provider prefix if context includes provider
- Shows tier limit count for `TierLimitError`
- Uses `toast.error()` or `toast.warning()` based on severity

**Features:**
- Context-aware titles (`"Authentication Error"`, `"Network Error"`, etc.)
- Provider prefixes (`"[GITHUB] ..."` when `context.provider` is set)
- Automatic duration based on severity (8s for warnings, 6s for errors)
- Tier error descriptions (e.g., `"1 / 1 accounts used"`)

## Usage Locations

### Stock Sonner Toasts

#### 1. Error Presentation (via Error Handling System)
**File:** `src/renderer/lib/error-handling/adapters/toast-error-presenter.tsx`
```typescript
// Automatically called by withErrorHandling()
toast.error(`${title}: ${message}`, { id, duration })
// or
toast.warning(`${title}: ${message}`, { id, duration })
```

**Used by:**
- All operations wrapped with `withErrorHandling()`
- VCS provider sign-in/sign-out
- AI provider authentication
- Repository operations
- Account management

#### 2. Console Error Messages
**File:** `src/renderer/screens/main.tsx`
```typescript
toast.error(`Console: ${error.message}`, {
  id: 'console-error',
  duration: 6000,
  onDismiss: clearConsoleError,
  onAutoClose: clearConsoleError,
})
```

**Trigger:** When `console.error()` is called, captured via `console-error-channel`

#### 3. Pro Feature Locked
**File:** Via `showProFeatureLockedToast()` utility
```typescript
showProFeatureLockedToast(message)
// Uses toast.warning() internally
```

**Trigger:** When user tries to access AI features in free tier

#### 4. Repository Clone Success/Error
**File:** `src/renderer/components/ui/RepositoryDropdown.tsx`

**Success Toast:**
```typescript
toast.success(`${repo.owner}/${repo.name} cloned to workspace`, {
  duration: 6000,
  id: 'repo-clone-success',
})
```

**Error Toast:**
```typescript
toast.error(`Clone failed: ${errorMessage}`, {
  duration: 6000,
  id: 'repo-clone-error',
})
```

**Trigger:** After repository clone operation completes

#### 5. AI Provider Sign-In Success
**File:** `src/renderer/atoms/ai-provider-atoms.ts`
```typescript
toast.success(`${formatProviderLabel(provider)} connected.`, {
  id: `ai-provider:${provider}:sign-in`,
  duration: 6000,
})
```

**Trigger:** After successful AI provider authentication

### Legacy Pattern (Deprecated)

#### `withToast()` - Effect Wrapper
**File:** `src/renderer/lib/toast.tsx:108-163`

**Status:** ⚠️ Deprecated - Use `withErrorHandling()` instead

**Pattern:**
```typescript
withToast(
  effectFactory,
  {
    onWaiting: 'Loading...',
    onSuccess: 'Success!',
    onFailure: 'Failed',
  }
)
```

**Uses Sonner's built-in toast types:**
- `toast.loading()` for waiting state
- `toast.success()` for success
- `toast.error()` for failure

**Why deprecated:**
- Manual error type checking required
- No error presenter abstraction
- Harder to customize per error type
- Replaced by `withErrorHandling()` + `ErrorPresenter` pattern

## Toast Design System

The application uses stock Sonner toast types with `richColors` enabled for better visual distinction:

### Available Toast Types

#### `toast.success(message, options)`
**Used for:** Successful operations, authentication success, repository clone success
- Green background with success icon
- Automatically styled by Sonner with rich colors

#### `toast.error(message, options)`
**Used for:** Error messages, failed operations, console errors
- Red background with error icon
- Automatically styled by Sonner with rich colors

#### `toast.warning(message, options)`
**Used for:** Warnings, tier limits, pro feature locks
- Yellow/amber background with warning icon
- Automatically styled by Sonner with rich colors

#### `toast.info(message, options)`
**Used for:** Informational messages
- Blue background with info icon
- Automatically styled by Sonner with rich colors

### Toast Features

- **Stacking**: Multiple toasts automatically stack (don't set `id` unless preventing duplicates)
- **Dismissible**: All toasts can be dismissed by clicking
- **Duration**: Default 6 seconds (configurable per toast)
- **Position**: Top-left with offset (32px top, 500px left)
- **Rich Colors**: Enhanced color schemes for better UX

## Migration History

### Phase 1: ✅ Completed (Initial Custom Implementation)
- [x] Unified custom toast component (`showCustomToast()`)
- [x] Integrated with error handling system
- [x] Migrated console error toasts
- [x] Migrated pro feature locked toasts
- [x] Migrated error presenter to use unified component

### Phase 2: ✅ Completed (Extended Custom Implementation)
- [x] Extended `showCustomToast()` with `variant` prop (`'warning' | 'success'`)
- [x] Migrated `RepositoryDropdown.tsx` clone toasts to `showCustomToast()`
- [x] All custom toasts now use unified component

### Phase 3: ✅ Completed (Migration to Stock Sonner)
- [x] Removed custom toast component
- [x] Updated ToastViewport to use stock Sonner with richColors
- [x] Migrated all toast calls to use stock Sonner types (success/error/warning)
- [x] Simplified codebase by removing custom styling
- [x] Enabled automatic toast stacking

### Future Enhancements
- [ ] Remove `withToast()` if no longer used (check all usage first)
- [ ] Add toast actions (retry button, undo, etc.)
- [ ] Add toast progress bars for long operations

## Best Practices

### ✅ DO:
- Use stock Sonner toast types: `toast.success()`, `toast.error()`, `toast.warning()`, `toast.info()`
- Use `withErrorHandling()` for automatic error presentation
- Include operation context in error handling (`{ operation: 'sign-in', provider: 'github' }`)
- Let toasts stack naturally by omitting `id` in most cases
- Only set `id` when you need to prevent duplicate toasts (e.g., recurring warnings)
- Use `onDismiss` callback for cleanup when needed
- Keep messages concise and actionable

### ❌ DON'T:
- Don't create custom toast components (use stock Sonner types)
- Don't use `withToast()` for new code (deprecated)
- Don't show toasts for every error (some errors should be inline only)
- Don't set `unstyled: true` (we want stock Sonner styling)
- Don't override position per toast (use global Toaster config)
- Don't set `id` on all toasts (prevents stacking - only use when you need to deduplicate)

## Files Reference

### Core Files
- `src/renderer/lib/toast.tsx` - Toast utilities and components
- `src/renderer/components/ui/ToastViewport.tsx` - Toaster setup
- `src/renderer/lib/error-handling/adapters/toast-error-presenter.tsx` - Error toast presenter

### Usage Files
- `src/renderer/screens/main.tsx` - Console error toasts
- `src/renderer/components/AiUsageCard.tsx` - Pro feature locked toast
- `src/renderer/components/ui/RepositoryDropdown.tsx` - Repository clone success/error toasts (uses unified component)
- `src/renderer/atoms/ai-provider-atoms.ts` - AI provider sign-in success toast (standard Sonner toast)

### Documentation
- `docs/RESULT_API_AND_ERROR_HANDLING.md` - Error handling system guide
- `docs/error-refactor-plan.md` - Original error handling refactor plan
- `CLAUDE.md` - Project architecture overview

## Debugging Tips

### Toast not showing?
1. Check that `<ToastViewport />` is rendered in main window
2. Verify you're in the main window (not a child window)
3. Check browser console for errors
4. Verify `unstyled: true` is set for custom toasts

### Toast showing duplicate content?
1. Sonner might be wrapping your custom component
2. Ensure `unstyled: true` is set in toast options
3. Check for conflicting toast IDs

### Toast styling broken?
1. Verify Tailwind classes are being applied
2. Check that `globals.css` doesn't have conflicting styles
3. Ensure `pointer-events-auto` is set on toast container

## Related Documentation
- [Sonner Official Docs](https://sonner.emilkowal.ski/)
- [Error Handling System](./RESULT_API_AND_ERROR_HANDLING.md)
- [Project Architecture](../CLAUDE.md)
