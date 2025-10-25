import {
  useAtom,
  useAtomRefresh,
  useAtomSet,
  useAtomValue,
} from '@effect-atom/atom-react'
import { Result } from '@effect-atom/atom-react'
import type { AiWatcherConfig } from '../../shared/schemas/ai-watchers'
import {
  aiWatchersAtom,
  aiWatcherAtom,
  aiWatcherLogsAtom,
  tmuxSessionsAtom,
  createWatcherAtom,
  attachToTmuxSessionAtom,
  stopWatcherAtom,
  startWatcherAtom,
} from '../atoms/ai-watcher-atoms'

/**
 * Hook for AI watcher list management
 *
 * Returns full Results for exhaustive error handling in components.
 * Also provides convenience properties and actions for common use cases.
 */
export function useAiWatchers() {
  const watchersResult = useAtomValue(aiWatchersAtom)
  const [createResult, createWatcher] = useAtom(createWatcherAtom)
  const refreshWatchers = useAtomRefresh(aiWatchersAtom)
  const stopWatcher = useAtomSet(stopWatcherAtom)
  const startWatcher = useAtomSet(startWatcherAtom)

  // Computed convenience properties
  const watchers = Result.getOrElse(watchersResult, () => [])
  const isLoading = watchersResult._tag === 'Initial' && watchersResult.waiting
  const isCreating = createResult.waiting

  return {
    // Primary: Full Results for exhaustive error handling
    watchersResult,
    createResult,

    // Actions
    createWatcher,
    stopWatcher,
    startWatcher,
    refreshWatchers,

    // Computed convenience properties
    watchers,
    isLoading,
    isCreating,
  }
}

/**
 * Hook for individual watcher details
 *
 * Returns full Result for exhaustive error handling.
 * Use Result.builder in components to handle all states.
 */
export function useWatcher(watcherId: string) {
  const watcherResult = useAtomValue(aiWatcherAtom(watcherId))
  const refreshWatcher = useAtomRefresh(aiWatcherAtom(watcherId))

  const watcher = Result.match(watcherResult, {
    onSuccess: (data) => data.value,
    onFailure: () => null,
    onInitial: () => null,
  })

  return {
    // Primary: Full Result for exhaustive error handling
    watcherResult,

    // Actions
    refreshWatcher,

    // Computed convenience properties
    watcher,
    isLoading: watcherResult._tag === 'Initial' && watcherResult.waiting,
  }
}

/**
 * Hook for watcher logs
 *
 * Returns full Result for exhaustive error handling.
 * Use Result.builder in components to handle all states.
 */
export function useWatcherLogs(watcherId: string, limit?: number) {
  const logsResult = useAtomValue(aiWatcherLogsAtom({ watcherId, limit }))
  const refreshLogs = useAtomRefresh(aiWatcherLogsAtom({ watcherId, limit }))

  const logs = Result.getOrElse(logsResult, () => [])

  return {
    // Primary: Full Result for exhaustive error handling
    logsResult,

    // Actions
    refreshLogs,

    // Computed convenience properties
    logs,
    isLoading: logsResult._tag === 'Initial' && logsResult.waiting,
  }
}

/**
 * Hook for tmux sessions
 *
 * Returns full Result for exhaustive error handling.
 * Use Result.builder in components to handle all states.
 */
export function useTmuxSessions() {
  const sessionsResult = useAtomValue(tmuxSessionsAtom)
  const [attachResult, attachToSession] = useAtom(attachToTmuxSessionAtom)
  const refreshSessions = useAtomRefresh(tmuxSessionsAtom)

  const sessions = Result.getOrElse(sessionsResult, () => [])

  return {
    // Primary: Full Results for exhaustive error handling
    sessionsResult,
    attachResult,

    // Actions
    attachToSession,
    refreshSessions,

    // Computed convenience properties
    sessions,
    isLoading: sessionsResult._tag === 'Initial' && sessionsResult.waiting,
    isAttaching: attachResult.waiting,
  }
}
