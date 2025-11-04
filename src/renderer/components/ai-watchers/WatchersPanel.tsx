import React, { useEffect } from 'react'
import { useAtomValue, useAtom, useAtomRefresh } from '@effect-atom/atom-react'
import { AnimatePresence } from 'framer-motion'
import { aiWatchersAtom, stopWatcherAtom, switchToTmuxSessionAtom } from '../../atoms/ai-watcher-atoms'
import { WatcherStatusLED } from './WatcherStatusLED'
import { Result } from '@effect-atom/atom-react'
import type { AiWatcher } from '../../../shared/schemas/ai-watchers'

export function WatchersPanel(): React.ReactNode {
  const watchersResult = useAtomValue(aiWatchersAtom)
  const [, stopWatcher] = useAtom(stopWatcherAtom)
  const [, switchToSession] = useAtom(switchToTmuxSessionAtom)
  const refreshWatchers = useAtomRefresh(aiWatchersAtom)

  // Poll for watcher status updates every 500ms for responsive LED updates
  // This ensures status changes (idle → running) appear quickly in the UI
  useEffect(() => {
    const interval = setInterval(() => {
      refreshWatchers()
    }, 500)

    return () => clearInterval(interval)
  }, [refreshWatchers])

  const handleClearWatcher = (watcherId: string) => {
    stopWatcher(watcherId)
  }

  const handleLEDClick = (watcher: AiWatcher) => {
    // Derive session name from watcher ID and type (matches backend pattern)
    const sessionName = `ai-${watcher.type}-${watcher.id.slice(0, 8)}`
    console.log('[WatchersPanel] LED clicked for watcher:', watcher.id)
    console.log('[WatchersPanel] Derived session name:', sessionName)
    console.log('[WatchersPanel] Calling switchToSession...')

    // Use Effect-based IPC call to switch session
    switchToSession(sessionName)

    console.log('[WatchersPanel] switchToSession called')
  }

  // Debug logging
  console.log('[WatchersPanel] Result:', watchersResult)

  return Result.builder(watchersResult)
    .onInitial(() => {
      console.log('[WatchersPanel] Rendering Initial state')
      return null
    })
    .onDefect((defect) => {
      console.error('[WatchersPanel] Unexpected error:', defect)
      return null
    })
    .onSuccess((watchers) => {
      console.log('[WatchersPanel] Success with watchers:', watchers)
      if (watchers.length === 0) return null

      return (
        <div className="fixed top-48 right-8 z-10">
          <div className="flex flex-col gap-2">
            <AnimatePresence mode="popLayout">
              {watchers.map((watcher) => {
                console.log('[WatchersPanel] Rendering LED for watcher:', watcher.id, 'status:', watcher.status)
                return (
                  <WatcherStatusLED
                    key={watcher.id}
                    onClear={handleClearWatcher}
                    onClick={handleLEDClick}
                    watcher={watcher}
                  />
                )
              })}
            </AnimatePresence>
          </div>
        </div>
      )
    })
    .render()
}