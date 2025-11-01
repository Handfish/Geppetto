import { useCallback } from 'react'
import { Effect } from 'effect'
import {
  spawnWatcherAtom,
  killWatcherAtom,
  killAllWatchersAtom,
  restartWatcherAtom,
  writeToWatcherAtom,
  resizeWatcherAtom,
} from '../atoms/terminal-atoms'
import type { SpawnWatcherInput } from '../../shared/schemas/terminal'
import { useAtomCallback } from '@effect-atom/atom-react'

/**
 * Hook providing terminal operation methods
 * Uses atom callbacks for reactive updates
 */
export function useTerminalOperations() {
  const spawnWatcher = useAtomCallback(
    useCallback((input: SpawnWatcherInput) => spawnWatcherAtom(input), [])
  )

  const killWatcher = useAtomCallback(
    useCallback((processId: string) => killWatcherAtom(processId), [])
  )

  const killAllWatchers = useAtomCallback(
    useCallback(() => killAllWatchersAtom(), [])
  )

  const restartWatcher = useAtomCallback(
    useCallback((processId: string) => restartWatcherAtom(processId), [])
  )

  const writeToWatcher = useAtomCallback(
    useCallback((processId: string, data: string) => writeToWatcherAtom(processId, data), [])
  )

  const resizeWatcher = useAtomCallback(
    useCallback((processId: string, rows: number, cols: number) =>
      resizeWatcherAtom(processId, rows, cols), [])
  )

  return {
    spawnWatcher,
    killWatcher,
    killAllWatchers,
    restartWatcher,
    writeToWatcher,
    resizeWatcher,
  }
}
