import React, { useEffect } from 'react'
import { useAtomValue, useAtom, useAtomRefresh } from '@effect-atom/atom-react'
import { AnimatePresence } from 'framer-motion'
import { processRunnersAtom, stopRunnerAtom, switchToTmuxSessionAtom } from '../../atoms/process-runner-atoms'
import { ProcessRunnerStatusLED } from './ProcessRunnerStatusLED'
import { Result } from '@effect-atom/atom-react'
import type { ProcessRunner } from '../../shared/schemas/process-runners'

export function ProcessRunnersPanel(): React.ReactNode {
  const runnersResult = useAtomValue(processRunnersAtom)
  const [, stopRunner] = useAtom(stopRunnerAtom)
  const [, switchToSession] = useAtom(switchToTmuxSessionAtom)
  const refreshRunners = useAtomRefresh(processRunnersAtom)

  // Poll for runner status updates every 500ms for responsive LED updates
  // This ensures status changes (idle → running) appear quickly in the UI
  useEffect(() => {
    const interval = setInterval(() => {
      refreshRunners()
    }, 500)

    return () => clearInterval(interval)
  }, [refreshRunners])

  const handleClearRunner = (runnerId: string) => {
    stopRunner(runnerId)
  }

  const handleLEDClick = (runner: ProcessRunner) => {
    // Derive session name from runner ID and type (matches backend pattern)
    const sessionName = `runner-${runner.type}-${runner.id.slice(0, 8)}`
    console.log('[ProcessRunnersPanel] LED clicked for runner:', runner.id)
    console.log('[ProcessRunnersPanel] Derived session name:', sessionName)
    console.log('[ProcessRunnersPanel] Calling switchToSession...')

    // Use Effect-based IPC call to switch session
    switchToSession(sessionName)

    console.log('[ProcessRunnersPanel] switchToSession called')
  }

  // Debug logging
  console.log('[ProcessRunnersPanel] Result:', runnersResult)

  return Result.builder(runnersResult)
    .onInitial(() => {
      console.log('[ProcessRunnersPanel] Rendering Initial state')
      return null
    })
    .onDefect((defect) => {
      console.error('[ProcessRunnersPanel] Unexpected error:', defect)
      return null
    })
    .onSuccess((runners) => {
      console.log('[ProcessRunnersPanel] Success with runners:', runners)
      if (runners.length === 0) return null

      return (
        <div className="fixed top-48 right-8 z-10">
          <div className="flex flex-col gap-2">
            <AnimatePresence mode="popLayout">
              {runners.map((runner) => {
                console.log('[ProcessRunnersPanel] Rendering LED for runner:', runner.id, 'status:', runner.status)
                return (
                  <ProcessRunnerStatusLED
                    key={runner.id}
                    onClear={handleClearRunner}
                    onClick={handleLEDClick}
                    watcher={runner}
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