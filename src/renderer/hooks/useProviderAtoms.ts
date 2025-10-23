import { useAtom, useAtomRefresh, useAtomSet, useAtomValue } from '@effect-atom/atom-react'
import { Result } from '@effect-atom/atom-react'
import { AccountContext, type AccountId, type ProviderType } from '../../shared/schemas/account-context'
import { ProviderAccountRepositories } from '../../shared/schemas/provider'
import {
  providerSignInAtom,
  providerSignOutAtom,
  providerRepositoriesAtom,
  accountRepositoriesAtom,
  emptyAccountRepositoriesAtom,
} from '../atoms/provider-atoms'
import { accountContextAtom, providerAccountsAtom } from '../atoms/account-atoms'

export function useProviderAuth(provider: ProviderType) {
  const contextResult = useAtomValue(accountContextAtom)
  const accountsResult = useAtomValue(providerAccountsAtom(provider))
  const [signInResult, signIn] = useAtom(providerSignInAtom(provider))
  const runSignOut = useAtomSet(providerSignOutAtom)
  const refreshContext = useAtomRefresh(accountContextAtom)
  const refreshProviderRepos = useAtomRefresh(providerRepositoriesAtom(provider))

  const context = Result.getOrElse(contextResult, () => AccountContext.empty())
  const accounts = Result.getOrElse(accountsResult, () => [])
  const isAuthenticated = accounts.length > 0

  const signOut = (accountId: AccountId) => {
    runSignOut({ accountId })
  }

  return {
    contextResult,
    accountsResult,
    accounts,
    activeAccount: context.getActiveAccount(),
    isAuthenticated,
    signIn,
    signInResult,
    isSigningIn: signInResult.waiting,
    signOut,
    refreshContext,
    refreshProviderRepos,
  }
}

export function useProviderRepositories(provider: ProviderType) {
  const repositoriesResult = useAtomValue(providerRepositoriesAtom(provider))
  return {
    repositoriesResult,
    repositories: Result.getOrElse(repositoriesResult, () => [] as ProviderAccountRepositories[]),
    isLoading: repositoriesResult._tag === 'Initial' && repositoriesResult.waiting,
  }
}

export function useAccountRepositories(accountId: AccountId | null) {
  const atom = accountId ? accountRepositoriesAtom(accountId) : emptyAccountRepositoriesAtom
  const repositoriesResult = useAtomValue(atom)
  const repositories = Result.getOrElse(repositoriesResult, () => [])
  const isLoading = accountId
    ? repositoriesResult._tag === 'Initial' && repositoriesResult.waiting
    : false

  return {
    repositoriesResult,
    repositories,
    isLoading,
  }
}
