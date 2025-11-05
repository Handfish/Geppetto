/**
 * Process-Runners Adapters Barrel Export
 *
 * Composes all adapters for the Process-Runners domain.
 * Two separate adapters:
 * - ProcessMonitorAdapter: Low-level process I/O (via Node.js)
 * - SessionManagerAdapter: High-level session mgmt (via Tmux)
 */

export { RunnerAdaptersLayer } from './adapters-layer'
export * from './process-monitor'
export * from './tmux-session-manager'
