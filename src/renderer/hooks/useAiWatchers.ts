import {
  useAtom,
  useAtomRefresh,
  useAtomSet,
  useAtomValue,
} from '@effect-atom/atom-react'
import { Result } from '@effect-atom/atom-react'
import { useMemo, useRef, useCallback } from 'react'
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
 * Rate limiter configuration for watcher logs
 * Set to false to disable rate limiting (useful for debugging)
 */
const ENABLE_LOGS_RATE_LIMITER = false

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
 *
 * IMPORTANT: Includes rate limiting to prevent IPC spam (max 1 request per 500ms)
 */
export function useWatcherLogs(watcherId: string, limit?: number) {
  console.log(`[useWatcherLogs] Called with watcherId=${watcherId}, limit=${limit}`)

  // Memoize params to ensure stable atom identity
  const params = useMemo(() => ({ watcherId, limit }), [watcherId, limit])

  const logsResult = useAtomValue(aiWatcherLogsAtom(params))
  const rawRefreshLogs = useAtomRefresh(aiWatcherLogsAtom(params))

  // Store rawRefreshLogs in a ref to keep refreshLogs stable
  const rawRefreshLogsRef = useRef(rawRefreshLogs)
  rawRefreshLogsRef.current = rawRefreshLogs

  // Optional rate limiting: prevent refreshLogs from being called more than once per 200ms
  // This allows scheduled refreshes while preventing runaway spam
  const lastRefreshTimeRef = useRef<number>(0)
  const refreshLogs = useCallback(() => {
    if (ENABLE_LOGS_RATE_LIMITER) {
      const now = Date.now()
      const timeSinceLastRefresh = now - lastRefreshTimeRef.current

      if (timeSinceLastRefresh < 200) {
        console.warn(
          `[useWatcherLogs] RATE LIMITED - Attempted refresh only ${timeSinceLastRefresh}ms after last refresh (min 200ms). Ignoring.`
        )
        return
      }

      console.log(`[useWatcherLogs] Refresh allowed (${timeSinceLastRefresh}ms since last)`)
      lastRefreshTimeRef.current = now
    } else {
      console.log(`[useWatcherLogs] Refresh (rate limiter disabled)`)
    }

    rawRefreshLogsRef.current()  // Use ref instead of closure
  }, [])  // ✅ No dependencies - completely stable

  console.log(`[useWatcherLogs] logsResult:`, {
    tag: logsResult._tag,
    waiting: logsResult.waiting,
    dataLength: logsResult._tag === 'Success' ? (logsResult.value as readonly unknown[]).length : 0,
  })

  const logs = Result.getOrElse(logsResult, () => [])

  return {
    // Primary: Full Result for exhaustive error handling
    logsResult,

    // Actions
    refreshLogs, // Rate-limited version

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
