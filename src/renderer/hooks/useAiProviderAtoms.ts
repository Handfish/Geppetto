import { useAtom, useAtomValue, useAtomRefresh, useAtomSet } from '@effect-atom/atom-react'
import { Result } from '@effect-atom/atom-react'
import type { AiAccountId, AiProviderType, AiUsageSnapshot } from '../../shared/schemas/ai/provider'
import {
  aiProviderSignInAtom,
  selectAiProviderUsageAtom,
  aiProviderSignOutAtom,
} from '../atoms/ai-provider-atoms'

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

  const usage = Result.getOrElse(usageResult, () => [] as readonly AiUsageSnapshot[])
  const isAuthenticated = usage.length > 0

  const signOut = (accountId: AiAccountId) => {
    runSignOut({ accountId })
  }

  return {
    signIn,
    signInResult,
    usageResult,
    usage,
    isAuthenticated,
    signOut,
    refreshUsage,
  }
}

export function useAiProviderUsage(
  provider: AiProviderType,
  options?: { enabled?: boolean }
) {
  const enabled = options?.enabled ?? true
  const usageAtom = selectAiProviderUsageAtom(provider, enabled)
  const usageResult = useAtomValue(usageAtom)
  return {
    usageResult,
    usage: Result.getOrElse(usageResult, () => []),
    isLoading: usageResult._tag === 'Initial' && usageResult.waiting,
  }
}
