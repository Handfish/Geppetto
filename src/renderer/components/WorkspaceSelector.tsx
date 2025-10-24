import React from 'react'
import { useWorkspace } from '../hooks/useWorkspace'

export function WorkspaceSelector() {
  const { currentPath, selectAndSetDirectory, selectResult } = useWorkspace()

  const isSelecting = selectResult.waiting

  return (
    <div className="absolute top-4 right-4 flex flex-col gap-2 pointer-events-auto z-50">
      <div className="bg-black/80 text-white px-3 py-2 rounded text-xs font-mono">
        Workspace: {currentPath || 'None'}
      </div>
      <button
        onClick={selectAndSetDirectory}
        disabled={isSelecting}
        className="px-4 py-2 bg-gray-900 text-white rounded-md border border-gray-600 hover:bg-gray-700 transition-colors disabled:opacity-50 text-sm"
        type="button"
      >
        {isSelecting ? 'Selecting...' : 'Choose Directory'}
      </button>
    </div>
  )
}
