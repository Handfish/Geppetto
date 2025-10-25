/**
 * Development-only AI Watcher Testing Panel
 *
 * Allows testing AI watcher functionality in development mode.
 * Exposes window.__DEV_AI_WATCHERS__ API in console.
 */

import { useEffect, useRef, useState } from 'react'
import { Result } from '@effect-atom/atom-react'
import {
  useAiWatchers,
  useTmuxSessions,
  useWatcherLogs,
} from '../../hooks/useAiWatchers'
import type {
  AiWatcherConfig,
  AiWatcher,
  TmuxSession,
  LogEntry,
} from '../../../shared/schemas/ai-watchers'

// Helper to clean object by removing undefined properties
// This ensures optional schema fields work correctly over IPC
function cleanConfig<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Partial<T> = {}
  for (const key in obj) {
    if (obj[key] !== undefined) {
      result[key] = obj[key]
    }
  }
  return result
}

const LOG_REFRESH_SCHEDULE_MS = [2000, 5000, 15000] as const
const LOG_REFRESH_MAX_INTERVAL_MS = 30000

/**
 * Component to display logs for a watcher
 */
function WatcherLogsDisplay({
  watcherId,
  autoRefresh,
}: {
  watcherId: string
  autoRefresh: boolean
}) {
  const { logsResult, refreshLogs } = useWatcherLogs(watcherId, 50)
  const logsEndRef = useRef<HTMLDivElement>(null)

  // Auto-refresh logs with a backoff schedule if enabled
  useEffect(() => {
    if (!autoRefresh) return

    let timeoutId: number | undefined
    let cancelled = false
    let scheduleIndex = 0

    const runRefresh = () => {
      if (cancelled) {
        return
      }

      refreshLogs()

      const delay =
        scheduleIndex < LOG_REFRESH_SCHEDULE_MS.length
          ? LOG_REFRESH_SCHEDULE_MS[scheduleIndex]
          : LOG_REFRESH_MAX_INTERVAL_MS

      scheduleIndex = Math.min(
        scheduleIndex + 1,
        LOG_REFRESH_SCHEDULE_MS.length
      )

      timeoutId = window.setTimeout(runRefresh, delay)
    }

    runRefresh()

    return () => {
      cancelled = true
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [autoRefresh, refreshLogs])

  // Auto-scroll to bottom when logs change
  useEffect(() => {
    if (logsResult._tag === 'Success') {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logsResult])

  return (
    <div className="mt-2 border-t border-gray-600 pt-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-400">Logs (last 50 entries)</span>
        <button
          className="px-2 py-1 bg-gray-600 hover:bg-gray-500 text-white rounded text-xs"
          onClick={() => refreshLogs()}
          title="Refresh logs"
        >
          ↻
        </button>
      </div>
      <div className="bg-gray-900 rounded p-2 max-h-64 overflow-y-auto text-xs font-mono">
        {Result.builder(logsResult)
          .onInitial(() => <div className="text-gray-500">Loading logs...</div>)
          .onSuccess(value => {
            const logs = value as readonly LogEntry[]
            if (logs.length === 0) {
              return <div className="text-gray-500">No logs yet</div>
            }
            return (
              <div className="space-y-1">
                {logs.map((log, idx) => (
                  <div
                    className={`${
                      log.level === 'stdout'
                        ? 'text-green-400'
                        : log.level === 'stderr'
                          ? 'text-red-400'
                          : log.level === 'error'
                            ? 'text-red-300'
                            : log.level === 'info'
                              ? 'text-blue-400'
                              : 'text-gray-400'
                    }`}
                    key={idx}
                  >
                    <span className="text-gray-600">
                      [{new Date(log.timestamp).toLocaleTimeString()}]
                    </span>{' '}
                    <span className="text-gray-500">[{log.level}]</span>{' '}
                    {log.message}
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            )
          })
          .onDefect(defect => (
            <div className="text-red-400">
              Error loading logs: {String(defect)}
            </div>
          ))
          .render()}
      </div>
    </div>
  )
}

export function AiWatcherDevPanel() {
  const {
    watchersResult,
    createResult,
    createWatcher,
    stopWatcher,
    startWatcher,
    refreshWatchers,
  } = useAiWatchers()

  const { sessionsResult, attachToSession, refreshSessions } = useTmuxSessions()

  const [showPanel, setShowPanel] = useState(true)
  const [expandedWatcherId, setExpandedWatcherId] = useState<string | null>(
    null
  )
  const [autoRefreshLogs, setAutoRefreshLogs] = useState(false)
  const hasLoggedRef = useRef(false)

  // Log welcome message only once on mount
  useEffect(() => {
    if (process.env.NODE_ENV === 'development' && !hasLoggedRef.current) {
      hasLoggedRef.current = true

      console.log(
        '%c[AI Watcher] Developer panel loaded!',
        'color: #8b5cf6; font-weight: bold'
      )
      console.log(
        '%cUse window.__DEV_AI_WATCHERS__ to interact:',
        'color: #6b7280'
      )
      console.log('  • listWatchers()          - List all AI watchers')
      console.log('  • listTmuxSessions()      - List all tmux sessions')
      console.log(
        '  • createWatcher(config)   - Create new watcher (config: {type, name, workingDirectory, command, args})'
      )
      console.log('  • attachToTmux(name)      - Attach to tmux session')
      console.log('  • stopWatcher(id)         - Stop a watcher')
      console.log('  • startWatcher(id)        - Start a watcher')
      console.log('  • showPanel()             - Show visual panel')
      console.log('  • hidePanel()             - Hide visual panel')
      console.log('  • getResults()            - Get current Results')
      console.log('')
      console.log('Examples:')
      console.log('  window.__DEV_AI_WATCHERS__.listTmuxSessions()')
      console.log('  window.__DEV_AI_WATCHERS__.createWatcher({')
      console.log('    type: "custom",')
      console.log('    name: "MyWatcher",')
      console.log('    workingDirectory: "/tmp",')
      console.log('    command: "bash",')
      console.log('    args: ["-c", "echo test"]')
      console.log('  })')
    }
  }, [])

  // Update API when functions/results change
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      // Expose API to console
      const api = {
        // List operations
        listWatchers: () => {
          console.log('[AI Watcher] Listing watchers...')
          refreshWatchers()
          const watchers = Result.getOrElse(
            watchersResult,
            () => []
          ) as readonly AiWatcher[]
          if (watchers && watchers.length > 0) {
            console.table(
              watchers.map(w => ({
                id: w.id,
                name: w.name,
                type: w.type,
                status: w.status,
                pid: w.processHandle.pid,
              }))
            )
          }
          return watchers
        },

        listTmuxSessions: () => {
          console.log('[AI Watcher] Listing tmux sessions...')
          refreshSessions()
          const sessions = Result.getOrElse(
            sessionsResult,
            () => []
          ) as readonly TmuxSession[]
          if (sessions && sessions.length > 0) {
            console.table(
              sessions.map(s => ({
                name: s.name,
                attached: s.attached,
                created: s.created.toISOString(),
              }))
            )
          }
          return sessions
        },

        // Create operations
        createWatcher: (config: Partial<AiWatcherConfig>) => {
          console.log('[AI Watcher] Creating watcher...', config)
          // Build config with defaults and remove undefined fields for Effect Schema
          const fullConfig = cleanConfig({
            type: config.type || 'custom',
            workingDirectory: config.workingDirectory || '/tmp',
            name: config.name,
            command: config.command,
            args: config.args,
            env: config.env,
          })

          createWatcher(fullConfig as AiWatcherConfig)
          setTimeout(() => refreshWatchers(), 500)
          console.log(
            '[AI Watcher] Create request sent. Watchers will refresh.'
          )
        },

        attachToTmux: (sessionName: string) => {
          console.log('[AI Watcher] Attaching to tmux session:', sessionName)
          attachToSession(sessionName)
          setTimeout(() => refreshWatchers(), 500)
          console.log(
            '[AI Watcher] Attach request sent. Watchers will refresh.'
          )
        },

        // Control operations
        stopWatcher: (watcherId: string) => {
          console.log('[AI Watcher] Stopping watcher:', watcherId)
          stopWatcher(watcherId)
          setTimeout(() => refreshWatchers(), 500)
        },

        startWatcher: (watcherId: string) => {
          console.log('[AI Watcher] Starting watcher:', watcherId)
          startWatcher(watcherId)
          setTimeout(() => refreshWatchers(), 500)
        },

        // UI toggle
        showPanel: () => setShowPanel(true),
        hidePanel: () => setShowPanel(false),
        togglePanel: () => setShowPanel(prev => !prev),

        // Results
        getResults: () => ({
          watchers: watchersResult,
          sessions: sessionsResult,
          createResult,
        }),
      }

      ;(window as any).__DEV_AI_WATCHERS__ = api
    }

    return () => {
      if (process.env.NODE_ENV === 'development') {
        delete (window as any).__DEV_AI_WATCHERS__
      }
    }
  }, [
    watchersResult,
    sessionsResult,
    createResult,
    createWatcher,
    stopWatcher,
    startWatcher,
    attachToSession,
    refreshWatchers,
    refreshSessions,
  ])

  if (!showPanel) return null

  return (
    <div className="fixed bottom-4 right-4 w-96 bg-gray-800 border border-purple-500 rounded-lg shadow-2xl z-50">
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <h3 className="text-purple-400 font-bold">AI Watcher Dev Panel</h3>
        <button
          className="text-gray-400 hover:text-white"
          onClick={() => setShowPanel(false)}
        >
          ✕
        </button>
      </div>

      <div className="p-4 space-y-4 max-h-96 overflow-y-auto">
        {/* Tmux Sessions Section */}
        <div>
          <h4 className="text-sm font-semibold text-gray-300 mb-2">
            Tmux Sessions
          </h4>
          <button
            className="w-full px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded"
            onClick={() =>
              (window as any).__DEV_AI_WATCHERS__.listTmuxSessions()
            }
          >
            List Tmux Sessions
          </button>

          <div className="mt-2">
            {Result.builder(sessionsResult)
              .onInitial(() => (
                <div className="text-xs text-gray-500">
                  Click button to load sessions...
                </div>
              ))
              .onSuccess(value => {
                const sessions = value as readonly TmuxSession[]
                if (sessions.length > 0) {
                  return (
                    <div className="space-y-1">
                      {sessions.map(session => (
                        <div
                          className="text-xs p-2 bg-gray-700 rounded flex justify-between items-center"
                          key={session.name}
                        >
                          <span className="text-gray-300">{session.name}</span>
                          <button
                            className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs"
                            onClick={() => {
                              attachToSession(session.name)
                              // Refresh watchers list after a short delay to show the new watcher
                              setTimeout(() => refreshWatchers(), 500)
                            }}
                          >
                            Attach
                          </button>
                        </div>
                      ))}
                    </div>
                  )
                }
                return (
                  <div className="text-xs text-gray-500">No tmux sessions</div>
                )
              })
              .onDefect(defect => (
                <div className="text-xs text-red-400">
                  Error: {String(defect)}
                </div>
              ))
              .render()}
          </div>
        </div>

        {/* AI Watchers Section */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-gray-300">AI Watchers</h4>
            <label className="flex items-center gap-2 text-xs text-gray-400">
              <input
                checked={autoRefreshLogs}
                className="rounded"
                onChange={e => setAutoRefreshLogs(e.target.checked)}
                type="checkbox"
              />
              Auto-refresh logs
            </label>
          </div>
          <div className="flex gap-2 mb-2">
            <button
              className="flex-1 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded"
              onClick={() => (window as any).__DEV_AI_WATCHERS__.listWatchers()}
            >
              List Watchers
            </button>
            <button
              className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded"
              onClick={() => {
                // Only include fields with actual values - no undefined
                const config = {
                  type: 'custom' as const,
                  name: `Test-${Date.now()}`,
                  workingDirectory: '/tmp',
                  command: 'bash',
                  args: [
                    '-c',
                    'for i in {1..100}; do echo "Test output $i"; sleep 2; done',
                  ],
                }
                createWatcher(config)
                setTimeout(() => refreshWatchers(), 500)
              }}
              title="Create a test watcher that outputs every 2 seconds"
            >
              Create Test
            </button>
          </div>

          <div className="mt-2">
            {Result.builder(watchersResult)
              .onInitial(() => (
                <div className="text-xs text-gray-500">
                  Click button to load watchers...
                </div>
              ))
              .onSuccess(value => {
                const watchers = value as readonly AiWatcher[]
                if (watchers.length > 0) {
                  return (
                    <div className="space-y-1">
                      {watchers.map(watcher => (
                        <div
                          className="text-xs p-2 bg-gray-700 rounded"
                          key={watcher.id}
                        >
                          <div className="flex justify-between items-center">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-gray-300">
                                  {watcher.name}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded text-xs ${
                                    watcher.status === 'running'
                                      ? 'bg-green-600'
                                      : watcher.status === 'idle'
                                        ? 'bg-yellow-600'
                                        : watcher.status === 'stopped'
                                          ? 'bg-gray-600'
                                          : 'bg-red-600'
                                  } text-white`}
                                >
                                  {watcher.status}
                                </span>
                              </div>
                              <div className="text-gray-500 mt-1">
                                PID: {watcher.processHandle.pid} | Type:{' '}
                                {watcher.type}
                              </div>
                            </div>
                            <div className="flex gap-1">
                              <button
                                className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs"
                                onClick={() => {
                                  setExpandedWatcherId(
                                    expandedWatcherId === watcher.id
                                      ? null
                                      : watcher.id
                                  )
                                }}
                                title={
                                  expandedWatcherId === watcher.id
                                    ? 'Hide logs'
                                    : 'View logs'
                                }
                              >
                                {expandedWatcherId === watcher.id ? '▼' : '▶'}
                              </button>
                              {watcher.status === 'stopped' ? (
                                <button
                                  className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs"
                                  onClick={() => {
                                    startWatcher(watcher.id)
                                    setTimeout(() => refreshWatchers(), 500)
                                  }}
                                  title="Start watcher"
                                >
                                  ▶
                                </button>
                              ) : (
                                <button
                                  className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs"
                                  onClick={() => {
                                    stopWatcher(watcher.id)
                                    setTimeout(() => refreshWatchers(), 500)
                                  }}
                                  title="Stop watcher"
                                >
                                  ■
                                </button>
                              )}
                            </div>
                          </div>
                          {expandedWatcherId === watcher.id && (
                            <WatcherLogsDisplay
                              autoRefresh={autoRefreshLogs}
                              watcherId={watcher.id}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )
                }
                return <div className="text-xs text-gray-500">No watchers</div>
              })
              .onDefect(defect => (
                <div className="text-xs text-red-400">
                  Defect: {String(defect)}
                </div>
              ))
              .render()}
          </div>
        </div>

        {/* Console Hint */}
        <div className="text-xs text-gray-500 italic">
          See console for full API: window.__DEV_AI_WATCHERS__
        </div>
      </div>
    </div>
  )
}
