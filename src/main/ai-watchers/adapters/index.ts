/**
 * AI-Watchers Adapters Barrel Export
 *
 * Composes all adapters for the AI-Watchers domain.
 * Two separate adapters:
 * - ProcessMonitorAdapter: Low-level process I/O (via Node.js)
 * - SessionManagerAdapter: High-level session mgmt (via Tmux)
 */

export { WatcherAdaptersLayer } from './adapters-layer'
export * from './process-monitor'
export * from './tmux-session-manager'
