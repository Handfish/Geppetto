import { useAtom, useAtomValue, useAtomSet } from '@effect-atom/atom-react'
import { Result } from '@effect-atom/atom-react'
import {
  workspaceConfigAtom,
  currentWorkspacePathAtom,
  selectWorkspaceDirectoryAtom,
  setWorkspacePathAtom,
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
