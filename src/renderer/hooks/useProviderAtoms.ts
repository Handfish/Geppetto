import {
  useAtom,
  useAtomRefresh,
  useAtomSet,
  useAtomValue,
} from '@effect-atom/atom-react'
import { Result } from '@effect-atom/atom-react'
import {
  AccountContext,
  type AccountId,
  type ProviderType,
} from '../../shared/schemas/account-context'
import type { ProviderAccountRepositories } from '../../shared/schemas/provider'
import {
  providerSignInAtom,
  providerSignOutAtom,
  providerRepositoriesAtom,
  accountRepositoriesAtom,
  emptyAccountRepositoriesAtom,
} from '../atoms/provider-atoms'
import {
  accountContextAtom,
  providerAccountsAtom,
} from '../atoms/account-atoms'

/**
 * Hook for provider authentication and account management
 *
 * Returns full Results for exhaustive error handling in components.
 * Also provides convenience properties for common use cases.
 */
export function useProviderAuth(provider: ProviderType) {
  const contextResult = useAtomValue(accountContextAtom)
  const accountsResult = useAtomValue(providerAccountsAtom(provider))
  const [signInResult, signIn] = useAtom(providerSignInAtom(provider))
  const runSignOut = useAtomSet(providerSignOutAtom)
  const refreshContext = useAtomRefresh(accountContextAtom)
  const refreshProviderRepos = useAtomRefresh(
    providerRepositoriesAtom(provider)
  )

  // Computed convenience properties
  const accounts = Result.getOrElse(accountsResult, () => [])
  const context = Result.getOrElse(contextResult, () => AccountContext.empty())

  const isAuthenticated = accounts.length > 0
  const activeAccount = context.getActiveAccount()

  const isLoading =
    (contextResult._tag === 'Initial' && contextResult.waiting) ||
    (accountsResult._tag === 'Initial' && accountsResult.waiting)

  const signOut = (accountId: AccountId) => {
    runSignOut({ accountId })
  }

  return {
    // Primary: Full Results for exhaustive error handling
    contextResult,
    accountsResult,
    signInResult,

    // Actions
    signIn,
    signOut,
    refreshContext,
    refreshProviderRepos,

    // Computed convenience properties
    accounts,
    activeAccount,
    isAuthenticated,
    isSigningIn: signInResult.waiting,
    isLoading,
  }
}

/**
 * Hook for provider repositories data only
 *
 * Returns full repositoriesResult for exhaustive error handling.
 * Use Result.builder in components to handle all states.
 */
export function useProviderRepositories(provider: ProviderType) {
  const repositoriesResult = useAtomValue(providerRepositoriesAtom(provider))

  return {
    // Primary: Full Result for exhaustive error handling
    repositoriesResult,

    // Computed convenience property
    isLoading:
      repositoriesResult._tag === 'Initial' && repositoriesResult.waiting,
  }
}

/**
 * Hook for account-specific repositories data
 *
 * Returns full repositoriesResult for exhaustive error handling.
 * Use Result.builder in components to handle all states.
 */
export function useAccountRepositories(accountId: AccountId | null) {
  const atom = accountId
    ? accountRepositoriesAtom(accountId)
    : emptyAccountRepositoriesAtom
  const repositoriesResult = useAtomValue(atom)

  const isLoading = accountId
    ? repositoriesResult._tag === 'Initial' && repositoriesResult.waiting
    : false

  return {
    // Primary: Full Result for exhaustive error handling
    repositoriesResult,

    // Computed convenience property
    isLoading,
  }
}
