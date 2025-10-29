import React from 'react'

/**
 * FileChangesList Component
 *
 * Displays the list of files changed in a commit.
 * Shows file path, status (added/modified/deleted), and stats (additions/deletions).
 *
 * **NOTE**: This component is a placeholder. To implement fully, we need:
 * 1. New IPC contract: 'source-control:get-commit-files'
 * 2. Backend handler to get file changes for a commit
 * 3. Schema for commit file changes (can reuse FileChange from working-tree)
 * 4. Atom and hook for commit files
 *
 * For now, shows a message indicating the feature is pending backend support.
 */

interface FileChangesListProps {
  repositoryId: string
  commitHash: string
}

export function FileChangesList({
  repositoryId,
  commitHash,
}: FileChangesListProps) {
  return (
    <div className="p-4 border border-yellow-700 bg-yellow-900/20 rounded">
      <div className="flex items-start gap-3">
        <div className="text-yellow-400">
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <div className="flex-1 space-y-2">
          <h4 className="text-sm font-semibold text-yellow-200">
            File Changes List - Coming Soon
          </h4>
          <p className="text-xs text-yellow-100">
            To display file changes for this commit, we need to implement:
          </p>
          <ul className="text-xs text-yellow-100 list-disc list-inside space-y-1">
            <li>Backend IPC handler for getting commit file changes</li>
            <li>Atom and hook for fetching commit files</li>
            <li>UI for displaying file list with stats</li>
          </ul>
          <div className="text-xs text-yellow-200 font-mono bg-yellow-900/30 p-2 rounded mt-2">
            Commit: {commitHash.slice(0, 7)}
          </div>
        </div>
      </div>
    </div>
  )
}
