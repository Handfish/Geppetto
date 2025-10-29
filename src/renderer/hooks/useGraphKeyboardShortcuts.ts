import { useEffect, useCallback } from 'react'

/**
 * Keyboard Shortcuts for Git Graph
 *
 * Provides keyboard shortcuts for common graph operations:
 * - Ctrl/Cmd + F: Focus search input
 * - Ctrl/Cmd + R: Refresh graph
 * - Ctrl/Cmd + =: Zoom in
 * - Ctrl/Cmd + -: Zoom out
 * - Ctrl/Cmd + 0: Reset zoom
 * - Escape: Clear selection / Close panels
 */

export interface GraphKeyboardShortcutsOptions {
  /** Focus search input callback */
  onFocusSearch?: () => void

  /** Refresh graph callback */
  onRefresh?: () => void

  /** Zoom in callback */
  onZoomIn?: () => void

  /** Zoom out callback */
  onZoomOut?: () => void

  /** Reset zoom callback */
  onResetZoom?: () => void

  /** Clear selection callback */
  onClearSelection?: () => void

  /** Enable/disable shortcuts (useful for modals, inputs) */
  enabled?: boolean
}

/**
 * useGraphKeyboardShortcuts Hook
 *
 * Adds keyboard shortcuts for graph navigation and control.
 *
 * Usage:
 * ```tsx
 * const searchInputRef = useRef<HTMLInputElement>(null)
 *
 * useGraphKeyboardShortcuts({
 *   onFocusSearch: () => searchInputRef.current?.focus(),
 *   onRefresh: refresh,
 *   onZoomIn: () => setZoom((z) => Math.min(2.0, z + 0.1)),
 *   onZoomOut: () => setZoom((z) => Math.max(0.5, z - 0.1)),
 *   onResetZoom: () => setZoom(1.0),
 *   onClearSelection: () => setSelectedCommit(null),
 * })
 * ```
 */
export function useGraphKeyboardShortcuts({
  onFocusSearch,
  onRefresh,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onClearSelection,
  enabled = true,
}: GraphKeyboardShortcutsOptions) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Don't trigger shortcuts if disabled
      if (!enabled) return

      // Don't trigger shortcuts when typing in inputs/textareas
      const target = event.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        // Allow Escape to blur inputs
        if (event.key === 'Escape') {
          target.blur()
        }
        return
      }

      const isMod = event.ctrlKey || event.metaKey

      // Escape key - clear selection
      if (event.key === 'Escape') {
        event.preventDefault()
        onClearSelection?.()
        return
      }

      // Modifier key required for other shortcuts
      if (!isMod) return

      switch (event.key.toLowerCase()) {
        case 'f':
          // Ctrl/Cmd + F: Focus search
          event.preventDefault()
          onFocusSearch?.()
          console.log('[GraphKeyboardShortcuts] Focus search (Ctrl+F)')
          break

        case 'r':
          // Ctrl/Cmd + R: Refresh (override browser refresh)
          event.preventDefault()
          onRefresh?.()
          console.log('[GraphKeyboardShortcuts] Refresh graph (Ctrl+R)')
          break

        case '=':
        case '+':
          // Ctrl/Cmd + =: Zoom in
          event.preventDefault()
          onZoomIn?.()
          console.log('[GraphKeyboardShortcuts] Zoom in (Ctrl+=)')
          break

        case '-':
        case '_':
          // Ctrl/Cmd + -: Zoom out
          event.preventDefault()
          onZoomOut?.()
          console.log('[GraphKeyboardShortcuts] Zoom out (Ctrl+-)')
          break

        case '0':
          // Ctrl/Cmd + 0: Reset zoom
          event.preventDefault()
          onResetZoom?.()
          console.log('[GraphKeyboardShortcuts] Reset zoom (Ctrl+0)')
          break
      }
    },
    [
      enabled,
      onFocusSearch,
      onRefresh,
      onZoomIn,
      onZoomOut,
      onResetZoom,
      onClearSelection,
    ]
  )

  useEffect(() => {
    if (!enabled) return

    // Use capture phase to ensure we catch events before they bubble
    document.addEventListener('keydown', handleKeyDown, { capture: true })

    return () => {
      document.removeEventListener('keydown', handleKeyDown, { capture: true })
    }
  }, [enabled, handleKeyDown])
}
