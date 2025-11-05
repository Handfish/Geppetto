import React, { useState, useCallback, useEffect } from 'react'
import { useAtomValue, useAtomRefresh } from '@effect-atom/atom-react'
import { Result } from '@effect-atom/atom-react'
import { activeRunnersAtom, runnerStateAtom, onStatusUpdate } from '../../atoms/terminal-atoms'
import { XTerminal } from './XTerminal'
import { TerminalLED } from './TerminalLED'
import { TerminalTypeSwitcher } from './TerminalTypeSwitcher'
import { cn } from '../../lib/utils'
import { X, Maximize2, Minimize2, RotateCcw } from 'lucide-react'
import { useTerminalOperations } from '../../hooks/useTerminalOperations'
import type { RunnerInfo } from '../../../shared/schemas/terminal'

interface TerminalPanelProps {
  className?: string
  onClose?: () => void
}

export function TerminalPanel({ className, onClose }: TerminalPanelProps) {
  const runnersResult = useAtomValue(activeRunnersAtom)
  const refreshRunners = useAtomRefresh(activeRunnersAtom)
  const { writeToRunner, resizeRunner, killRunner, restartRunner } = useTerminalOperations()

  const [activeProcessId, setActiveProcessId] = useState<string | null>(null)
  const [isMaximized, setIsMaximized] = useState(false)

  // Auto-select first runner
  useEffect(() => {
    Result.matchWithError(runnersResult, {
      onSuccess: (data) => {
        if (data && data.value.length > 0 && !activeProcessId) {
          setActiveProcessId(data.value[0].processId)
        }
      },
      onError: () => {},
      onDefect: () => {},
      onInitial: () => {},
    })
  }, [runnersResult, activeProcessId])

  const handleTerminalData = useCallback(async (data: string) => {
    if (activeProcessId) {
      await writeToRunner({ processId: activeProcessId, data })
    }
  }, [activeProcessId, writeToRunner])

  const handleTerminalResize = useCallback(async (rows: number, cols: number) => {
    if (!activeProcessId) return

    try {
      await resizeRunner({ processId: activeProcessId, rows, cols })
    } catch (error) {
      // Silently ignore resize errors (process may have died)
      console.warn(`[TerminalPanel] Resize failed for process ${activeProcessId}:`, error)
    }
  }, [activeProcessId, resizeRunner])

  const handleKillProcess = useCallback(async (processId: string) => {
    await killRunner(processId)
    refreshRunners()
    if (processId === activeProcessId) {
      setActiveProcessId(null)
    }
  }, [activeProcessId, killRunner, refreshRunners])

  const handleRestartProcess = useCallback(async (processId: string) => {
    await restartRunner(processId)
    refreshRunners()
  }, [restartRunner, refreshRunners])

  return (
    <div
      className={cn(
        'flex flex-col bg-gray-950/95 backdrop-blur-xl border border-gray-800 rounded-xl shadow-2xl',
        isMaximized ? 'fixed inset-4 z-50' : 'relative',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-200">AI Runners Terminal</h3>
          <span className="text-xs text-gray-500">
            {Result.matchWithError(runnersResult, {
              onSuccess: (data) => `${data.value.length} active`,
              onError: () => 'Error',
              onDefect: () => 'Error',
              onInitial: () => 'Loading...',
            })}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => refreshRunners()}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors"
            title="Refresh"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            onClick={() => setIsMaximized(!isMaximized)}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors"
            title={isMaximized ? 'Restore' : 'Maximize'}
          >
            {isMaximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* LED Status Bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-800 overflow-x-auto">
        {Result.builder(runnersResult)
          .onSuccess((runners) => (
            <>
              {runners.map((runner) => {
                // Use a component to handle the atom subscription
                return (
                  <RunnerLEDWithState
                    key={runner.processId}
                    runner={runner}
                    isActive={runner.processId === activeProcessId}
                    onClick={() => setActiveProcessId(runner.processId)}
                  />
                )
              })}
            </>
          ))
          .onInitial(() => (
            <div className="text-xs text-gray-500">Loading runners...</div>
          ))
          .onFailure((error) => (
            <div className="text-xs text-red-500">Error loading runners</div>
          ))
          .render()}
      </div>

      {/* Terminal Content */}
      <div className="flex-1 min-h-0 p-4">
        {activeProcessId ? (
          <XTerminal
            processId={activeProcessId}
            className="h-full"
            onData={handleTerminalData}
            onResize={handleTerminalResize}
            isActive={true}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <p className="mb-2">No active runners</p>
              <p className="text-xs">Launch AI runners from the Issues modal</p>
            </div>
          </div>
        )}
      </div>

      {/* Footer Controls */}
      {activeProcessId && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-gray-800">
          <div className="text-xs text-gray-500">
            Process: {activeProcessId}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleRestartProcess(activeProcessId)}
              className="px-3 py-1 text-xs font-medium text-blue-400 hover:text-blue-300 hover:bg-blue-950/50 rounded transition-colors"
            >
              Restart
            </button>
            <button
              onClick={() => handleKillProcess(activeProcessId)}
              className="px-3 py-1 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-950/50 rounded transition-colors"
            >
              Kill
            </button>
          </div>
        </div>
      )}

      {/* Terminal Type Switcher */}
      <TerminalTypeSwitcher />
    </div>
  )
}

/**
 * Helper component to handle individual runner LED with state subscription
 */
function RunnerLEDWithState({
  runner,
  isActive,
  onClick,
}: {
  runner: { processId: string; issueContext?: { issueNumber: number }; agentType: string; state: any }
  isActive: boolean
  onClick: () => void
}) {
  const stateResult = useAtomValue(runnerStateAtom(runner.processId))
  const refreshState = useAtomRefresh(runnerStateAtom(runner.processId))

  console.log('[RunnerLEDWithState] Atom result for', runner.processId, ':', stateResult)

  // Subscribe to status updates and refresh when notified
  useEffect(() => {
    console.log('[RunnerLEDWithState] Subscribing to status updates for:', runner.processId)
    const unsubscribe = onStatusUpdate(() => {
      console.log('[RunnerLEDWithState] Status update received, refreshing state for:', runner.processId)
      refreshState()
    })
    return unsubscribe
  }, [refreshState, runner.processId])

  return Result.builder(stateResult)
    .onSuccess((state) => (
      <TerminalLED
        state={state}
        label={runner.issueContext ? `#${runner.issueContext.issueNumber}` : runner.agentType}
        isActive={isActive}
        onClick={onClick}
      />
    ))
    .onInitial(() => (
      <TerminalLED
        state={runner.state}
        label={runner.issueContext ? `#${runner.issueContext.issueNumber}` : runner.agentType}
        isActive={isActive}
        onClick={onClick}
      />
    ))
    .onFailure(() => null)
    .render()
}
