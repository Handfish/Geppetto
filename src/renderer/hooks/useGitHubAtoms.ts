import { useAtomValue, useAtomSet, useAtom, useAtomRefresh } from '@effect-atom/atom-react'
import {
  authStateAtom,
  isAuthenticatedAtom,
  currentUserAtom,
  signInAtom,
  signOutAtom,
  userReposAtom,
  reposAtom,
  repoAtom,
  issuesAtom,
  pullRequestsAtom,
} from '../atoms/github-atoms'

export function useGitHubAuth() {
  const authState = useAtomValue(authStateAtom)
  const isAuthenticated = useAtomValue(isAuthenticatedAtom)
  const currentUser = useAtomValue(currentUserAtom)

  const [signInResult, signIn] = useAtom(signInAtom)
  const signOut = useAtomSet(signOutAtom)
  const refreshAuth = useAtomRefresh(authStateAtom)

  return {
    authState,
    isAuthenticated,
    currentUser,
    signIn: () => signIn(),
    signOut: () => signOut(),
    refresh: refreshAuth,
    isSigningIn: signInResult.waiting,
    signInResult,
  }
}

export function useGitHubRepos(username?: string) {
  const reposResult = useAtomValue(reposAtom(username))
  const refreshRepos = useAtomRefresh(reposAtom(username))
  
  return {
    repos: reposResult,
    refresh: refreshRepos,
    isLoading: reposResult._tag === 'Initial' && reposResult.waiting,
    isFetching: reposResult.waiting,
  }
}

export function useUserRepos() {
  const userReposResult = useAtomValue(userReposAtom)
  
  return {
    repos: userReposResult,
    isLoading: userReposResult._tag === 'Initial' && userReposResult.waiting,
  }
}

export function useGitHubRepo(owner: string, repo: string) {
  const repoResult = useAtomValue(repoAtom({ owner, repo }))
  const refreshRepo = useAtomRefresh(repoAtom({ owner, repo }))
  
  return {
    repo: repoResult,
    refresh: refreshRepo,
    isLoading: repoResult._tag === 'Initial' && repoResult.waiting,
  }
}

export function useGitHubIssues(
  owner: string, 
  repo: string, 
  state: 'open' | 'closed' | 'all' = 'open'
) {
  const issuesResult = useAtomValue(issuesAtom({ owner, repo, state }))
  const refreshIssues = useAtomRefresh(issuesAtom({ owner, repo, state }))
  
  return {
    issues: issuesResult,
    refresh: refreshIssues,
    isLoading: issuesResult._tag === 'Initial' && issuesResult.waiting,
  }
}

