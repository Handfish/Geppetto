/**
 * AI Watchers module - Process monitoring and AI agent lifecycle management
 *
 * This module provides:
 * - Process monitoring with silence detection
 * - AI agent lifecycle management
 * - Tmux session integration
 * - Log streaming and batching
 */

import * as Layer from 'effect/Layer'
import { ProcessMonitorService } from './process-monitor-service'
import { AiWatcherService } from './ai-watcher-service'
import { TmuxSessionManager } from './tmux-session-manager'

/**
 * Complete AI Watchers layer with all dependencies
 */
export const AiWatchersLayer = Layer.mergeAll(
  ProcessMonitorService.Default,
  TmuxSessionManager.Default,
  AiWatcherService.Default
)

// Re-export services and types
export { ProcessMonitorService, AiWatcherService, TmuxSessionManager }
export * from './ports'
export * from './schemas'
export * from './errors'
