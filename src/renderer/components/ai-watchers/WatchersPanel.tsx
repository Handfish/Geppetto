import { useAtomValue, useAtom } from '@effect-atom/atom-react'
import { AnimatePresence } from 'framer-motion'
import { aiWatchersAtom, stopWatcherAtom } from '../../atoms/ai-watcher-atoms'
import { WatcherStatusLED } from './WatcherStatusLED'
import { Result } from '@effect-atom/atom-react'

export function WatchersPanel() {
  const watchersResult = useAtomValue(aiWatchersAtom)
  const [, stopWatcher] = useAtom(stopWatcherAtom)

  const handleClearWatcher = (watcherId: string) => {
    stopWatcher(watcherId)
  }

  // Debug logging
  console.log('[WatchersPanel] Result:', watchersResult)

  return Result.builder(watchersResult)
    .onInitial(() => {
      console.log('[WatchersPanel] Rendering Initial state')
      return null
    })
    .onErrorTag('AiWatcherError', (error) => {
      console.log('[WatchersPanel] Error:', error)
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