import {
  useAtom,
  useAtomValue,
  useAtomRefresh,
  useAtomSet,
} from '@effect-atom/atom-react'
import { Result } from '@effect-atom/atom-react'
import type {
  AiAccountId,
  AiProviderType,
  AiUsageSnapshot,
} from '../../shared/schemas/ai/provider'
import {
  aiProviderSignInAtom,
  selectAiProviderUsageAtom,
  aiProviderSignOutAtom,
} from '../atoms/ai-provider-atoms'

/**
 * Hook for AI provider authentication and usage
 *
 * Returns full Results for exhaustive error handling in components.
 * Also provides convenience properties for common use cases.
 */
export function useAiProviderAuth(
  provider: AiProviderType,
  options?: { loadUsage?: boolean }
) {
  const loadUsage = options?.loadUsage ?? false
  const [signInResult, signIn] = useAtom(aiProviderSignInAtom(provider))
  const usageAtom = selectAiProviderUsageAtom(provider, loadUsage)
  const usageResult = useAtomValue(usageAtom)
  const refreshUsage = useAtomRefresh(usageAtom)
  const runSignOut = useAtomSet(aiProviderSignOutAtom)

  // Computed convenience properties (use Result.match for type-safe extraction)
  const isAuthenticated = Result.match(usageResult, {
    onSuccess: (data) => data.value.length > 0,
    onFailure: () => false,
    onInitial: () => false,
  })

  const isLoading =
    usageResult._tag === 'Initial' && usageResult.waiting

  const signOut = (accountId: AiAccountId) => {
    runSignOut({ accountId })
  }

  return {
    // Primary: Full Results for exhaustive error handling
    signInResult,
    usageResult,

    // Actions
    signIn,
    signOut,
    refreshUsage,

    // Computed convenience properties
    isAuthenticated,
    isLoading,
  }
}

/**
 * Hook for AI provider usage data only (no auth actions)
 *
 * Returns full usageResult for exhaustive error handling.
 * Use Result.builder in components to handle all states.
 */
export function useAiProviderUsage(
  provider: AiProviderType,
  options?: { enabled?: boolean }
) {
  const enabled = options?.enabled ?? true
  const usageAtom = selectAiProviderUsageAtom(provider, enabled)
  const usageResult = useAtomValue(usageAtom)
  const refreshUsage = useAtomRefresh(usageAtom)

  return {
    // Primary: Full Result for exhaustive error handling
    usageResult,

    // Actions
    refreshUsage,

    // Computed convenience property
    isLoading: usageResult._tag === 'Initial' && usageResult.waiting,
  }
}
