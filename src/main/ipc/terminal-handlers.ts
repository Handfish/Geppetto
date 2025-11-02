/**
 * Terminal IPC Handlers
 *
 * Handles IPC communication for terminal/watcher management using the generic
 * registerIpcHandler pattern for type-safe, boilerplate-free handler registration.
 */

import { Effect, Schema as S } from 'effect'
import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { TerminalIpcContracts } from '../../shared/ipc-contracts'
import { TerminalService } from '../terminal/terminal-service'
import { registerIpcHandler } from './ipc-handler-setup'
import type { OutputChunk, ProcessEvent } from '../../shared/schemas/terminal'

/**
 * Subscription tracking for callback-based IPC
 */
interface Subscription {
  id: string
  processId: string
  webContentsId: number  // Track which window owns this subscription
  cleanupOutput: () => void
  cleanupEvents: () => void
}

// Track active subscriptions
const subscriptions = new Map<string, Subscription>()

/**
 * Setup Terminal IPC handlers
 */
export const setupTerminalIpcHandlers = Effect.gen(function* () {
  console.log('========================================')
  console.log('[TerminalHandlers] SETTING UP TERMINAL IPC HANDLERS')
  console.log('========================================')

  const terminalService = yield* TerminalService
  console.log('[TerminalHandlers] Got terminal service')

  // Spawn AI watcher
  console.log('[TerminalHandlers] Registering spawn-watcher handler')
  registerIpcHandler(
    TerminalIpcContracts['terminal:spawn-watcher'],
    (input) => terminalService.spawnAiWatcher(input)
  )

  // Kill watcher
  registerIpcHandler(
    TerminalIpcContracts['terminal:kill-watcher'],
    ({ processId }) => terminalService.killWatcher(processId)
  )

  // Kill all watchers
  registerIpcHandler(
    TerminalIpcContracts['terminal:kill-all-watchers'],
    () => terminalService.killAllWatchers()
  )

  // Restart watcher
  registerIpcHandler(
    TerminalIpcContracts['terminal:restart-watcher'],
    ({ processId }) => terminalService.restartWatcher(processId)
  )

  // Write to watcher
  registerIpcHandler(
    TerminalIpcContracts['terminal:write-to-watcher'],
    ({ processId, data }) => terminalService.writeToWatcher(processId, data)
  )

  // Resize watcher
  registerIpcHandler(
    TerminalIpcContracts['terminal:resize-watcher'],
    ({ processId, rows, cols }) => terminalService.resizeWatcher(processId, rows, cols)
  )

  // Get watcher state
  registerIpcHandler(
    TerminalIpcContracts['terminal:get-watcher-state'],
    ({ processId }) => terminalService.getWatcherState(processId)
  )

  // List active watchers
  registerIpcHandler(
    TerminalIpcContracts['terminal:list-active-watchers'],
    () => terminalService.listActiveWatchers()
  )

  // Subscribe to watcher output/events
  // Custom handler (not using registerIpcHandler) to access event.sender
  console.log('[TerminalHandlers] Registering subscribe-to-watcher handler')
  ipcMain.handle('terminal:subscribe-to-watcher', async (event: IpcMainInvokeEvent, input: unknown) => {
    console.log('[TerminalHandlers] ========== SUBSCRIPTION HANDLER CALLED ==========')
    console.log('[TerminalHandlers] Sender webContentsId:', event.sender.id)

    const program = Effect.gen(function* () {
      // Decode input
      const { processId } = yield* S.decodeUnknown(TerminalIpcContracts['terminal:subscribe-to-watcher'].input)(input)
      console.log('[TerminalHandlers] ProcessId:', processId)

      const subscriptionId = `sub-${processId}-${Date.now()}`
      const senderWebContentsId = event.sender.id

      // Define callback that sends output via IPC (push-based) - ONLY to the sender window
      const sendOutputViaIpc = (chunk: OutputChunk) => {
        console.log('[TerminalHandlers] !!!!! Sending output chunk to renderer:', chunk.data.substring(0, 50))

        // Send ONLY to the window that owns this subscription
        const window = BrowserWindow.getAllWindows().find(w => w.webContents.id === senderWebContentsId)

        if (!window || window.isDestroyed() || !window.webContents || window.webContents.isDestroyed()) {
          console.log('[TerminalHandlers] Target window no longer exists:', senderWebContentsId)
          return
        }

        // Convert Schema class to plain object for IPC serialization
        const plainChunk = {
          processId: chunk.processId,
          data: chunk.data,
          timestamp: chunk.timestamp,
          type: chunk.type,
        }

        window.webContents.send(`terminal:stream:${processId}`, {
          type: 'output' as const,
          data: plainChunk,
        })
        console.log('[TerminalHandlers] Sent to window:', window.id)
      }

      // Define callback that sends events via IPC (push-based) - ONLY to the sender window
      const sendEventViaIpc = (event: ProcessEvent) => {
        console.log('[TerminalHandlers] Sending event to renderer:', event.type)

        // Send ONLY to the window that owns this subscription
        const window = BrowserWindow.getAllWindows().find(w => w.webContents.id === senderWebContentsId)

        if (!window || window.isDestroyed() || !window.webContents || window.webContents.isDestroyed()) {
          console.log('[TerminalHandlers] Target window no longer exists:', senderWebContentsId)
          return
        }

        // Convert Schema class to plain object for IPC serialization
        const plainEvent = {
          processId: event.processId,
          type: event.type,
          timestamp: event.timestamp,
          metadata: event.metadata,
        }

        window.webContents.send(`terminal:stream:${processId}`, {
          type: 'event' as const,
          data: plainEvent,
        })
      }

      // Register callbacks with terminal service
      console.log('[TerminalHandlers] Registering callbacks with terminal service')
      const cleanupOutput = yield* terminalService.subscribeToWatcher(processId, sendOutputViaIpc)
      const cleanupEvents = yield* terminalService.subscribeToWatcherEvents(processId, sendEventViaIpc)
      console.log('[TerminalHandlers] Callbacks registered')

      // Store subscription
      subscriptions.set(subscriptionId, {
        id: subscriptionId,
        processId,
        webContentsId: senderWebContentsId,
        cleanupOutput,
        cleanupEvents,
      })

      console.log('[TerminalHandlers] ========== SUBSCRIPTION CREATED:', subscriptionId, '==========')

      // Encode output
      return yield* S.encode(TerminalIpcContracts['terminal:subscribe-to-watcher'].output)({ subscriptionId })
    })

    return await Effect.runPromise(program)
  })
  console.log('[TerminalHandlers] subscribe-to-watcher handler registered')

  // Unsubscribe from watcher
  console.log('[TerminalHandlers] Registering unsubscribe-from-watcher handler')
  registerIpcHandler(
    TerminalIpcContracts['terminal:unsubscribe-from-watcher'],
    ({ subscriptionId }) => Effect.gen(function* () {
      const subscription = subscriptions.get(subscriptionId)
      if (subscription) {
        // Call cleanup functions (removes callbacks from adapter)
        subscription.cleanupOutput()
        subscription.cleanupEvents()
        subscriptions.delete(subscriptionId)
        console.log('[TerminalHandlers] Subscription cleaned up:', subscriptionId)
      }
    })
  )
  console.log('[TerminalHandlers] unsubscribe-from-watcher handler registered')

  console.log('========================================')
  console.log('[TerminalHandlers] ALL TERMINAL HANDLERS REGISTERED')
  console.log('========================================')
})

/**
 * Cleanup all terminal subscriptions (call on app quit)
 */
export const cleanupTerminalSubscriptions = Effect.sync(() => {
  for (const subscription of subscriptions.values()) {
    subscription.cleanupOutput()
    subscription.cleanupEvents()
  }
  subscriptions.clear()
  console.log('[TerminalHandlers] All subscriptions cleaned up')
})
