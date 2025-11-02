/**
 * Terminal IPC Handlers
 *
 * Handles IPC communication for terminal/watcher management using the generic
 * registerIpcHandler pattern for type-safe, boilerplate-free handler registration.
 */

import { Effect, Stream, Fiber } from 'effect'
import { BrowserWindow } from 'electron'
import { TerminalIpcContracts } from '../../shared/ipc-contracts'
import { TerminalService } from '../terminal/terminal-service'
import { TerminalError } from '../terminal/terminal-port'
import { registerIpcHandler } from './ipc-handler-setup'

/**
 * Subscription tracking for stream-based IPC
 */
interface Subscription {
  id: string
  processId: string
  outputFiber: Fiber.RuntimeFiber<void, TerminalError>
  eventFiber: Fiber.RuntimeFiber<void, TerminalError>
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
  console.log('[TerminalHandlers] Registering subscribe-to-watcher handler')
  registerIpcHandler(
    TerminalIpcContracts['terminal:subscribe-to-watcher'],
    ({ processId }) => {
      console.log('[TerminalHandlers] ========== SUBSCRIPTION HANDLER CALLED ==========')
      console.log('[TerminalHandlers] ProcessId:', processId)
      return Effect.gen(function* () {
        console.log('[TerminalHandlers] ========== INSIDE EFFECT.GEN ==========')
        console.log('[TerminalHandlers] Subscribing to watcher:', processId)
      const subscriptionId = `sub-${processId}-${Date.now()}`

      // Get output and event streams
      console.log('[TerminalHandlers] Getting streams from terminal service')
      const outputStream = terminalService.subscribeToWatcher(processId)
      const eventStream = terminalService.subscribeToWatcherEvents(processId)
      console.log('[TerminalHandlers] Got streams')

      // Create fiber to run output stream and send via IPC
      console.log('[TerminalHandlers] Creating output fiber')
      console.log('[TerminalHandlers] Output stream object:', typeof outputStream)
      console.log('[TerminalHandlers] Output stream:', outputStream)
      const outputFiber = yield* outputStream.pipe(
        Stream.tap((chunk) => Effect.sync(() => {
          console.log('[TerminalHandlers] !!!!! Sending output chunk to renderer:', chunk.data.substring(0, 50))
          // Send to all renderer windows (check if not destroyed)
          const windows = BrowserWindow.getAllWindows()
          console.log('[TerminalHandlers] Sending to', windows.length, 'windows')
          windows.forEach((window) => {
            if (!window.isDestroyed() && window.webContents && !window.webContents.isDestroyed()) {
              window.webContents.send(`terminal:stream:${processId}`, {
                type: 'output' as const,
                data: chunk,
              })
            }
          })
        })),
        Stream.tap(() => Effect.sync(() => {
          console.log('[TerminalHandlers] Stream.runDrain is consuming')
        })),
        Stream.runDrain,
        Effect.tap(() => Effect.sync(() => {
          console.log('[TerminalHandlers] Stream.runDrain completed!')
        })),
        Effect.catchAllCause((cause) => Effect.sync(() => {
          console.error('[TerminalHandlers] !!! Stream fiber error:', cause)
        })),
        Effect.fork
      )

      // Monitor fiber status
      Effect.runSync(Effect.sync(() => {
        console.log('[TerminalHandlers] Output fiber forked, monitoring...')
        setTimeout(() => {
          console.log('[TerminalHandlers] Checking fiber status after 1s')
        }, 1000)
      }))
      console.log('[TerminalHandlers] Output fiber created')

      // Create fiber to run event stream and send via IPC
      console.log('[TerminalHandlers] Creating event fiber')
      const eventFiber = yield* eventStream.pipe(
        Stream.tap((event) => Effect.sync(() => {
          console.log('[TerminalHandlers] Sending event to renderer:', event.type)
          // Send to all renderer windows (check if not destroyed)
          const windows = BrowserWindow.getAllWindows()
          windows.forEach((window) => {
            if (!window.isDestroyed() && window.webContents && !window.webContents.isDestroyed()) {
              window.webContents.send(`terminal:stream:${processId}`, {
                type: 'event' as const,
                data: event,
              })
            }
          })
        })),
        Stream.runDrain,
        Effect.fork
      )
      console.log('[TerminalHandlers] Event fiber created')

      // Store subscription
      subscriptions.set(subscriptionId, {
        id: subscriptionId,
        processId,
        outputFiber,
        eventFiber,
      })

      console.log('[TerminalHandlers] ========== SUBSCRIPTION CREATED:', subscriptionId, '==========')
      return { subscriptionId }
      })
    }
  )
  console.log('[TerminalHandlers] subscribe-to-watcher handler registered')

  // Unsubscribe from watcher
  console.log('[TerminalHandlers] Registering unsubscribe-from-watcher handler')
  registerIpcHandler(
    TerminalIpcContracts['terminal:unsubscribe-from-watcher'],
    ({ subscriptionId }) => Effect.gen(function* () {
      const subscription = subscriptions.get(subscriptionId)
      if (subscription) {
        // Interrupt both fibers
        yield* Fiber.interrupt(subscription.outputFiber)
        yield* Fiber.interrupt(subscription.eventFiber)
        subscriptions.delete(subscriptionId)
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
export const cleanupTerminalSubscriptions = Effect.gen(function* () {
  for (const subscription of subscriptions.values()) {
    yield* Fiber.interrupt(subscription.outputFiber)
    yield* Fiber.interrupt(subscription.eventFiber)
  }
  subscriptions.clear()
})
