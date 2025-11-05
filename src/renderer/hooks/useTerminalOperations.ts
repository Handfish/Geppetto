import { useAtom } from '@effect-atom/atom-react'
import {
  spawnRunnerAtom,
  killRunnerAtom,
  killAllRunnersAtom,
  restartRunnerAtom,
  writeToRunnerAtom,
  resizeRunnerAtom,
} from '../atoms/terminal-atoms'

/**
 * Hook providing terminal operation methods
 * Uses useAtom pattern for reactive updates
 */
export function useTerminalOperations() {
  const [spawnResult, spawnRunner] = useAtom(spawnRunnerAtom)
  const [killResult, killRunner] = useAtom(killRunnerAtom)
  const [killAllResult, killAllRunners] = useAtom(killAllRunnersAtom)
  const [restartResult, restartRunner] = useAtom(restartRunnerAtom)
  const [writeResult, writeToRunner] = useAtom(writeToRunnerAtom)
  const [resizeResult, resizeRunner] = useAtom(resizeRunnerAtom)

  return {
    spawnRunner,
    killRunner,
    killAllRunners,
    restartRunner,
    writeToRunner,
    resizeRunner,
    // Also expose results for loading states
    spawnResult,
    killResult,
    killAllResult,
    restartResult,
    writeResult,
    resizeResult,
  }
}
