import { useAtom, useAtomValue, useAtomRefresh, useAtomSet } from '@effect-atom/atom-react'
import { Result } from '@effect-atom/atom-react'
import type { AiAccountId, AiProviderType, AiUsageSnapshot } from '../../shared/schemas/ai/provider'
import {
  aiProviderSignInAtom,
  aiProviderUsageAtom,
  aiProviderSignOutAtom,
} from '../atoms/ai-provider-atoms'

export function useAiProviderAuth(provider: AiProviderType) {
  const [signInResult, signIn] = useAtom(aiProviderSignInAtom(provider))
  const usageResult = useAtomValue(aiProviderUsageAtom(provider))
  const refreshUsage = useAtomRefresh(aiProviderUsageAtom(provider))
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

export function useAiProviderUsage(provider: AiProviderType) {
  const usageResult = useAtomValue(aiProviderUsageAtom(provider))
  return {
    usageResult,
    usage: Result.getOrElse(usageResult, () => []),
    isLoading: usageResult._tag === 'Initial' && usageResult.waiting,
  }
}
