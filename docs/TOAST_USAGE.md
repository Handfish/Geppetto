# Toast Usage Guide

This document tracks all places where Sonner toast notifications are used in the codebase.

## Overview

The application uses [Sonner](https://sonner.emilkowal.ski/) for toast notifications with a unified custom design system.

## Core Toast Infrastructure

### 1. Toast Component & Utilities (`src/renderer/lib/toast.tsx`)

**Main exports:**
- `showCustomToast(props, options?)` - Unified custom toast with yellow glowing card design
- `showProFeatureLockedToast(message?)` - Convenience function for tier-locked features
- `withToast()` - Legacy Effect wrapper for loading/success/error toasts (deprecated, use `withErrorHandling` instead)

**Custom Toast Component:**
```typescript
showCustomToast(
  {
    title: string,           // Main heading (required)
    message: string,         // Main content (required)
    description?: string,    // Optional additional text
    onDismiss?: () => void, // Optional callback when dismissed
  },
  options?: ExternalToast   // Sonner options (id, duration, position, etc.)
)
```

**Design:**
- Yellow glowing card with glassmorphic background
- Consistent styling across all custom toasts
- `unstyled: true` to prevent Sonner wrapper elements
- Position: `top-left` (offset by 32px top, 500px left)
- Default duration: 6 seconds

### 2. Toast Viewport (`src/renderer/components/ui/ToastViewport.tsx`)

**Purpose:** Renders the Sonner `<Toaster>` component for the main window only.

**Configuration:**
- Only renders in main window (not in child windows)
- Position: `top-left`
- Offset: `{ top: 32, left: 500 }`
- All toasts are unstyled by default

**Usage:** Imported once in `src/renderer/screens/main.tsx`

### 3. Error Presenter (`src/renderer/lib/error-handling/adapters/toast-error-presenter.tsx`)

**Purpose:** Default error presentation adapter that shows errors as toast notifications.

**How it works:**
- Receives IPC errors from `withErrorHandling()` wrapper
- Formats error title based on error type and context
- Adds provider prefix if context includes provider
- Shows tier limit count for `TierLimitError`
- Uses `showCustomToast()` for all error presentation

**Features:**
- Context-aware titles (`"Authentication Error"`, `"Network Error"`, etc.)
- Provider prefixes (`"[GITHUB] ..."` when `context.provider` is set)
- Automatic duration based on severity (8s for warnings, 6s for errors)
- Tier error descriptions (e.g., `"1 / 1 accounts used"`)

## Usage Locations

### Custom Toasts (Unified Design)

#### 1. Error Presentation (via Error Handling System)
**File:** `src/renderer/lib/error-handling/adapters/toast-error-presenter.tsx`
```typescript
// Automatically called by withErrorHandling()
showCustomToast({
  title: formatErrorTitle(error, context),
  message: formatErrorMessage(error, context),
  description: tierLimitDescription,
  variant: 'warning', // default
}, { id, duration })
```

**Used by:**
- All operations wrapped with `withErrorHandling()`
- VCS provider sign-in/sign-out
- AI provider authentication
- Repository operations
- Account management

#### 2. Console Error Messages
**File:** `src/renderer/screens/main.tsx:58-70`
```typescript
showCustomToast({
  title: 'Developer Console Message',
  message: error.message,
  variant: 'warning', // default
  onDismiss: clearConsoleError,
}, {
  id: 'console-error',
  duration: 6000,
  onDismiss: clearConsoleError,
  onAutoClose: clearConsoleError,
})
```

**Trigger:** When `console.error()` is called, captured via `console-error-channel`

#### 3. Pro Feature Locked
**File:** `src/renderer/components/AiUsageCard.tsx:169`
```typescript
showProFeatureLockedToast(message)
// Equivalent to:
// showCustomToast({ title: 'Pro feature locked', message, variant: 'warning' })
```

**Trigger:** When user tries to access AI features in free tier

#### 4. Repository Clone Success/Error
**File:** `src/renderer/components/ui/RepositoryDropdown.tsx:127-151`

**Success Toast (Teal variant):**
```typescript
showCustomToast({
  title: 'Repository Cloned',
  message: `${repo.owner}/${repo.name} has been cloned to your workspace`,
  variant: 'success',
}, {
  duration: 6000,
  id: 'repo-clone-success',
})
```

**Error Toast (Yellow variant):**
```typescript
showCustomToast({
  title: 'Clone Failed',
  message: error.message || 'Failed to clone repository to workspace',
  variant: 'warning',
}, {
  duration: 6000,
  id: 'repo-clone-error',
})
```

**Trigger:** After repository clone operation completes

### Standard Sonner Toasts

#### 1. AI Provider Sign-In Success
**File:** `src/renderer/atoms/ai-provider-atoms.ts:39-42`
```typescript
toast.success(`${formatProviderLabel(provider)} connected.`, {
  id: `ai-provider:${provider}:sign-in`,
  position: 'top-left',
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

### Custom Toast Variants

The unified `showCustomToast()` function supports two variants via the `variant` prop:

#### Warning Variant (Default)
**Used for:** Errors, warnings, tier limits, console messages

**Usage:**
```typescript
showCustomToast({ title, message, variant: 'warning' }) // or omit variant
```

**Colors:**
- Border: `border-yellow-400/30`
- Background: `bg-gradient-to-br from-gray-900/60 via-gray-950/70 to-gray-950/80`
- Text: `text-yellow-100`
- Title: `text-yellow-300` with glow shadow `drop-shadow-[0_2px_8px_rgba(251,191,36,0.3)]`
- Message: `text-yellow-100/90`
- Description: `text-yellow-100/70`
- Button: `text-yellow-100/80 hover:bg-yellow-500/15 hover:text-yellow-50`

#### Success Variant
**Used for:** Successful operations, repository clone success

**Usage:**
```typescript
showCustomToast({ title, message, variant: 'success' })
```

**Colors:**
- Border: `border-teal-400/30`
- Background: `bg-gradient-to-br from-gray-900/60 via-gray-950/70 to-gray-950/80`
- Text: `text-teal-100`
- Title: `text-teal-300` with glow shadow `drop-shadow-[0_2px_8px_rgba(45,212,191,0.3)]`
- Message: `text-teal-100/90`
- Description: `text-teal-100/70`
- Button: `text-teal-100/80 hover:bg-teal-500/15 hover:text-teal-50`

### Standard Sonner Toasts
**Used for:** AI provider sign-in success

**Uses Sonner's default success styling**

## Migration Plan

### Phase 1: ✅ Completed
- [x] Unified custom toast component (`showCustomToast()`)
- [x] Integrated with error handling system
- [x] Migrated console error toasts
- [x] Migrated pro feature locked toasts
- [x] Migrated error presenter to use unified component

### Phase 2: ✅ Completed
- [x] Extended `showCustomToast()` with `variant` prop (`'warning' | 'success'`)
- [x] Migrated `RepositoryDropdown.tsx` clone toasts to `showCustomToast()`
- [x] All custom toasts now use unified component

### Phase 3: Optional Future Work
- [ ] Migrate AI provider sign-in success to custom toast (currently uses standard Sonner toast)
- [ ] Remove `withToast()` if no longer used (check all usage first)
- [ ] Add additional toast variants (info, error with different styling)
- [ ] Add toast actions (retry button, undo, etc.)
- [ ] Add toast progress bars for long operations
- [ ] Add toast stacking/grouping for multiple errors

## Best Practices

### ✅ DO:
- Use `showCustomToast()` for all custom toasts
- Use `variant: 'success'` for successful operations
- Use `variant: 'warning'` (or omit) for errors/warnings
- Use `withErrorHandling()` for automatic error presentation
- Include operation context in error handling (`{ operation: 'sign-in', provider: 'github' }`)
- Set unique toast IDs to prevent duplicates
- Use `onDismiss` callback for cleanup when needed
- Use `description` prop for additional context (e.g., tier limits)

### ❌ DON'T:
- Don't use `toast.custom()` directly (use `showCustomToast()` instead)
- Don't duplicate toast JSX across files
- Don't forget `unstyled: true` if manually using `toast.custom()`
- Don't use `withToast()` for new code (deprecated)
- Don't show toasts for every error (some errors should be inline only)
- Don't hardcode variant-specific colors (use the `variant` prop instead)

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
