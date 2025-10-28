import React from 'react'
import { Result } from '@effect-atom/atom-react'
import {
  useWorkingTreeStatus,
  useWorkingTreeStatusSummary,
  useStageFiles,
  useUnstageFiles,
  useDiscardChanges,
} from '../../hooks/useSourceControl'
import { ErrorAlert, LoadingSpinner } from '../ui/ErrorAlert'
import type {
  RepositoryId,
  WorkingTree,
  FileChange,
  MergeConflict,
  WorkingTreeStatus,
} from '../../../shared/schemas/source-control'
import type {
  NetworkError,
  GitOperationError,
  ValidationError,
} from '../../../shared/schemas/errors'

/**
 * FileChangeItem Component
 *
 * Displays a single file change with actions
 */
interface FileChangeItemProps {
  change: FileChange
  onStage?: (path: string) => void
  onUnstage?: (path: string) => void
  onDiscard?: (path: string) => void
}

function FileChangeItem({
  change,
  onStage,
  onUnstage,
  onDiscard,
}: FileChangeItemProps) {
  const statusColor = {
    modified: 'text-yellow-400',
    added: 'text-green-400',
    deleted: 'text-red-400',
    renamed: 'text-blue-400',
    copied: 'text-purple-400',
    untracked: 'text-gray-400',
    ignored: 'text-gray-600',
    conflicted: 'text-red-500',
    unmodified: 'text-gray-500',
  }[change.status]

  const statusLabel = {
    modified: 'M',
    added: 'A',
    deleted: 'D',
    renamed: 'R',
    copied: 'C',
    untracked: 'U',
    ignored: 'I',
    conflicted: 'C!',
    unmodified: '',
  }[change.status]

  return (
    <div className="bg-gray-800 rounded p-2 border border-gray-700 hover:border-gray-600 transition-colors">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className={`text-xs font-mono font-bold w-6 ${statusColor}`}>
            {statusLabel}
          </span>
          <span className="text-sm text-white truncate">{change.path}</span>
          {change.staged && (
            <span className="px-1 py-0.5 text-xs bg-green-900 text-green-200 rounded">
              staged
            </span>
          )}
          {change.oldPath && (
            <span className="text-xs text-gray-500">← {change.oldPath}</span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {change.staged ? (
            <button
              onClick={() => onUnstage?.(change.path)}
              className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded"
              title="Unstage"
            >
              Unstage
            </button>
          ) : (
            <button
              onClick={() => onStage?.(change.path)}
              className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded"
              title="Stage"
            >
              Stage
            </button>
          )}
          {!change.staged && change.status !== 'untracked' && (
            <button
              onClick={() => onDiscard?.(change.path)}
              className="px-2 py-1 text-xs bg-red-900 hover:bg-red-800 text-red-200 rounded"
              title="Discard changes"
            >
              Discard
            </button>
          )}
        </div>
      </div>

      {change.additions !== undefined && change.deletions !== undefined && (
        <div className="mt-1 text-xs text-gray-500">
          <span className="text-green-400">+{change.additions}</span>
          {' / '}
          <span className="text-red-400">-{change.deletions}</span>
        </div>
      )}
    </div>
  )
}

/**
 * StatusBar Component
 *
 * Displays working tree status and provides file operations.
 *
 * Features:
 * - Shows staged, unstaged, and untracked files
 * - Shows conflicts
 * - Provides stage/unstage/discard actions
 * - Shows ahead/behind remote tracking
 * - Auto-refreshes status
 *
 * Usage:
 * ```tsx
 * <StatusBar repositoryId={repositoryId} />
 * ```
 */
interface StatusBarProps {
  /**
   * Repository ID to show status for
   */
  repositoryId: RepositoryId

  /**
   * Auto-refresh interval in seconds (default: 5)
   */
  refreshInterval?: number
}

export function StatusBar({
  repositoryId,
  refreshInterval = 5,
}: StatusBarProps) {
  const { statusResult, refresh } = useWorkingTreeStatus(repositoryId)
  const { stage } = useStageFiles()
  const { unstage } = useUnstageFiles()
  const { discard } = useDiscardChanges()

  // Auto-refresh
  React.useEffect(() => {
    const interval = setInterval(refresh, refreshInterval * 1000)
    return () => clearInterval(interval)
  }, [refresh, refreshInterval])

  const handleStage = (path: string) => {
    stage({ repositoryId, paths: [path] })
  }

  const handleUnstage = (path: string) => {
    unstage({ repositoryId, paths: [path] })
  }

  const handleDiscard = (path: string) => {
    if (confirm(`Discard changes to ${path}? This cannot be undone.`)) {
      discard({ repositoryId, paths: [path] })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Working Tree</h3>
        <button
          onClick={refresh}
          className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
        >
          Refresh
        </button>
      </div>

      {Result.builder(statusResult)
        .onInitial(() => (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner size="md" />
          </div>
        ))
        .onErrorTag('NetworkError', (error: NetworkError) => (
          <ErrorAlert error={error} message="Failed to load status" />
        ))
        .onErrorTag('GitOperationError', (error: GitOperationError) => (
          <ErrorAlert error={error} message="Git operation failed" />
        ))
        .onErrorTag('ValidationError', (error: ValidationError) => (
          <ErrorAlert error={error} message="Invalid status data" />
        ))
        .onDefect((defect: unknown) => (
          <ErrorAlert message={`Unexpected error: ${String(defect)}`} />
        ))
        .onSuccess((workingTree: WorkingTree) => {

          if (!workingTree) {
            return (
              <div className="text-center py-12">
                <p className="text-gray-400">No status available</p>
              </div>
            )
          }

          const stagedChanges = workingTree.changes.filter((c: FileChange) => c.staged)
          const unstagedChanges = workingTree.changes.filter((c: FileChange) => !c.staged)
          const conflicts = workingTree.conflicts

          const isClean =
            stagedChanges.length === 0 &&
            unstagedChanges.length === 0 &&
            conflicts.length === 0

          return (
            <div className="space-y-4">
              {/* Status Summary */}
              <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1">
                      <span className="text-gray-400">Staged:</span>
                      <span className="text-white font-medium">
                        {workingTree.status.staged}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-gray-400">Unstaged:</span>
                      <span className="text-white font-medium">
                        {workingTree.status.unstaged}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-gray-400">Untracked:</span>
                      <span className="text-white font-medium">
                        {workingTree.status.untracked}
                      </span>
                    </div>
                    {workingTree.status.conflicts > 0 && (
                      <div className="flex items-center gap-1">
                        <span className="text-red-400">Conflicts:</span>
                        <span className="text-red-200 font-medium">
                          {workingTree.status.conflicts}
                        </span>
                      </div>
                    )}
                  </div>

                  {(workingTree.status.ahead > 0 || workingTree.status.behind > 0) && (
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      {workingTree.status.ahead > 0 && (
                        <span className="text-green-400">↑ {workingTree.status.ahead}</span>
                      )}
                      {workingTree.status.behind > 0 && (
                        <span className="text-blue-400">↓ {workingTree.status.behind}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {isClean ? (
                <div className="text-center py-12">
                  <p className="text-green-400">Working tree clean</p>
                  <p className="text-sm text-gray-500 mt-1">No changes to commit</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Conflicts */}
                  {conflicts.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-red-400">
                        Conflicts ({conflicts.length})
                      </h4>
                      <div className="space-y-1">
                        {conflicts.map((conflict: MergeConflict) => (
                          <div
                            key={conflict.path}
                            className="bg-red-900 bg-opacity-20 rounded p-2 border border-red-800"
                          >
                            <span className="text-sm text-red-200">{conflict.path}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Staged Changes */}
                  {stagedChanges.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-green-400">
                        Staged Changes ({stagedChanges.length})
                      </h4>
                      <div className="space-y-1">
                        {stagedChanges.map((change: FileChange) => (
                          <FileChangeItem
                            key={change.path}
                            change={change}
                            onUnstage={handleUnstage}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Unstaged Changes */}
                  {unstagedChanges.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-yellow-400">
                        Changes ({unstagedChanges.length})
                      </h4>
                      <div className="space-y-1">
                        {unstagedChanges.map((change: FileChange) => (
                          <FileChangeItem
                            key={change.path}
                            change={change}
                            onStage={handleStage}
                            onDiscard={handleDiscard}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })
        .render()}
    </div>
  )
}

/**
 * StatusSummary Component
 *
 * Compact status summary for status bars or headers.
 *
 * Usage:
 * ```tsx
 * <StatusSummary repositoryId={repositoryId} />
 * ```
 */
interface StatusSummaryProps {
  repositoryId: RepositoryId
}

export function StatusSummary({ repositoryId }: StatusSummaryProps) {
  const { summaryResult } = useWorkingTreeStatusSummary(repositoryId)

  return Result.builder(summaryResult)
    .onInitial(() => (
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <LoadingSpinner size="sm" />
        <span>Loading status...</span>
      </div>
    ))
    .onErrorTag('NetworkError', (_error: NetworkError) => (
      <span className="text-sm text-red-400">Status error</span>
    ))
    .onErrorTag('GitOperationError', (_error: GitOperationError) => (
      <span className="text-sm text-red-400">Git error</span>
    ))
    .onErrorTag('ValidationError', (_error: ValidationError) => (
      <span className="text-sm text-red-400">Invalid status</span>
    ))
    .onDefect((_defect: unknown) => <span className="text-sm text-red-400">Error</span>)
    .onSuccess((summary: WorkingTreeStatus) => {

      if (!summary) {
        return <span className="text-sm text-gray-400">No status</span>
      }

      const isClean =
        summary.staged === 0 &&
        summary.unstaged === 0 &&
        summary.untracked === 0 &&
        summary.conflicts === 0

      if (isClean) {
        return (
          <span className="text-sm text-green-400 flex items-center gap-1">
            <span className="w-2 h-2 bg-green-500 rounded-full"></span>
            Clean
          </span>
        )
      }

      return (
        <div className="flex items-center gap-3 text-sm text-gray-400">
          {summary.staged > 0 && (
            <span className="text-green-400">{summary.staged} staged</span>
          )}
          {summary.unstaged > 0 && (
            <span className="text-yellow-400">{summary.unstaged} modified</span>
          )}
          {summary.untracked > 0 && (
            <span className="text-gray-400">{summary.untracked} untracked</span>
          )}
          {summary.conflicts > 0 && (
            <span className="text-red-400">{summary.conflicts} conflicts</span>
          )}
          {(summary.ahead > 0 || summary.behind > 0) && (
            <span>
              {summary.ahead > 0 && (
                <span className="text-green-400">↑{summary.ahead}</span>
              )}
              {summary.behind > 0 && (
                <span className="text-blue-400 ml-1">↓{summary.behind}</span>
              )}
            </span>
          )}
        </div>
      )
    })
    .render()
}
