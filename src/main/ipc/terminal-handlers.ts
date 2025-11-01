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
import { registerIpcHandler } from './ipc-handler-setup'

/**
 * Subscription tracking for stream-based IPC
 */
interface Subscription {
  id: string
  processId: string
  outputFiber: Fiber.RuntimeFiber<void, never>
  eventFiber: Fiber.RuntimeFiber<void, never>
}

// Track active subscriptions
const subscriptions = new Map<string, Subscription>()

/**
 * Setup Terminal IPC handlers
 */
export const setupTerminalIpcHandlers = Effect.gen(function* () {
  const terminalService = yield* TerminalService

  // Spawn AI watcher
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
    () => terminalService.listActiveWatchers().pipe(
      Effect.map((watchers) =>
        watchers.map((w) => ({
          processId: w.processId,
          accountId: w.config.accountId,
          agentType: w.config.agentType,
          prompt: w.config.prompt,
          state: w.state,
          issueContext: w.config.issueContext,
        }))
      )
    )
  )

  // Subscribe to watcher output/events
  registerIpcHandler(
    TerminalIpcContracts['terminal:subscribe-to-watcher'],
    ({ processId }) => Effect.gen(function* () {
      const subscriptionId = `sub-${processId}-${Date.now()}`

      // Get output and event streams
      const outputStream = terminalService.subscribeToWatcher(processId)
      const eventStream = terminalService.subscribeToWatcherEvents(processId)

      // Create fiber to run output stream and send via IPC
      const outputFiber = yield* outputStream.pipe(
        Stream.tap((chunk) => Effect.sync(() => {
          // Send to all renderer windows
          const windows = BrowserWindow.getAllWindows()
          windows.forEach((window) => {
            window.webContents.send(`terminal:stream:${processId}`, {
              type: 'output' as const,
              data: chunk,
            })
          })
        })),
        Stream.runDrain,
        Effect.fork
      )

      // Create fiber to run event stream and send via IPC
      const eventFiber = yield* eventStream.pipe(
        Stream.tap((event) => Effect.sync(() => {
          // Send to all renderer windows
          const windows = BrowserWindow.getAllWindows()
          windows.forEach((window) => {
            window.webContents.send(`terminal:stream:${processId}`, {
              type: 'event' as const,
              data: event,
            })
          })
        })),
        Stream.runDrain,
        Effect.fork
      )

      // Store subscription
      subscriptions.set(subscriptionId, {
        id: subscriptionId,
        processId,
        outputFiber,
        eventFiber,
      })

      return { subscriptionId }
    })
  )

  // Unsubscribe from watcher
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
