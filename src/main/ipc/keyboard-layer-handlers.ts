import { Effect } from 'effect'
import { KeyboardLayerIpcContracts } from '../../shared/ipc-contracts'
import { KeyboardLayerManager } from '../keyboard/keyboard-layer-manager'
import { registerIpcHandler } from './ipc-handler-setup'

/**
 * Setup Keyboard Layer IPC Handlers
 *
 * Registers IPC handlers for centralized keyboard layer management.
 * These handlers coordinate global shortcuts between main and renderer processes.
 */
export const setupKeyboardLayerIpcHandlers = Effect.gen(function* () {
  const keyboardLayerManager = yield* KeyboardLayerManager

  // Push a keyboard layer onto the stack
  registerIpcHandler(
    KeyboardLayerIpcContracts['keyboard-layer:push'],
    (input) => keyboardLayerManager.pushLayer(input.layer)
  )

  // Pop a keyboard layer from the stack
  registerIpcHandler(
    KeyboardLayerIpcContracts['keyboard-layer:pop'],
    (input) => keyboardLayerManager.popLayer(input.layer)
  )

  // Get current keyboard layer state
  registerIpcHandler(
    KeyboardLayerIpcContracts['keyboard-layer:get-state'],
    () => keyboardLayerManager.getState()
  )

  console.log('[IPC] Keyboard layer handlers registered')
})
