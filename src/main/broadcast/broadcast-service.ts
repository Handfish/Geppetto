/**
 * BroadcastService - Cross-Window State Synchronization
 *
 * Broadcasts state change events to all renderer windows to keep atoms in sync.
 * Solves the problem where state updates in one window don't reflect in others.
 *
 * @example
 * // In a service that modifies state:
 * yield* broadcastService.broadcast('accounts:changed')
 *
 * // In renderer, atoms listen for events and invalidate:
 * window.electron.ipcRenderer.on('state:accounts:changed', () => {
 *   // Invalidate accountContextAtom
 * })
 */

import { Effect } from 'effect'
import { BrowserWindow } from 'electron'

/**
 * State change event types
 * Add new events here as needed
 */
export type StateChangeEvent =
  | 'accounts:changed'        // Account context modified (add/remove/switch)
  | 'ai:usage:changed'        // AI usage data updated
  | 'workspace:changed'       // Workspace path changed
  | 'repositories:changed'    // Repository cache updated

/**
 * BroadcastService - Notify all renderer windows of state changes
 */
export class BroadcastService extends Effect.Service<BroadcastService>()(
  'BroadcastService',
  {
    sync: () => ({
      /**
       * Broadcast a state change event to all renderer windows
       *
       * @param event - The type of state change
       * @param payload - Optional data to send with the event
       */
      broadcast: <T = void>(event: StateChangeEvent, payload?: T) =>
        Effect.sync(() => {
          const eventChannel = `state:${event}`
          console.log(`[BroadcastService] Broadcasting ${eventChannel}`, payload ? `with payload` : '')

          // Send to all windows
          BrowserWindow.getAllWindows().forEach(window => {
            if (!window.isDestroyed()) {
              window.webContents.send(eventChannel, payload)
            }
          })
        }),
    }),
  }
) {}
