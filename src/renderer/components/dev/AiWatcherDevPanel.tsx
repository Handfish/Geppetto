/**
 * Development-only AI Watcher Testing Panel
 *
 * Allows testing AI watcher functionality in development mode.
 * Exposes window.__DEV_AI_WATCHERS__ API in console.
 */

import { useEffect, useRef, useState } from 'react'
import { Result } from '@effect-atom/atom-react'
import { useAiWatchers, useTmuxSessions } from '../../hooks/useAiWatchers'
import type {
  AiWatcherConfig,
  AiWatcher,
  TmuxSession,
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
          const watchers = Result.getOrElse(watchersResult, () => []) as readonly AiWatcher[]
          if (watchers && watchers.length > 0) {
            console.table(
              watchers.map((w) => ({
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
          const sessions = Result.getOrElse(sessionsResult, () => []) as readonly TmuxSession[]
          if (sessions && sessions.length > 0) {
            console.table(
              sessions.map((s) => ({
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
          console.log('[AI Watcher] Create request sent. Watchers will refresh.')
        },

        attachToTmux: (sessionName: string) => {
          console.log('[AI Watcher] Attaching to tmux session:', sessionName)
          attachToSession(sessionName)
          setTimeout(() => refreshWatchers(), 500)
          console.log('[AI Watcher] Attach request sent. Watchers will refresh.')
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
        togglePanel: () => setShowPanel((prev) => !prev),

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
          onClick={() => setShowPanel(false)}
          className="text-gray-400 hover:text-white"
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
            onClick={() => (window as any).__DEV_AI_WATCHERS__.listTmuxSessions()}
            className="w-full px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded"
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
              .onSuccess((value) => {
                const sessions = value as readonly TmuxSession[]
                if (sessions.length > 0) {
                  return (
                    <div className="space-y-1">
                      {sessions.map((session) => (
                        <div
                          key={session.name}
                          className="text-xs p-2 bg-gray-700 rounded flex justify-between items-center"
                        >
                          <span className="text-gray-300">{session.name}</span>
                          <button
                            onClick={() => {
                              attachToSession(session.name)
                              // Refresh watchers list after a short delay to show the new watcher
                              setTimeout(() => refreshWatchers(), 500)
                            }}
                            className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs"
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
              .onErrorTag('TmuxError', (error) => (
                <div className="text-xs text-red-400">Error: {error.message}</div>
              ))
              .onDefect((defect) => (
                <div className="text-xs text-red-400">
                  Defect: {String(defect)}
                </div>
              ))
              .render()}
          </div>
        </div>

        {/* AI Watchers Section */}
        <div>
          <h4 className="text-sm font-semibold text-gray-300 mb-2">
            AI Watchers
          </h4>
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => (window as any).__DEV_AI_WATCHERS__.listWatchers()}
              className="flex-1 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded"
            >
              List Watchers
            </button>
            <button
              onClick={() => {
                // Only include fields with actual values - no undefined
                const config = {
                  type: 'custom' as const,
                  name: `Test-${Date.now()}`,
                  workingDirectory: '/tmp',
                  command: 'bash',
                  args: ['-c', 'for i in {1..10}; do echo "Test output $i"; sleep 2; done'],
                }
                createWatcher(config)
                setTimeout(() => refreshWatchers(), 500)
              }}
              className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded"
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
              .onSuccess((value) => {
                const watchers = value as readonly AiWatcher[]
                if (watchers.length > 0) {
                  return (
                    <div className="space-y-1">
                      {watchers.map((watcher) => (
                        <div
                          key={watcher.id}
                          className="text-xs p-2 bg-gray-700 rounded"
                        >
                          <div className="flex justify-between items-center">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-gray-300">{watcher.name}</span>
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
                                PID: {watcher.processHandle.pid} | Type: {watcher.type}
                              </div>
                            </div>
                            <div className="flex gap-1">
                              {watcher.status === 'stopped' ? (
                                <button
                                  onClick={() => {
                                    startWatcher(watcher.id)
                                    setTimeout(() => refreshWatchers(), 500)
                                  }}
                                  className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs"
                                  title="Start watcher"
                                >
                                  ▶
                                </button>
                              ) : (
                                <button
                                  onClick={() => {
                                    stopWatcher(watcher.id)
                                    setTimeout(() => refreshWatchers(), 500)
                                  }}
                                  className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs"
                                  title="Stop watcher"
                                >
                                  ■
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                }
                return <div className="text-xs text-gray-500">No watchers</div>
              })
              .onDefect((defect) => (
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
