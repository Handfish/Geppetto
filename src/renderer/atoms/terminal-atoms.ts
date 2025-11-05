import { Atom } from '@effect-atom/atom-react'
import { Effect, Duration } from 'effect'
import { Reactivity } from '@effect/experimental'
import { ElectronIpcClient } from '../lib/ipc-client'
import type { RunnerInfo, ProcessState, OutputChunk, ProcessEvent } from '../../shared/schemas/terminal'

/**
 * Terminal Atoms - Reactive state management for terminal/runner processes
 *
 * Provides atoms for:
 * - Listing all active runners
 * - Getting individual runner states
 * - Managing terminal output buffers
 * - Terminal subscription management
 */

// Reactivity service is automatically available in Atom.runtime
const terminalRuntime = Atom.runtime(ElectronIpcClient.Default)

/**
 * List all active runners
 * Refreshes every 30 seconds
 * Components can manually refresh via useAtomRefresh for real-time updates
 */
export const activeRunnersAtom = terminalRuntime
  .atom(
    Effect.gen(function* () {
      const client = yield* ElectronIpcClient
      return yield* client.invoke('terminal:list-active-runners', undefined)
    })
  )
  .pipe(
    Atom.withReactivity(['terminal:runners']),
    Atom.setIdleTTL(Duration.seconds(30))
  )

/**
 * Get individual runner state by process ID
 * Refreshes every 10 seconds (for real-time status updates)
 * Use activeRunnersAtom when possible to reduce IPC calls
 */
export const runnerStateAtom = Atom.family((processId: string) =>
  terminalRuntime
    .atom(
      Effect.gen(function* () {
        const client = yield* ElectronIpcClient
        return yield* client.invoke('terminal:get-runner-state', { processId })
      })
    )
    .pipe(
      Atom.withReactivity(['terminal:runner:state', processId]),
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

// Track which terminals have had their buffer restored in this session
// This prevents duplicate restoration when switching between terminals
const bufferRestoredSet = new Set<string>()

export const runnerOutputAtom = Atom.family((processId: string) =>
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
  // Also clear the restored flag so buffer can be restored again if needed
  bufferRestoredSet.delete(processId)
}

/**
 * Global status refresh callbacks
 * Components register callbacks that get invoked when status updates occur
 */
const statusRefreshCallbacks = new Set<() => void>()

/**
 * Register a callback to be invoked on status updates
 */
export function onStatusUpdate(callback: () => void): () => void {
  console.log('[Terminal Atoms] Registering status update callback')
  statusRefreshCallbacks.add(callback)
  return () => {
    console.log('[Terminal Atoms] Unregistering status update callback')
    statusRefreshCallbacks.delete(callback)
  }
}

/**
 * Trigger all registered status update callbacks
 */
export function triggerStatusUpdate() {
  console.log('[Terminal Atoms] ⚡ Triggering status update, notifying', statusRefreshCallbacks.size, 'callbacks')
  for (const callback of statusRefreshCallbacks) {
    callback()
  }
}

/**
 * Check if buffer has been restored for this processId
 */
export function isBufferRestored(processId: string): boolean {
  return bufferRestoredSet.has(processId)
}

/**
 * Mark buffer as restored for this processId
 */
export function markBufferRestored(processId: string): void {
  bufferRestoredSet.add(processId)
}

/**
 * Terminal Subscription Manager
 * Manages IPC streaming subscriptions for terminal output and events
 */
class TerminalSubscriptionManager {
  private subscriptions = new Map<string, string>() // processId -> subscriptionId
  private listeners = new Map<string, (message: { type: 'output' | 'event', data: any }) => void>() // Note: preload removes event param
  private callbacks = new Map<string, (data: OutputChunk | ProcessEvent) => void>() // Track current callback per processId
  private listenerAttached = new Set<string>() // Track which processIds have listeners attached (prevents duplicates in StrictMode)

  subscribe(processId: string, onData: (data: OutputChunk | ProcessEvent) => void) {
    console.log('[TerminalSubscriptionManager] Subscribe called for:', processId)
    return Effect.gen(function* (this: TerminalSubscriptionManager) {
      // Always update the callback - allows StrictMode remounts to update the closure
      this.callbacks.set(processId, onData)
      console.log('[TerminalSubscriptionManager] Updated callback for:', processId)

      // ALWAYS create backend subscription first - backend will cleanup duplicates
      // This is critical for StrictMode: both mounts need to call backend so second can cleanup first
      console.log('[TerminalSubscriptionManager] Creating backend subscription for:', processId)
      const client = yield* ElectronIpcClient
      const result = yield* client.invoke('terminal:subscribe-to-runner', { processId })
      const subscriptionId = result.subscriptionId
      console.log('[TerminalSubscriptionManager] Got subscription ID:', subscriptionId)
      this.subscriptions.set(processId, subscriptionId)

      // If IPC listener already attached for this processId, don't attach another
      if (this.listenerAttached.has(processId)) {
        console.log('[TerminalSubscriptionManager] IPC listener already attached, reusing it')
        // Return a no-op unsubscribe - don't destroy the shared listener!
        return { unsubscribe: () => {
          console.log('[TerminalSubscriptionManager] No-op unsubscribe (listener shared) for:', processId)
          // Callback will be updated on next mount, don't delete anything
        }}
      }

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

          // Notify subscriber - use current callback from Map (not closure!)
          const currentCallback = this.callbacks.get(processId)
          if (currentCallback) {
            console.log('[TerminalSubscriptionManager] >>> Calling onData callback')
            currentCallback(chunk)
            console.log('[TerminalSubscriptionManager] >>> onData callback completed')
          }
        } else if (message.type === 'event') {
          const event = message.data as ProcessEvent
          console.log('[TerminalSubscriptionManager] >>> Event type:', event.type)

          // Trigger status update on status changes (push-based update)
          if (event.type === 'idle' || event.type === 'active' || event.type === 'started' || event.type === 'stopped') {
            console.log('[TerminalSubscriptionManager] Triggering status update for:', event.type)
            triggerStatusUpdate()
          }

          // Notify subscriber - use current callback from Map (not closure!)
          const currentCallback = this.callbacks.get(processId)
          if (currentCallback) {
            currentCallback(event)
          }
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

  /**
   * Unsubscribe (no-op - keep everything alive for fast switching)
   * Use destroy() to fully tear down a subscription when killing a runner
   */
  unsubscribe(processId: string) {
    console.log('[TerminalSubscriptionManager] Unsubscribe called for:', processId)
    // No-op - keep callback and listener alive for fast terminal switching
    // The callback will be updated on next mount via line 149
  }

  /**
   * Destroy a subscription completely (for when runner is killed)
   */
  destroy(processId: string) {
    console.log('[TerminalSubscriptionManager] Destroying subscription for:', processId)

    const subscriptionId = this.subscriptions.get(processId)
    const listener = this.listeners.get(processId)

    if (subscriptionId) {
      // Call IPC to unsubscribe
      Effect.gen(function* () {
        const client = yield* ElectronIpcClient
        yield* client.invoke('terminal:unsubscribe-from-runner', { subscriptionId })
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

    // Clean up callback
    this.callbacks.delete(processId)
  }

  destroyAll() {
    Array.from(this.subscriptions.keys()).forEach((processId) => {
      this.destroy(processId)
    })
  }
}

export const terminalSubscriptionManager = new TerminalSubscriptionManager()

/**
 * Spawn a new AI runner
 * Invalidates runner list on success
 */
export const spawnRunnerAtom = terminalRuntime.fn(
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
      return yield* client.invoke('terminal:spawn-runner', input)
    }),
  {
    reactivityKeys: ['terminal:runners'],
  }
)

/**
 * Kill a runner
 * Invalidates runner list and specific runner state
 */
export const killRunnerAtom = terminalRuntime.fn(
  (processId: string) =>
    Effect.gen(function* () {
      const client = yield* ElectronIpcClient
      yield* client.invoke('terminal:kill-runner', { processId })

      // Destroy subscription completely
      terminalSubscriptionManager.destroy(processId)

      // Clear output buffer
      clearOutputBuffer(processId)
    }),
  {
    reactivityKeys: ['terminal:runners', 'terminal:runner:state'],
  }
)

/**
 * Kill all runners
 * Invalidates runner list
 */
export const killAllRunnersAtom = terminalRuntime.fn(
  () =>
    Effect.gen(function* () {
      const client = yield* ElectronIpcClient
      yield* client.invoke('terminal:kill-all-runners', undefined)

      // Destroy all subscriptions
      terminalSubscriptionManager.destroyAll()

      // Clear all output buffers
      outputBuffers.clear()
    }),
  {
    reactivityKeys: ['terminal:runners'],
  }
)

/**
 * Restart a runner
 * Invalidates runner list and specific runner state
 */
export const restartRunnerAtom = terminalRuntime.fn(
  (processId: string) =>
    Effect.gen(function* () {
      const client = yield* ElectronIpcClient
      return yield* client.invoke('terminal:restart-runner', { processId })
    }),
  {
    reactivityKeys: ['terminal:runners', 'terminal:runner:state'],
  }
)

/**
 * Write data to a runner's terminal
 * No reactivity keys - this is a terminal input action
 */
export const writeToRunnerAtom = terminalRuntime.fn(
  (params: { processId: string; data: string }) =>
    Effect.gen(function* () {
      const client = yield* ElectronIpcClient
      yield* client.invoke('terminal:write-to-runner', params)
    }),
  {
    reactivityKeys: [], // No data changes, just sends input
  }
)

/**
 * Resize a runner's terminal
 * No reactivity keys - this is a terminal resize action
 */
export const resizeRunnerAtom = terminalRuntime.fn(
  (params: { processId: string; rows: number; cols: number }) =>
    Effect.gen(function* () {
      const client = yield* ElectronIpcClient
      yield* client.invoke('terminal:resize-runner', params)
    }),
  {
    reactivityKeys: [], // No data changes, just resizes terminal
  }
)
