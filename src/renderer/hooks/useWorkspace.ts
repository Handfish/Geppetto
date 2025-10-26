import { useAtom, useAtomValue, useAtomSet, useAtomRefresh } from '@effect-atom/atom-react'
import { Result } from '@effect-atom/atom-react'
import {
  workspaceConfigAtom,
  currentWorkspacePathAtom,
  selectWorkspaceDirectoryAtom,
  setWorkspacePathAtom,
  workspaceRepositoriesAtom,
} from '../atoms/workspace-atoms'

/**
 * Hook for workspace operations
 */
export function useWorkspace() {
  const configResult = useAtomValue(workspaceConfigAtom)
  const currentPathResult = useAtomValue(currentWorkspacePathAtom)
  const [selectResult, selectAndSetDirectory] = useAtom(selectWorkspaceDirectoryAtom)
  const setPath = useAtomSet(setWorkspacePathAtom)

  return {
    configResult,
    currentPathResult,
    selectResult,
    currentPath: Result.getOrElse(currentPathResult, () => null),
    selectAndSetDirectory,
    setPath: (path: string) => setPath({ path }),
  }
}

/**
 * Hook for workspace repositories
 * Returns repositories discovered in the current workspace
 *
 * Note: workspaceRepositoriesAtom automatically triggers discovery if cache is empty
 */
export function useWorkspaceRepositories() {
  const repositoriesResult = useAtomValue(workspaceRepositoriesAtom)
  const refreshRepositories = useAtomRefresh(workspaceRepositoriesAtom)

  const repositories = Result.getOrElse(repositoriesResult, () => [])

  return {
    // Primary: Full Result for exhaustive error handling
    repositoriesResult,

    // Actions
    refresh: refreshRepositories,

    // Computed convenience properties
    repositories,
    isLoading: repositoriesResult._tag === 'Initial' && repositoriesResult.waiting,
  }
}
