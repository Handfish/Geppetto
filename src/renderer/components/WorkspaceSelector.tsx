import React from 'react'
import { useWorkspace } from '../hooks/useWorkspace'
import { useAtomRefresh } from '@effect-atom/atom-react'
import { workspaceConfigAtom } from '../atoms/workspace-atoms'

export function WorkspaceSelector() {
  const { currentPath, selectAndSetDirectory, selectResult } = useWorkspace()
  const refreshConfig = useAtomRefresh(workspaceConfigAtom)

  const isSelecting = selectResult.waiting

  // Listen for workspace changes from other windows
  React.useEffect(() => {
    const handleWorkspaceChange = () => {
      console.log('[WorkspaceSelector] Workspace changed in another window, refreshing...')
      refreshConfig()
    }

    window.electron.ipcRenderer.on('workspace:changed', handleWorkspaceChange)

    return () => {
      window.electron.ipcRenderer.removeListener('workspace:changed', handleWorkspaceChange)
    }
  }, [refreshConfig])

  React.useEffect(() => {
    console.log('[WorkspaceSelector] Current path updated:', currentPath)
  }, [currentPath])

  const handleClick = async () => {
    console.log('[WorkspaceSelector] Selecting directory...')
    const result = await selectAndSetDirectory()
    console.log('[WorkspaceSelector] Selection result:', result)
  }

  return (
    <div className="absolute top-4 right-4 flex flex-col gap-2 pointer-events-auto z-50 items-end">
      <div className="bg-black/80 text-white px-3 py-2 rounded text-xs font-mono">
        Workspace: {currentPath || 'None'}
      </div>
      <button
        onClick={handleClick}
        disabled={isSelecting}
        className="px-4 py-2 bg-gray-900 text-white rounded-md border border-gray-600 hover:bg-gray-700 transition-colors disabled:opacity-50 text-sm w-fit"
        type="button"
      >
        {isSelecting ? 'Selecting...' : 'Choose Directory'}
      </button>
    </div>
  )
}
