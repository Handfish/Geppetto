import { Schema } from 'effect'

/**
 * Keyboard Layer Schema
 *
 * Defines keyboard interaction layers in the application.
 * Layers determine which global shortcuts are active in the main process.
 *
 * Layer Priority (highest to lowest):
 * 1. modal - Full-screen modals (blocks all carousel shortcuts)
 * 2. dropdown - Dropdown menus (blocks carousel, allows modal-specific keys)
 * 3. carousel - Default layer (all carousel shortcuts active)
 */

/**
 * KeyboardLayer
 *
 * Represents a keyboard interaction layer.
 */
export const KeyboardLayer = Schema.Literal(
  'carousel',   // Default layer: carousel navigation with Left/Right arrows
  'dropdown',   // Dropdown menus: blocks carousel, allows dropdown-specific keys
  'modal'       // Modals: blocks all parent layers, modal has full keyboard control
)
export type KeyboardLayer = Schema.Schema.Type<typeof KeyboardLayer>

/**
 * KeyboardLayerState
 *
 * Current keyboard layer stack state.
 */
export class KeyboardLayerState extends Schema.Class<KeyboardLayerState>('KeyboardLayerState')({
  /**
   * Active keyboard layer (top of stack)
   */
  activeLayer: KeyboardLayer,

  /**
   * Full layer stack (for debugging/inspection)
   */
  layerStack: Schema.Array(KeyboardLayer),
}) {}

/**
 * PushKeyboardLayerInput
 *
 * Input for pushing a new keyboard layer onto the stack.
 */
export class PushKeyboardLayerInput extends Schema.Class<PushKeyboardLayerInput>('PushKeyboardLayerInput')({
  /**
   * Layer to push onto the stack
   */
  layer: KeyboardLayer,
}) {}

/**
 * PopKeyboardLayerInput
 *
 * Input for popping a keyboard layer from the stack.
 */
export class PopKeyboardLayerInput extends Schema.Class<PopKeyboardLayerInput>('PopKeyboardLayerInput')({
  /**
   * Layer to pop from the stack (must match current top)
   */
  layer: KeyboardLayer,
}) {}
