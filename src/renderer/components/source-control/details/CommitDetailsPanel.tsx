import React, { useState, useEffect } from 'react'
import { Result } from '@effect-atom/atom-react'
import { useCommit } from '../../../hooks/useSourceControl'
import { ErrorAlert, LoadingSpinner } from '../../ui/ErrorAlert'
import { CommitInfo } from './CommitInfo'
import { FileChangesList } from './FileChangesList'
import type { RepositoryId } from '../../../../shared/schemas/source-control'
import type {
  GitOperationError,
  NotFoundError,
  NetworkError,
} from '../../../../shared/schemas/errors'

/**
 * CommitDetailsPanel Component
 *
 * Side panel that displays detailed information about a selected commit.
 *
 * Features:
 * - Commit metadata (hash, author, message)
 * - File changes list
 * - Close button
 * - Responsive layout
 * - Automatic cache recovery on NotFoundError
 *
 * Usage:
 * ```tsx
 * <CommitDetailsPanel
 *   repositoryId={repositoryId}
 *   repositoryPath={repositoryPath}
 *   commitHash={selectedCommitHash}
 *   onClose={() => setSelectedCommit(null)}
 * />
 * ```
 */

interface CommitDetailsPanelProps {
  /** Repository ID */
  repositoryId: RepositoryId

  /** Repository path (for cache recovery) */
  repositoryPath: string

  /** Commit hash to display */
  commitHash: string

  /** Callback when close button clicked */
  onClose: () => void
}

export function CommitDetailsPanel({
  repositoryId,
  repositoryPath,
  commitHash,
  onClose,
}: CommitDetailsPanelProps) {
  const { commitResult, refresh } = useCommit(repositoryId, commitHash)
  const [activeTab, setActiveTab] = useState<'info' | 'files'>('info')
  const [autoRecoveryAttempted, setAutoRecoveryAttempted] = useState(false)

  // Automatic cache recovery on NotFoundError
  useEffect(() => {
    if (commitResult._tag === 'Failure' && !commitResult.waiting && !autoRecoveryAttempted) {
      Result.matchWithError(commitResult, {
        onInitial: () => {},
        onError: (error) => {
          if (error._tag === 'NotFoundError') {
            console.log('[CommitDetailsPanel] Cache miss detected, attempting automatic recovery...')
            setAutoRecoveryAttempted(true)

            // Attempt to refresh cache
            window.electron.ipcRenderer
              .invoke('source-control:get-repository', { path: repositoryPath })
              .then(() => {
                console.log('[CommitDetailsPanel] Cache refreshed successfully, retrying commit load...')
                refresh()
              })
              .catch((err) => {
                console.error('[CommitDetailsPanel] Cache refresh failed:', err)
              })
          }
        },
        onDefect: () => {},
        onSuccess: () => {},
      })
    }
  }, [commitResult, autoRecoveryAttempted, repositoryPath, refresh])

  // Reset recovery flag when switching commits or repositories
  useEffect(() => {
    setAutoRecoveryAttempted(false)
  }, [repositoryId, commitHash])

  return (
    <div className="flex flex-col h-full bg-gray-900 border-l border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <h2 className="text-lg font-semibold text-white">Commit Details</h2>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors"
          aria-label="Close"
        >
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
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-700">
        <button
          onClick={() => setActiveTab('info')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'info'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Info
        </button>
        <button
          onClick={() => setActiveTab('files')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'files'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Files
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {Result.builder(commitResult)
          .onInitial(() => (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner size="md" />
            </div>
          ))
          .onErrorTag('NotFoundError', (error: NotFoundError) => (
            <div className="p-4 border border-red-700 bg-red-900/20 rounded">
              <div className="flex items-start gap-3">
                <div className="text-red-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="flex-1 space-y-2">
                  <h4 className="text-sm font-semibold text-red-200">Repository Cache Error</h4>
                  <p className="text-xs text-red-100">
                    {autoRecoveryAttempted
                      ? 'Automatic cache recovery failed. The commit could not be loaded.'
                      : 'Attempting to refresh repository cache...'}
                  </p>
                  {autoRecoveryAttempted && (
                    <>
                      <p className="text-xs text-red-100 font-mono">
                        Commit: {commitHash.slice(0, 7)}
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setAutoRecoveryAttempted(false)
                            refresh()
                          }}
                          className="mt-2 px-3 py-1 text-xs bg-red-700 hover:bg-red-600 text-white rounded transition-colors"
                        >
                          Retry
                        </button>
                        <button
                          onClick={onClose}
                          className="mt-2 px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
                        >
                          Close Panel
                        </button>
                      </div>
                      <p className="text-xs text-red-200 mt-2">
                        <strong>Note:</strong> Please re-select the repository from the Repositories tab.
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))
          .onErrorTag('NetworkError', (error: NetworkError) => (
            <ErrorAlert error={error} message="Failed to load commit" />
          ))
          .onErrorTag('GitOperationError', (error: GitOperationError) => (
            <ErrorAlert error={error} message="Git operation failed" />
          ))
          .onDefect((defect: unknown) => (
            <ErrorAlert message={`Unexpected error: ${String(defect)}`} />
          ))
          .onSuccess((commit) => (
            <>
              {activeTab === 'info' && <CommitInfo commit={commit} />}
              {activeTab === 'files' && (
                <FileChangesList
                  repositoryId={repositoryId}
                  commitHash={commitHash}
                />
              )}
            </>
          ))
          .render()}
      </div>
    </div>
  )
}
