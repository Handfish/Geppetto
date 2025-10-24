# Error Testing Guide

This document explains how to test error handling in development mode.

## Quick Start

1. **Start the development server:**
   ```bash
   pnpm dev:free
   # or
   pnpm dev:pro
   ```

2. **Open the browser developer console** (the app runs in Electron which uses Chromium)

3. **You'll see this message in the console:**
   ```
   [ErrorTester] Error testing available!
   Use window.__DEV_TRIGGER_ERROR__(type) to trigger errors:
     - "render-error"   : Throws during render (caught by ErrorBoundary)
     - "async-error"    : Throws in async operation
     - "route-error"    : Throws route navigation error
     - "defect"         : Throws unexpected error
     - "network-error"  : Simulates network failure

   Example: window.__DEV_TRIGGER_ERROR__("render-error")
   ```

4. **Trigger errors from the console:**
   ```javascript
   // Test error boundary with auto-recovery
   window.__DEV_TRIGGER_ERROR__("render-error")

   // Test async error handling
   window.__DEV_TRIGGER_ERROR__("async-error")

   // Test route error fallback
   window.__DEV_TRIGGER_ERROR__("route-error")

   // Test defect handling (TypeError)
   window.__DEV_TRIGGER_ERROR__("defect")
   ```

## Error Types Explained

### `render-error`
**What it does:** Throws an error during React component render.

**What you'll see:**
- ConsoleErrorBoundary catches the error
- Shows error card in top-left (not full-screen)
- Auto-recovery countdown (8 seconds)
- "Dismiss Now" button
- Selectable stack trace (development mode)
- Smooth fade-out transition before recovery

**What to test:**
- ✅ Error doesn't block entire screen
- ✅ Countdown works (8s)
- ✅ Can dismiss early with "Dismiss Now"
- ✅ Auto-recovers after countdown
- ✅ Stack trace is selectable/copyable

---

### `async-error`
**What it does:** Throws an error in a setTimeout (async context).

**What you'll see:**
- Browser's global error handler catches it
- Shows in browser console
- May trigger error boundary depending on React version

**What to test:**
- ✅ Error appears in console
- ✅ App continues functioning

---

### `route-error`
**What it does:** Navigates to an invalid route.

**What you'll see:**
- RouteErrorFallback component renders
- Shows error card in top-left (not full-screen)
- "Reload Application" button
- "Go Back" button
- Selectable stack trace (development mode)

**What to test:**
- ✅ Error doesn't block entire screen
- ✅ "Go Back" returns to previous route
- ✅ "Reload Application" reloads the app
- ✅ Stack trace is selectable/copyable
- ✅ Card has proper styling (bg-gray-800)

---

### `defect`
**What it does:** Throws a TypeError by accessing properties on `null`.

**What you'll see:**
- ConsoleErrorBoundary catches it
- Same UI as `render-error`

**What to test:**
- ✅ Same as `render-error` test cases

---

### `network-error`
**What it does:** Currently just shows an alert (requires atom-level implementation).

**Future enhancement:** Could inject mock network failures into atoms.

---

## Error Loop Testing

**How to test:**
1. Trigger the same error multiple times quickly (>3 times)
2. After 3 errors, you should see:
   - "Critical Error" title
   - "Multiple errors detected" message
   - "Reload Application" button (no auto-recovery)
   - No more auto-recovery countdown

**What to test:**
- ✅ After 3+ errors, stops auto-recovery
- ✅ Shows persistent "Critical Error" message
- ✅ Only option is to reload

---

## Navigation Recovery Testing

**How to test:**
1. Trigger an error: `window.__DEV_TRIGGER_ERROR__("render-error")`
2. Before the 8s countdown completes, change the route:
   - Use browser back/forward buttons
   - Change URL hash manually
3. Error should auto-dismiss

**What to test:**
- ✅ Navigating away dismisses error
- ✅ No need to wait for countdown

---

## Manual Testing Checklist

### ConsoleErrorBoundary
- [ ] Error appears in top-left (not full-screen)
- [ ] Background is `bg-gray-800` card, not full screen
- [ ] 8-second countdown works
- [ ] "Dismiss Now" button works
- [ ] Stack trace is selectable (dev mode)
- [ ] Auto-recovery works (fades out, then recovers)
- [ ] Navigation recovery works (hashchange/popstate)
- [ ] Error loop detection works (>3 errors)

### RouteErrorFallback
- [ ] Error appears in top-left (not full-screen)
- [ ] Background is `bg-gray-800` card, not full screen
- [ ] "Go Back" button works
- [ ] "Reload Application" button works
- [ ] Stack trace is selectable (dev mode)
- [ ] Text is legible (bright red-200/red-100)

### ErrorAlert Component
- [ ] Title is bright and bold (`text-red-200 font-semibold`)
- [ ] Message is legible (`text-red-100/90`)
- [ ] Background is subtle red (`border-red-500/50 bg-red-500/10`)
- [ ] Action buttons work
- [ ] Dismiss button works (if provided)

### TierLimitAlert Component
- [ ] Title is bright and bold (`text-yellow-200 font-semibold`)
- [ ] Message is legible (`text-yellow-100`)
- [ ] Background is subtle yellow (`border-yellow-500/70 bg-yellow-500/10`)
- [ ] Usage text is visible (`text-yellow-200/80`)
- [ ] "Upgrade to Pro" button works (if provided)

---

## Quick Commands Reference

```bash
# Start development
pnpm dev:free
pnpm dev:pro

# Compile for testing
pnpm compile:app:free
pnpm compile:app:pro

# Lint
pnpm lint
pnpm lint:fix
```

## Console Commands Reference

```javascript
// Trigger specific error types
window.__DEV_TRIGGER_ERROR__("render-error")
window.__DEV_TRIGGER_ERROR__("async-error")
window.__DEV_TRIGGER_ERROR__("route-error")
window.__DEV_TRIGGER_ERROR__("defect")
window.__DEV_TRIGGER_ERROR__("network-error")

// Test error loop (run 4 times quickly)
window.__DEV_TRIGGER_ERROR__("render-error")
window.__DEV_TRIGGER_ERROR__("render-error")
window.__DEV_TRIGGER_ERROR__("render-error")
window.__DEV_TRIGGER_ERROR__("render-error")
```

---

## Notes

- **Development mode only:** ErrorTester is only available when `NODE_ENV=development`
- **Production builds:** ErrorTester is not included in production builds
- **Browser console:** Use Chromium DevTools (Electron uses Chromium)
- **Stack traces:** Only visible in development mode

---

## Troubleshooting

**ErrorTester not available:**
- Check that you're running in development mode (`pnpm dev:free` or `pnpm dev:pro`)
- Check browser console for the initialization message
- Try refreshing the app

**Errors not appearing:**
- Check browser console for JavaScript errors
- Verify ErrorBoundary is wrapping the app
- Check that RouteErrorFallback is configured in router

**Stack traces not selectable:**
- Verify `select-text` CSS class is applied
- Check browser console (Chromium DevTools)
- Try clicking and dragging to select

---

## Related Documentation

- [Error Refactor Session Summary](./error-refactor-session-summary.md)
- [Error Refactor Progress](./error-refactor-progress.md)
- [Error Refactor Plan](./error-refactor-plan.md)
