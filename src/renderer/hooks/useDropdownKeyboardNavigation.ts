import { useEffect, useCallback } from 'react'

/**
 * Dropdown Keyboard Navigation
 *
 * Provides arrow key navigation for dropdown menus:
 * - Up/Down: Navigate between items
 * - Enter: Select focused item
 * - Home/End: Jump to first/last item
 */

export interface DropdownKeyboardNavigationOptions {
  /** Is dropdown open? */
  isOpen: boolean

  /** Total number of navigable items */
  itemCount: number

  /** Current focused index */
  focusedIndex: number

  /** Callback when navigation occurs */
  onNavigate: (index: number) => void

  /** Callback when Enter is pressed */
  onSelect: () => void

  /** Enable/disable navigation */
  enabled?: boolean
}

/**
 * useDropdownKeyboardNavigation Hook
 *
 * Adds keyboard navigation for dropdown menus with arrow keys.
 *
 * Usage:
 * ```tsx
 * const [focusedIndex, setFocusedIndex] = useState(0)
 *
 * useDropdownKeyboardNavigation({
 *   isOpen,
 *   itemCount: menuItems.length,
 *   focusedIndex,
 *   onNavigate: setFocusedIndex,
 *   onSelect: () => menuItems[focusedIndex]?.onClick(),
 * })
 * ```
 */
export function useDropdownKeyboardNavigation({
  isOpen,
  itemCount,
  focusedIndex,
  onNavigate,
  onSelect,
  enabled = true,
}: DropdownKeyboardNavigationOptions) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      console.log('[useDropdownKeyboardNavigation] Key pressed:', event.key, {
        enabled,
        isOpen,
        itemCount,
        focusedIndex,
      })

      // Only handle keys when enabled and dropdown is open
      if (!enabled || !isOpen || itemCount === 0) {
        console.log('[useDropdownKeyboardNavigation] Ignoring - not enabled/open or no items')
        return
      }

      // Don't trigger if typing in input/textarea
      const target = event.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        console.log('[useDropdownKeyboardNavigation] Ignoring - in input/textarea')
        return
      }

      switch (event.key) {
        case 'ArrowDown':
          console.log('[useDropdownKeyboardNavigation] ArrowDown - navigating to next')
          event.preventDefault()
          // Move to next item (wrap to first if at end)
          onNavigate((focusedIndex + 1) % itemCount)
          break

        case 'ArrowUp':
          console.log('[useDropdownKeyboardNavigation] ArrowUp - navigating to previous')
          event.preventDefault()
          // Move to previous item (wrap to last if at beginning)
          onNavigate((focusedIndex - 1 + itemCount) % itemCount)
          break

        case 'Home':
          event.preventDefault()
          onNavigate(0)
          break

        case 'End':
          event.preventDefault()
          onNavigate(itemCount - 1)
          break

        case 'Enter':
          event.preventDefault()
          onSelect()
          break
      }
    },
    [enabled, isOpen, itemCount, focusedIndex, onNavigate, onSelect]
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
