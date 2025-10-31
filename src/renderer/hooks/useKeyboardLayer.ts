import { useEffect } from 'react'
import { Effect } from 'effect'
import { ElectronIpcClient } from '../lib/ipc-client'

/**
 * Keyboard Layer Hook
 *
 * Centralized keyboard layer management for coordinating global shortcuts
 * between renderer components and main process.
 *
 * **Usage Pattern**:
 * Components declare their keyboard layer needs using this hook.
 * The hook automatically pushes the layer on mount and pops on unmount.
 *
 * **Layer Priority** (highest to lowest):
 * 1. modal - Full keyboard control (blocks all carousel shortcuts)
 * 2. dropdown - Partial keyboard control (blocks carousel shortcuts)
 * 3. carousel - Default layer (Left/Right arrows for carousel navigation)
 *
 * @example
 * ```typescript
 * // In IssuesModal component:
 * function IssuesModal({ isOpen, onClose }) {
 *   // Push 'modal' layer when modal is open, pop when closed
 *   useKeyboardLayer('modal', isOpen)
 *
 *   // Now Left/Right arrows won't trigger carousel navigation
 *   // Modal's keyboard handlers have full control
 *   return <div>...</div>
 * }
 * ```
 *
 * @example
 * ```typescript
 * // In RepositoryDropdown component:
 * function RepositoryDropdown({ isOpen }) {
 *   // Push 'dropdown' layer when dropdown is open
 *   useKeyboardLayer('dropdown', isOpen)
 *
 *   // Arrow keys blocked from carousel, dropdown handles them
 *   return <div>...</div>
 * }
 * ```
 *
 * @param layer - Keyboard layer to activate ('carousel' | 'dropdown' | 'modal')
 * @param enabled - Whether the layer should be active (typically tied to isOpen state)
 */
export function useKeyboardLayer(
  layer: 'carousel' | 'dropdown' | 'modal',
  enabled: boolean
) {
  useEffect(() => {
    if (!enabled) return

    // Push layer on mount (when enabled becomes true)
    const pushEffect = Effect.gen(function* () {
      const client = yield* ElectronIpcClient
      yield* client.invoke('keyboard-layer:push', { layer })
    })

    Effect.runPromise(
      pushEffect.pipe(Effect.provide(ElectronIpcClient.Default))
    ).catch((error) => {
      console.error(`[useKeyboardLayer] Failed to push layer '${layer}':`, error)
    })

    // Pop layer on unmount (cleanup)
    return () => {
      const popEffect = Effect.gen(function* () {
        const client = yield* ElectronIpcClient
        yield* client.invoke('keyboard-layer:pop', { layer })
      })

      Effect.runPromise(
        popEffect.pipe(Effect.provide(ElectronIpcClient.Default))
      ).catch((error) => {
        console.error(`[useKeyboardLayer] Failed to pop layer '${layer}':`, error)
      })
    }
  }, [layer, enabled])
}
