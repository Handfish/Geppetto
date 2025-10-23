import { useAtom, useAtomValue, useAtomRefresh } from '@effect-atom/atom-react'
import { Result } from '@effect-atom/atom-react'
import type { AiProviderType } from '../../shared/schemas/ai/provider'
import { aiProviderSignInAtom, aiProviderUsageAtom } from '../atoms/ai-provider-atoms'

export function useAiProviderAuth(provider: AiProviderType) {
  const [signInResult, signIn] = useAtom(aiProviderSignInAtom(provider))
  const usageResult = useAtomValue(aiProviderUsageAtom(provider))
  const refreshUsage = useAtomRefresh(aiProviderUsageAtom(provider))

  const usage = Result.getOrElse(usageResult, () => [])
  const isAuthenticated = Result.isSuccess(usageResult)

  return {
    signIn,
    signInResult,
    usageResult,
    usage,
    isAuthenticated,
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
