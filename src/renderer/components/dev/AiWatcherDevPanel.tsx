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
        '  • createWatcher(config)   - Create new watcher (see docs for config)'
      )
      console.log('  • attachToTmux(name)      - Attach to tmux session')
      console.log('  • stopWatcher(id)         - Stop a watcher')
      console.log('  • startWatcher(id)        - Start a watcher')
      console.log('  • showPanel()             - Show visual panel')
      console.log('  • hidePanel()             - Hide visual panel')
      console.log('  • getResults()            - Get current Results')
      console.log('')
      console.log(
        'Example: window.__DEV_AI_WATCHERS__.listTmuxSessions()'
      )
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
          const fullConfig: AiWatcherConfig = {
            type: config.type || 'custom',
            workingDirectory: config.workingDirectory || process.cwd(),
            name: config.name,
            command: config.command,
            args: config.args,
            env: config.env,
          }
          createWatcher(fullConfig)
          console.log('[AI Watcher] Create request sent. Check createResult.')
        },

        attachToTmux: (sessionName: string) => {
          console.log('[AI Watcher] Attaching to tmux session:', sessionName)
          attachToSession(sessionName)
          console.log('[AI Watcher] Attach request sent.')
        },

        // Control operations
        stopWatcher: (watcherId: string) => {
          console.log('[AI Watcher] Stopping watcher:', watcherId)
          stopWatcher(watcherId)
        },

        startWatcher: (watcherId: string) => {
          console.log('[AI Watcher] Starting watcher:', watcherId)
          startWatcher(watcherId)
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
                            onClick={() =>
                              (window as any).__DEV_AI_WATCHERS__.attachToTmux(
                                session.name
                              )
                            }
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
          <button
            onClick={() => (window as any).__DEV_AI_WATCHERS__.listWatchers()}
            className="w-full px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded"
          >
            List Watchers
          </button>

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
                            <span className="text-gray-300">{watcher.name}</span>
                            <span
                              className={`px-2 py-0.5 rounded ${
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
