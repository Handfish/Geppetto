/**
 * AI Watchers module - Process monitoring and AI agent lifecycle management
 *
 * HEXAGONAL ARCHITECTURE:
 * This module follows the ports and adapters pattern similar to AI/VCS providers:
 *
 * ```
 * Ports (contracts)          Adapters (implementations)       Services (orchestration)
 * ─────────────────         ────────────────────────────     ─────────────────────────
 * ProcessMonitorPort   ←──  NodeProcessMonitorAdapter   ←──  AiWatcherService
 * SessionManagerPort   ←──  TmuxSessionManagerAdapter   ←──  (uses both adapters)
 * AiWatcherPort        ←──  AiWatcherService
 * ```
 *
 * KEY DIFFERENCE from AI/VCS providers:
 * - AI Providers: Multiple implementations per port (OpenAI, Claude, Cursor)
 * - VCS Providers: Multiple implementations per port (GitHub, GitLab, Bitbucket)
 * - AI Watchers: Single implementation per port (NodeProcessMonitor, TmuxSessionManager)
 *
 * Therefore: NO registry service needed. Adapters are directly injected via dependencies.
 *
 * This module provides:
 * - Process monitoring with silence detection (Node.js child_process implementation)
 * - Session management (Tmux multiplexer implementation, can be swapped with Screen/Docker)
 * - AI agent lifecycle orchestration
 * - Log streaming and batching
 */

import { Layer } from 'effect'
import { WatcherAdaptersLayer } from './adapters'
import { AiWatcherService } from './services'

/**
 * Complete AI Watchers layer with all dependencies
 *
 * LAYER COMPOSITION: All adapters and services are merged at the top level.
 * This makes adapters available to:
 * 1. AiWatcherService (via dependencies array)
 * 2. IPC handlers (for adapter-specific operations like listing tmux sessions)
 *
 * This follows the same pattern as AI/VCS domains, just without the registry layer.
 *
 * MEMOIZATION: Adapters are constructed once and shared across all consumers.
 */
export const AiWatchersLayer = Layer.mergeAll(
  WatcherAdaptersLayer,
  AiWatcherService.Default
)

// Re-export for convenient access
export { WatcherAdaptersLayer }
export { AiWatcherService }
export { NodeProcessMonitorAdapter } from './adapters/process-monitor'
export { TmuxSessionManagerAdapter } from './adapters/tmux-session-manager'

// Re-export from submodules
export * from './adapters'
export * from './services'

// Re-export types
export * from './ports'
export * from './schemas'
export * from './errors'
