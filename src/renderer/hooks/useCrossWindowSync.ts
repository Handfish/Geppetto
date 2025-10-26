/**
 * Cross-Window State Synchronization Hook
 *
 * Listens for state change broadcasts from the main process and refreshes atoms
 * to keep all renderer windows in sync.
 *
 * @example
 * // In MainScreen.tsx
 * useCrossWindowSync()  // Sets up all listeners
 */

import { useEffect, useCallback } from 'react'
import { useAtomRefresh, useAtomValue, Result } from '@effect-atom/atom-react'
import { accountContextAtom, providerAccountsAtom } from '../atoms/account-atoms'
import { selectAiProviderUsageAtom } from '../atoms/ai-provider-atoms'
import { providerRepositoriesAtom } from '../atoms/provider-atoms'

/**
 * State change event types (mirrors main process BroadcastService)
 */
type StateChangeEvent =
  | 'accounts:changed'
  | 'ai:usage:changed'
  | 'workspace:changed'
  | 'repositories:changed'

/**
 * Hook to synchronize state across all renderer windows
 *
 * Listens for state change events from the main process and
 * refreshes relevant atoms to keep UI in sync.
 */
export function useCrossWindowSync() {
  const refreshAccountContext = useAtomRefresh(accountContextAtom)
  const refreshAiUsage = useAtomRefresh(selectAiProviderUsageAtom('openai'))
  const refreshClaudeUsage = useAtomRefresh(selectAiProviderUsageAtom('claude'))

  // Refresh provider-level atoms which will cascade to account-specific atoms
  const refreshGitHubAccounts = useAtomRefresh(providerAccountsAtom('github'))
  const refreshGitHubRepos = useAtomRefresh(providerRepositoriesAtom('github'))

  useEffect(() => {
    // Account context changed (sign-in, sign-out, switch account)
    const handleAccountsChanged = () => {
      console.log('[useCrossWindowSync] Accounts changed, refreshing all account-related atoms')
      // Refresh account context (which account is active)
      refreshAccountContext()
      // Refresh GitHub accounts list
      refreshGitHubAccounts()
      // Refresh GitHub repositories (grouped by account)
      refreshGitHubRepos()
    }

    // AI usage changed (new token count, session activity)
    const handleAiUsageChanged = () => {
      refreshAiUsage()
      refreshClaudeUsage()
    }

    // Subscribe to events
    window.electron.ipcRenderer.on('state:accounts:changed', handleAccountsChanged)
    window.electron.ipcRenderer.on('state:ai:usage:changed', handleAiUsageChanged)

    // Cleanup
    return () => {
      window.electron.ipcRenderer.removeListener('state:accounts:changed', handleAccountsChanged)
      window.electron.ipcRenderer.removeListener('state:ai:usage:changed', handleAiUsageChanged)
    }
  }, [
    refreshAccountContext,
    refreshAiUsage,
    refreshClaudeUsage,
    refreshGitHubAccounts,
    refreshGitHubRepos,
  ])
}
