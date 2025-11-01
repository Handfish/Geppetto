import { useAtom } from '@effect-atom/atom-react'
import {
  spawnWatcherAtom,
  killWatcherAtom,
  killAllWatchersAtom,
  restartWatcherAtom,
  writeToWatcherAtom,
  resizeWatcherAtom,
} from '../atoms/terminal-atoms'

/**
 * Hook providing terminal operation methods
 * Uses useAtom pattern for reactive updates
 */
export function useTerminalOperations() {
  const [spawnResult, spawnWatcher] = useAtom(spawnWatcherAtom)
  const [killResult, killWatcher] = useAtom(killWatcherAtom)
  const [killAllResult, killAllWatchers] = useAtom(killAllWatchersAtom)
  const [restartResult, restartWatcher] = useAtom(restartWatcherAtom)
  const [writeResult, writeToWatcher] = useAtom(writeToWatcherAtom)
  const [resizeResult, resizeWatcher] = useAtom(resizeWatcherAtom)

  return {
    spawnWatcher,
    killWatcher,
    killAllWatchers,
    restartWatcher,
    writeToWatcher,
    resizeWatcher,
    // Also expose results for loading states
    spawnResult,
    killResult,
    killAllResult,
    restartResult,
    writeResult,
    resizeResult,
  }
}
