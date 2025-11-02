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

// Track active subscription keys to prevent duplicates
const activeSubscriptionKeys = new Set<string>()

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

    // Pre-decode input to get processId synchronously
    const decoded = S.decodeUnknownSync(TerminalIpcContracts['terminal:subscribe-to-watcher'].input)(input)
    const processId = decoded.processId
    const senderWebContentsId = event.sender.id
    const subscriptionKey = `${processId}-${senderWebContentsId}`

    console.log('[TerminalHandlers] ProcessId:', processId)
    console.log('[TerminalHandlers] Checking for duplicates - key:', subscriptionKey)
    console.log('[TerminalHandlers] Active keys:', Array.from(activeSubscriptionKeys))

    // CRITICAL: Check and mark SYNCHRONOUSLY before Effect runs
    // This prevents race condition in StrictMode double-mount
    if (activeSubscriptionKeys.has(subscriptionKey)) {
      console.log('[TerminalHandlers] ⚠️ Duplicate subscription detected - cleaning up old subscription first')

      // Find and cleanup the old subscription
      for (const [id, sub] of subscriptions.entries()) {
        if (sub.processId === processId && sub.webContentsId === senderWebContentsId) {
          console.log('[TerminalHandlers] Cleaning up old subscription:', id)
          sub.cleanupOutput()
          sub.cleanupEvents()
          subscriptions.delete(id)
          activeSubscriptionKeys.delete(subscriptionKey)
          break
        }
      }
    }

    // Mark as active IMMEDIATELY to block concurrent calls
    activeSubscriptionKeys.add(subscriptionKey)
    console.log('[TerminalHandlers] Marked subscription key as active:', subscriptionKey)

    const program = Effect.gen(function* () {

      const subscriptionId = `sub-${processId}-${Date.now()}`

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

    try {
      return await Effect.runPromise(program)
    } catch (error) {
      // If subscription fails, remove the key so it can be retried
      console.error('[TerminalHandlers] Subscription failed, cleaning up key:', subscriptionKey, error)
      activeSubscriptionKeys.delete(subscriptionKey)
      throw error
    }
  })
  console.log('[TerminalHandlers] subscribe-to-watcher handler registered')

  // Unsubscribe from watcher
  console.log('[TerminalHandlers] Registering unsubscribe-from-watcher handler')
  registerIpcHandler(
    TerminalIpcContracts['terminal:unsubscribe-from-watcher'],
    ({ subscriptionId }) => Effect.gen(function* () {
      const subscription = subscriptions.get(subscriptionId)
      if (subscription) {
        // Remove from active tracking
        const subscriptionKey = `${subscription.processId}-${subscription.webContentsId}`
        activeSubscriptionKeys.delete(subscriptionKey)

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
 * Cleanup subscriptions for a specific webContents (call when window closes)
 */
export const cleanupSubscriptionsForWindow = (webContentsId: number) => Effect.sync(() => {
  console.log('[TerminalHandlers] Cleaning up subscriptions for window:', webContentsId)
  const activeSubKeys = new Set<string>()

  for (const [id, subscription] of subscriptions.entries()) {
    if (subscription.webContentsId === webContentsId) {
      console.log('[TerminalHandlers] Cleaning up subscription:', id)

      // Remove from active tracking
      const subscriptionKey = `${subscription.processId}-${subscription.webContentsId}`
      activeSubKeys.add(subscriptionKey)

      // Call cleanup functions
      subscription.cleanupOutput()
      subscription.cleanupEvents()
      subscriptions.delete(id)
    }
  }

  // Clean up tracking keys
  for (const key of activeSubKeys) {
    activeSubscriptionKeys.delete(key)
  }
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
  activeSubscriptionKeys.clear()
  console.log('[TerminalHandlers] All subscriptions cleaned up')
})
