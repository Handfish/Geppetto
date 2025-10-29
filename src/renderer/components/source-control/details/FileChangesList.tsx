import React from 'react'
import { Result } from '@effect-atom/atom-react'
import { useCommitFiles } from '../../../hooks/useSourceControl'
import { ErrorAlert, LoadingSpinner } from '../../ui/ErrorAlert'
import type { RepositoryId, FileChange } from '../../../../shared/schemas/source-control'
import type {
  GitOperationError,
  NotFoundError,
  NetworkError,
} from '../../../../shared/schemas/errors'

/**
 * FileChangesList Component
 *
 * Displays the list of files changed in a commit.
 * Shows file path, status (added/modified/deleted), and stats (additions/deletions).
 */

interface FileChangesListProps {
  repositoryId: RepositoryId
  commitHash: string
}

/**
 * FileStatusBadge - Displays file change status with appropriate styling
 */
function FileStatusBadge({ status }: { status: FileChange['status'] }) {
  const colors = {
    added: 'bg-green-900 text-green-200',
    modified: 'bg-blue-900 text-blue-200',
    deleted: 'bg-red-900 text-red-200',
    renamed: 'bg-purple-900 text-purple-200',
    copied: 'bg-cyan-900 text-cyan-200',
    unmodified: 'bg-gray-700 text-gray-300',
    untracked: 'bg-yellow-900 text-yellow-200',
    ignored: 'bg-gray-600 text-gray-400',
    conflicted: 'bg-orange-900 text-orange-200',
  }

  const labels = {
    added: 'A',
    modified: 'M',
    deleted: 'D',
    renamed: 'R',
    copied: 'C',
    unmodified: '',
    untracked: '?',
    ignored: 'I',
    conflicted: 'U',
  }

  return (
    <span
      className={`inline-flex items-center justify-center w-5 h-5 text-xs font-mono font-semibold rounded ${colors[status]}`}
    >
      {labels[status]}
    </span>
  )
}

/**
 * FileChangeItem - Displays a single file change
 */
function FileChangeItem({ file }: { file: FileChange }) {
  return (
    <div className="flex items-start gap-3 py-2 px-3 hover:bg-gray-800 rounded transition-colors">
      <FileStatusBadge status={file.status} />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-white font-mono truncate">{file.path}</div>
        {file.oldPath && file.status === 'renamed' && (
          <div className="text-xs text-gray-400 font-mono truncate">
            ← {file.oldPath}
          </div>
        )}
      </div>
      {(file.additions !== undefined || file.deletions !== undefined) && (
        <div className="flex items-center gap-2 text-xs font-mono">
          {file.additions !== undefined && file.additions > 0 && (
            <span className="text-green-400">+{file.additions}</span>
          )}
          {file.deletions !== undefined && file.deletions > 0 && (
            <span className="text-red-400">-{file.deletions}</span>
          )}
        </div>
      )}
    </div>
  )
}

export function FileChangesList({
  repositoryId,
  commitHash,
}: FileChangesListProps) {
  const { filesResult } = useCommitFiles(repositoryId, commitHash)

  return Result.builder(filesResult)
    .onInitial(() => (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="md" />
      </div>
    ))
    .onErrorTag('NotFoundError', (error: NotFoundError) => (
      <ErrorAlert error={error} message="Commit not found" />
    ))
    .onErrorTag('NetworkError', (error: NetworkError) => (
      <ErrorAlert error={error} message="Failed to load commit files" />
    ))
    .onErrorTag('GitOperationError', (error: GitOperationError) => (
      <ErrorAlert error={error} message="Git operation failed" />
    ))
    .onDefect((defect: unknown) => (
      <ErrorAlert message={`Unexpected error: ${String(defect)}`} />
    ))
    .onSuccess((files: readonly FileChange[]) => {
      if (files.length === 0) {
        return (
          <div className="text-center py-12">
            <p className="text-gray-400">No files changed in this commit</p>
          </div>
        )
      }

      // Calculate total stats
      const totalAdditions = files.reduce(
        (sum, file) => sum + (file.additions ?? 0),
        0
      )
      const totalDeletions = files.reduce(
        (sum, file) => sum + (file.deletions ?? 0),
        0
      )

      return (
        <div className="space-y-4">
          {/* Summary */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">
              {files.length} {files.length === 1 ? 'file' : 'files'} changed
            </span>
            {(totalAdditions > 0 || totalDeletions > 0) && (
              <div className="flex items-center gap-3 font-mono text-xs">
                {totalAdditions > 0 && (
                  <span className="text-green-400">+{totalAdditions}</span>
                )}
                {totalDeletions > 0 && (
                  <span className="text-red-400">-{totalDeletions}</span>
                )}
              </div>
            )}
          </div>

          {/* File list */}
          <div className="border border-gray-700 rounded divide-y divide-gray-700">
            {files.map((file) => (
              <FileChangeItem key={file.path} file={file} />
            ))}
          </div>
        </div>
      )
    })
    .render()
}
