import { useEffect, useCallback } from 'react'

/**
 * Issue Modal Keyboard Navigation
 *
 * Provides keyboard navigation for issues modal:
 * - Up/Down: Navigate between issues
 * - Spacebar: Toggle selection
 * - Left/Right: Cycle AI agent (for selected issues only)
 * - Enter: Launch watchers
 * - Escape: Close modal
 */

export interface IssueModalKeyboardNavigationOptions {
  /** Is modal open? */
  isOpen: boolean

  /** Total number of issues */
  issueCount: number

  /** Current focused issue index */
  focusedIndex: number

  /** Callback when navigation occurs */
  onNavigate: (index: number) => void

  /** Callback when spacebar is pressed (toggle selection) */
  onToggleSelection: () => void

  /** Callback when left arrow is pressed on selected issue */
  onCycleAgentLeft?: () => void

  /** Callback when right arrow is pressed on selected issue */
  onCycleAgentRight?: () => void

  /** Callback when Enter is pressed (launch watchers) */
  onLaunch: () => void

  /** Callback when Escape is pressed (close modal) */
  onClose: () => void

  /** Enable/disable navigation */
  enabled?: boolean
}

/**
 * useIssueModalKeyboardNavigation Hook
 *
 * Adds keyboard navigation for issues modal with full control.
 *
 * Usage:
 * ```tsx
 * const [focusedIndex, setFocusedIndex] = useState(0)
 *
 * useIssueModalKeyboardNavigation({
 *   isOpen,
 *   issueCount: issues.length,
 *   focusedIndex,
 *   onNavigate: setFocusedIndex,
 *   onToggleSelection: () => toggleShortlist(issues[focusedIndex].number),
 *   onCycleAgentLeft: () => cycleAgent('left'),
 *   onCycleAgentRight: () => cycleAgent('right'),
 *   onLaunch: handleLaunch,
 *   onClose: onClose,
 * })
 * ```
 */
export function useIssueModalKeyboardNavigation({
  isOpen,
  issueCount,
  focusedIndex,
  onNavigate,
  onToggleSelection,
  onCycleAgentLeft,
  onCycleAgentRight,
  onLaunch,
  onClose,
  enabled = true,
}: IssueModalKeyboardNavigationOptions) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled || !isOpen || issueCount === 0) return

      // Don't trigger if typing in input/textarea/select
      const target = event.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return
      }

      // Check if this is a key we handle
      const handledKeys = ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', ' ', 'Enter', 'Escape']
      if (!handledKeys.includes(event.key)) {
        return
      }

      // CRITICAL: Stop propagation to prevent parent listeners from receiving this event
      // This prevents dropdown from receiving events when modal is open
      event.stopPropagation()

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault()
          // Move to next issue (wrap to first if at end)
          onNavigate((focusedIndex + 1) % issueCount)
          break

        case 'ArrowUp':
          event.preventDefault()
          // Move to previous issue (wrap to last if at beginning)
          onNavigate((focusedIndex - 1 + issueCount) % issueCount)
          break

        case 'ArrowLeft':
          event.preventDefault()
          // Cycle agent left (only if callback provided)
          onCycleAgentLeft?.()
          break

        case 'ArrowRight':
          event.preventDefault()
          // Cycle agent right (only if callback provided)
          onCycleAgentRight?.()
          break

        case ' ': // Spacebar
          event.preventDefault()
          onToggleSelection()
          break

        case 'Enter':
          event.preventDefault()
          onLaunch()
          break

        case 'Escape':
          event.preventDefault()
          onClose()
          break
      }
    },
    [
      enabled,
      isOpen,
      issueCount,
      focusedIndex,
      onNavigate,
      onToggleSelection,
      onCycleAgentLeft,
      onCycleAgentRight,
      onLaunch,
      onClose,
    ]
  )

  useEffect(() => {
    if (!enabled || !isOpen) return

    // Use capture phase to ensure we catch events before they bubble
    document.addEventListener('keydown', handleKeyDown, { capture: true })

    return () => {
      document.removeEventListener('keydown', handleKeyDown, { capture: true })
    }
  }, [enabled, isOpen, handleKeyDown])
}
