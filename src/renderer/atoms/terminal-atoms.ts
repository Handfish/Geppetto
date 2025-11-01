import { Atom } from '@effect-atom/atom-react'
import { Effect, Duration } from 'effect'
import { ElectronIpcClient } from '../lib/ipc-client'
import type { WatcherInfo, ProcessState, OutputChunk, ProcessEvent } from '../../shared/schemas/terminal'

/**
 * Terminal Atoms - Reactive state management for terminal/watcher processes
 *
 * Provides atoms for:
 * - Listing all active watchers
 * - Getting individual watcher states
 * - Managing terminal output buffers
 * - Terminal subscription management
 */

const terminalRuntime = Atom.runtime(ElectronIpcClient.Default)

/**
 * List all active watchers
 * Refreshes every 30 seconds
 * Components can manually refresh via useAtomRefresh for real-time updates
 */
export const activeWatchersAtom = terminalRuntime
  .atom(
    Effect.gen(function* () {
      const client = yield* ElectronIpcClient
      return yield* client.invoke('terminal:list-active-watchers', undefined)
    })
  )
  .pipe(
    Atom.withReactivity(['terminal:watchers']),
    Atom.setIdleTTL(Duration.seconds(30))
  )

/**
 * Get individual watcher state by process ID
 * Refreshes every 10 seconds (for real-time status updates)
 * Use activeWatchersAtom when possible to reduce IPC calls
 */
export const watcherStateAtom = Atom.family((processId: string) =>
  terminalRuntime
    .atom(
      Effect.gen(function* () {
        const client = yield* ElectronIpcClient
        return yield* client.invoke('terminal:get-watcher-state', { processId })
      })
    )
    .pipe(
      Atom.withReactivity(['terminal:watcher:state', processId]),
      Atom.setIdleTTL(Duration.seconds(10))
    )
)

/**
 * Terminal output buffer atom (client-side storage)
 * Stores last N lines of output per process
 * Updated via terminal subscription manager
 */
interface OutputBuffer {
  lines: string[]
  maxLines: number
}

const outputBuffers = new Map<string, OutputBuffer>()

export const watcherOutputAtom = Atom.family((processId: string) =>
  terminalRuntime.atom(
    Effect.gen(function* () {
      // Initialize buffer if needed
      if (!outputBuffers.has(processId)) {
        outputBuffers.set(processId, {
          lines: [],
          maxLines: 1000,
        })
      }

      return outputBuffers.get(processId)!.lines
    })
  ).pipe(
    Atom.withReactivity(['terminal:output', processId])
  )
)

/**
 * Helper function to append output to buffer
 * Called by terminal subscription manager
 */
export function appendToOutputBuffer(processId: string, data: string) {
  const buffer = outputBuffers.get(processId)
  if (buffer) {
    const newLines = data.split('\n')
    buffer.lines.push(...newLines)

    // Trim to max lines
    if (buffer.lines.length > buffer.maxLines) {
      buffer.lines = buffer.lines.slice(-buffer.maxLines)
    }
  }
}

/**
 * Helper function to clear output buffer
 */
export function clearOutputBuffer(processId: string) {
  const buffer = outputBuffers.get(processId)
  if (buffer) {
    buffer.lines = []
  }
}

/**
 * Terminal Subscription Manager
 * Manages IPC streaming subscriptions for terminal output and events
 */
class TerminalSubscriptionManager {
  private subscriptions = new Map<string, string>() // processId -> subscriptionId
  private listeners = new Map<string, (event: any, data: any) => void>()

  subscribe(processId: string, onData: (data: OutputChunk | ProcessEvent) => void) {
    return Effect.gen(function* (this: TerminalSubscriptionManager) {
      // If already subscribed, just add listener
      if (this.subscriptions.has(processId)) {
        return { unsubscribe: () => this.unsubscribe(processId) }
      }

      const client = yield* ElectronIpcClient
      const result = yield* client.invoke('terminal:subscribe-to-watcher', { processId })
      const subscriptionId = result.subscriptionId

      this.subscriptions.set(processId, subscriptionId)

      // Set up IPC listener
      const listener = (_event: any, message: { type: 'output' | 'event', data: any }) => {
        if (message.type === 'output') {
          const chunk = message.data as OutputChunk

          // Update output buffer
          appendToOutputBuffer(processId, chunk.data)

          // Notify subscriber
          onData(chunk)
        } else if (message.type === 'event') {
          const event = message.data as ProcessEvent
          onData(event)
        }
      }

      this.listeners.set(processId, listener)
      window.electron.ipcRenderer.on(`terminal:stream:${processId}`, listener)

      return {
        unsubscribe: () => this.unsubscribe(processId),
      }
    }.bind(this))
  }

  unsubscribe(processId: string) {
    const subscriptionId = this.subscriptions.get(processId)
    const listener = this.listeners.get(processId)

    if (subscriptionId) {
      // Call IPC to unsubscribe
      ElectronIpcClient.pipe(
        Effect.flatMap((client) => client.invoke('terminal:unsubscribe-from-watcher', { subscriptionId })),
        Effect.runPromise
      ).catch(console.error)

      this.subscriptions.delete(processId)
    }

    if (listener) {
      window.electron.ipcRenderer.removeListener(`terminal:stream:${processId}`, listener)
      this.listeners.delete(processId)
    }
  }

  unsubscribeAll() {
    Array.from(this.subscriptions.keys()).forEach((processId) => {
      this.unsubscribe(processId)
    })
  }
}

export const terminalSubscriptionManager = new TerminalSubscriptionManager()

/**
 * Spawn a new AI watcher
 * Invalidates watcher list on success
 */
export const spawnWatcherAtom = terminalRuntime.fn(
  (input: {
    accountId: string
    agentType: string
    prompt: string
    issueContext?: {
      owner: string
      repo: string
      issueNumber: number
      issueTitle: string
      worktreePath: string
      branchName: string
    }
  }) =>
    Effect.gen(function* () {
      const client = yield* ElectronIpcClient
      return yield* client.invoke('terminal:spawn-watcher', input)
    }),
  {
    reactivityKeys: ['terminal:watchers'],
  }
)

/**
 * Kill a watcher
 * Invalidates watcher list and specific watcher state
 */
export const killWatcherAtom = terminalRuntime.fn(
  (processId: string) =>
    Effect.gen(function* () {
      const client = yield* ElectronIpcClient
      yield* client.invoke('terminal:kill-watcher', { processId })

      // Unsubscribe from this watcher
      terminalSubscriptionManager.unsubscribe(processId)

      // Clear output buffer
      clearOutputBuffer(processId)
    }),
  {
    reactivityKeys: ['terminal:watchers', 'terminal:watcher:state'],
  }
)

/**
 * Kill all watchers
 * Invalidates watcher list
 */
export const killAllWatchersAtom = terminalRuntime.fn(
  () =>
    Effect.gen(function* () {
      const client = yield* ElectronIpcClient
      yield* client.invoke('terminal:kill-all-watchers', undefined)

      // Unsubscribe from all watchers
      terminalSubscriptionManager.unsubscribeAll()

      // Clear all output buffers
      outputBuffers.clear()
    }),
  {
    reactivityKeys: ['terminal:watchers'],
  }
)

/**
 * Restart a watcher
 * Invalidates watcher list and specific watcher state
 */
export const restartWatcherAtom = terminalRuntime.fn(
  (processId: string) =>
    Effect.gen(function* () {
      const client = yield* ElectronIpcClient
      return yield* client.invoke('terminal:restart-watcher', { processId })
    }),
  {
    reactivityKeys: ['terminal:watchers', 'terminal:watcher:state'],
  }
)

/**
 * Write data to a watcher's terminal
 * No reactivity keys - this is a terminal input action
 */
export const writeToWatcherAtom = terminalRuntime.fn(
  (processId: string, data: string) =>
    Effect.gen(function* () {
      const client = yield* ElectronIpcClient
      yield* client.invoke('terminal:write-to-watcher', { processId, data })
    }),
  {
    reactivityKeys: [], // No data changes, just sends input
  }
)

/**
 * Resize a watcher's terminal
 * No reactivity keys - this is a terminal resize action
 */
export const resizeWatcherAtom = terminalRuntime.fn(
  (processId: string, rows: number, cols: number) =>
    Effect.gen(function* () {
      const client = yield* ElectronIpcClient
      yield* client.invoke('terminal:resize-watcher', { processId, rows, cols })
    }),
  {
    reactivityKeys: [], // No data changes, just resizes terminal
  }
)
