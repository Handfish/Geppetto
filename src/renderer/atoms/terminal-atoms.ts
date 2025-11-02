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
 * Stores raw output chunks (not split by newlines!)
 * Updated via terminal subscription manager
 *
 * NOTE: XTerm.js has its own internal buffer, so this is primarily for debugging
 * or potential future features like saving terminal history.
 */
interface OutputBuffer {
  chunks: string[]  // Raw chunks, not lines!
  maxChunks: number
}

const outputBuffers = new Map<string, OutputBuffer>()

export const watcherOutputAtom = Atom.family((processId: string) =>
  terminalRuntime.atom(
    Effect.gen(function* () {
      // Initialize buffer if needed
      if (!outputBuffers.has(processId)) {
        outputBuffers.set(processId, {
          chunks: [],
          maxChunks: 1000,
        })
      }

      return outputBuffers.get(processId)!.chunks
    })
  ).pipe(
    Atom.withReactivity(['terminal:output', processId])
  )
)

/**
 * Helper function to append output to buffer
 * Called by terminal subscription manager
 * Stores RAW chunks without splitting - XTerm handles display
 */
export function appendToOutputBuffer(processId: string, data: string) {
  const buffer = outputBuffers.get(processId)
  if (buffer) {
    // Store raw chunk - do NOT split by newlines!
    buffer.chunks.push(data)

    // Trim to max chunks
    if (buffer.chunks.length > buffer.maxChunks) {
      buffer.chunks = buffer.chunks.slice(-buffer.maxChunks)
    }
  }
}

/**
 * Helper function to clear output buffer
 */
export function clearOutputBuffer(processId: string) {
  const buffer = outputBuffers.get(processId)
  if (buffer) {
    buffer.chunks = []
  }
}

/**
 * Terminal Subscription Manager
 * Manages IPC streaming subscriptions for terminal output and events
 */
class TerminalSubscriptionManager {
  private subscriptions = new Map<string, string>() // processId -> subscriptionId
  private listeners = new Map<string, (message: { type: 'output' | 'event', data: any }) => void>() // Note: preload removes event param
  private listenerAttached = new Set<string>() // Track which processIds have listeners attached (prevents duplicates in StrictMode)

  subscribe(processId: string, onData: (data: OutputChunk | ProcessEvent) => void) {
    console.log('[TerminalSubscriptionManager] Subscribe called for:', processId)
    return Effect.gen(function* (this: TerminalSubscriptionManager) {
      // If IPC listener already attached for this processId, don't attach another
      if (this.listenerAttached.has(processId)) {
        console.log('[TerminalSubscriptionManager] IPC listener already attached for:', processId)
        return { unsubscribe: () => this.unsubscribe(processId) }
      }

      console.log('[TerminalSubscriptionManager] Invoking terminal:subscribe-to-watcher')
      const client = yield* ElectronIpcClient
      const result = yield* client.invoke('terminal:subscribe-to-watcher', { processId })
      const subscriptionId = result.subscriptionId
      console.log('[TerminalSubscriptionManager] Got subscription ID:', subscriptionId)

      this.subscriptions.set(processId, subscriptionId)

      // Set up IPC listener
      // Note: preload script removes the event parameter, so listener only receives message
      const listener = (message: { type: 'output' | 'event', data: any }) => {
        console.log('[TerminalSubscriptionManager] !!!!! IPC MESSAGE RECEIVED !!!!!')
        console.log('[TerminalSubscriptionManager] Channel:', `terminal:stream:${processId}`)
        console.log('[TerminalSubscriptionManager] Message:', message)
        console.log('[TerminalSubscriptionManager] Message type:', message?.type)
        console.log('[TerminalSubscriptionManager] Message data:', message?.data)

        if (message.type === 'output') {
          const chunk = message.data as OutputChunk
          console.log('[TerminalSubscriptionManager] >>> Output chunk data:', chunk.data.substring(0, 100))
          console.log('[TerminalSubscriptionManager] >>> Output chunk length:', chunk.data.length)

          // Update output buffer
          appendToOutputBuffer(processId, chunk.data)

          // Notify subscriber
          console.log('[TerminalSubscriptionManager] >>> Calling onData callback')
          onData(chunk)
          console.log('[TerminalSubscriptionManager] >>> onData callback completed')
        } else if (message.type === 'event') {
          const event = message.data as ProcessEvent
          console.log('[TerminalSubscriptionManager] >>> Event type:', event.type)
          onData(event)
        }
      }

      this.listeners.set(processId, listener)
      console.log('[TerminalSubscriptionManager] Registering IPC listener for channel:', `terminal:stream:${processId}`)
      window.electron.ipcRenderer.on(`terminal:stream:${processId}`, listener)

      // Mark listener as attached to prevent duplicates
      this.listenerAttached.add(processId)

      console.log('[TerminalSubscriptionManager] Subscription complete')
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
      Effect.gen(function* () {
        const client = yield* ElectronIpcClient
        yield* client.invoke('terminal:unsubscribe-from-watcher', { subscriptionId })
      }).pipe(
        Effect.provide(ElectronIpcClient.Default),
        Effect.runPromise
      ).catch(console.error)

      this.subscriptions.delete(processId)
    }

    if (listener) {
      console.log('[TerminalSubscriptionManager] Removing IPC listener for:', processId)
      window.electron.ipcRenderer.removeListener(`terminal:stream:${processId}`, listener)
      this.listeners.delete(processId)
      this.listenerAttached.delete(processId) // Remove from tracking set
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
  (params: { processId: string; data: string }) =>
    Effect.gen(function* () {
      const client = yield* ElectronIpcClient
      yield* client.invoke('terminal:write-to-watcher', params)
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
  (params: { processId: string; rows: number; cols: number }) =>
    Effect.gen(function* () {
      const client = yield* ElectronIpcClient
      yield* client.invoke('terminal:resize-watcher', params)
    }),
  {
    reactivityKeys: [], // No data changes, just resizes terminal
  }
)
