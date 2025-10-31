import { Context, Effect, Layer, Ref } from 'effect'
import { globalShortcut, BrowserWindow } from 'electron'

/**
 * KeyboardLayerManager Service
 *
 * Centralized keyboard layer management for coordinating global shortcuts
 * between main and renderer processes.
 *
 * **Architecture**:
 * - Maintains a stack of keyboard layers (carousel, dropdown, modal)
 * - Top of stack determines which global shortcuts are active
 * - Automatically registers/unregisters shortcuts based on active layer
 *
 * **Layer Priority** (highest to lowest):
 * 1. modal - Full keyboard control (blocks all carousel shortcuts)
 * 2. dropdown - Partial keyboard control (blocks carousel, modal handles keys)
 * 3. carousel - Default layer (Left/Right arrows for navigation)
 *
 * **Usage Pattern**:
 * Components call push/pop via IPC when mounting/unmounting:
 * ```typescript
 * // Component mounts
 * useEffect(() => {
 *   pushKeyboardLayer('modal')
 *   return () => popKeyboardLayer('modal')
 * }, [isOpen])
 * ```
 */

export type KeyboardLayer = 'carousel' | 'dropdown' | 'modal'

export interface KeyboardLayerState {
  activeLayer: KeyboardLayer
  layerStack: KeyboardLayer[]
}

export interface KeyboardLayerManagerConfig {
  mainWindow: BrowserWindow
}

export class KeyboardLayerManager extends Context.Tag('KeyboardLayerManager')<
  KeyboardLayerManager,
  {
    /**
     * Push a keyboard layer onto the stack
     */
    readonly pushLayer: (layer: KeyboardLayer) => Effect.Effect<void>

    /**
     * Pop a keyboard layer from the stack
     */
    readonly popLayer: (layer: KeyboardLayer) => Effect.Effect<void>

    /**
     * Get current keyboard layer state
     */
    readonly getState: () => Effect.Effect<KeyboardLayerState>
  }
>() {
  /**
   * Live implementation with Ref-based state management
   */
  static Live = (config: KeyboardLayerManagerConfig) =>
    Layer.effect(
      KeyboardLayerManager,
      Effect.gen(function* () {
        const { mainWindow } = config

        // State: Layer stack (initialized with 'carousel' as default)
        const layerStackRef = yield* Ref.make<KeyboardLayer[]>(['carousel'])

        /**
         * Register arrow key global shortcuts for carousel navigation
         */
        const registerArrowKeys = () => {
          // Unregister first to avoid conflicts
          globalShortcut.unregister('Left')
          globalShortcut.unregister('Right')

          globalShortcut.register('Left', () => {
            console.log('[KeyboardLayerManager] Left arrow → carousel:prev')
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('carousel:prev')
            }
          })

          globalShortcut.register('Right', () => {
            console.log('[KeyboardLayerManager] Right arrow → carousel:next')
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('carousel:next')
            }
          })

          console.log('[KeyboardLayerManager] ✓ Arrow keys registered (carousel layer active)')
        }

        /**
         * Unregister arrow key global shortcuts
         */
        const unregisterArrowKeys = () => {
          globalShortcut.unregister('Left')
          globalShortcut.unregister('Right')
          console.log('[KeyboardLayerManager] ✗ Arrow keys unregistered (modal/dropdown layer active)')
        }

        /**
         * Update global shortcuts based on active layer
         */
        const updateShortcuts = (activeLayer: KeyboardLayer) => {
          switch (activeLayer) {
            case 'carousel':
              // Carousel layer: enable arrow key navigation
              registerArrowKeys()
              break

            case 'dropdown':
            case 'modal':
              // Dropdown/Modal layers: disable arrow keys (renderer handles them)
              unregisterArrowKeys()
              break
          }
        }

        /**
         * Push a keyboard layer onto the stack
         */
        const pushLayer = (layer: KeyboardLayer) =>
          Effect.gen(function* () {
            const stack = yield* Ref.get(layerStackRef)
            const newStack = [...stack, layer]
            yield* Ref.set(layerStackRef, newStack)

            const activeLayer = newStack[newStack.length - 1]
            console.log(`[KeyboardLayerManager] Push '${layer}' → Active: '${activeLayer}', Stack: [${newStack.join(', ')}]`)

            updateShortcuts(activeLayer)
          })

        /**
         * Pop a keyboard layer from the stack
         */
        const popLayer = (layer: KeyboardLayer) =>
          Effect.gen(function* () {
            const stack = yield* Ref.get(layerStackRef)

            // Find and remove the layer (LIFO - last in, first out)
            const layerIndex = stack.lastIndexOf(layer)
            if (layerIndex === -1) {
              console.warn(`[KeyboardLayerManager] Pop '${layer}' failed - not found in stack: [${stack.join(', ')}]`)
              return
            }

            const newStack = [...stack.slice(0, layerIndex), ...stack.slice(layerIndex + 1)]

            // Ensure we never have an empty stack - default to 'carousel'
            const finalStack = newStack.length === 0 ? ['carousel'] : newStack
            yield* Ref.set(layerStackRef, finalStack)

            const activeLayer = finalStack[finalStack.length - 1]
            console.log(`[KeyboardLayerManager] Pop '${layer}' → Active: '${activeLayer}', Stack: [${finalStack.join(', ')}]`)

            updateShortcuts(activeLayer)
          })

        /**
         * Get current keyboard layer state
         */
        const getState = () =>
          Effect.gen(function* () {
            const stack = yield* Ref.get(layerStackRef)
            const activeLayer = stack[stack.length - 1]

            return {
              activeLayer,
              layerStack: stack,
            }
          })

        // Initialize with carousel layer active
        registerArrowKeys()

        return KeyboardLayerManager.of({
          pushLayer,
          popLayer,
          getState,
        })
      })
    )
}
