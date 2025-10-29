import React, { useState } from 'react'
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
 * - File changes list (placeholder for now)
 * - Close button
 * - Responsive layout
 *
 * Usage:
 * ```tsx
 * <CommitDetailsPanel
 *   repositoryId={repositoryId}
 *   commitHash={selectedCommitHash}
 *   onClose={() => setSelectedCommit(null)}
 * />
 * ```
 */

interface CommitDetailsPanelProps {
  /** Repository ID */
  repositoryId: RepositoryId

  /** Commit hash to display */
  commitHash: string

  /** Callback when close button clicked */
  onClose: () => void
}

export function CommitDetailsPanel({
  repositoryId,
  commitHash,
  onClose,
}: CommitDetailsPanelProps) {
  const { commitResult } = useCommit(repositoryId, commitHash)
  const [activeTab, setActiveTab] = useState<'info' | 'files'>('info')

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
            <ErrorAlert error={error} message="Commit not found" />
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
                  repositoryId={repositoryId.value}
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
