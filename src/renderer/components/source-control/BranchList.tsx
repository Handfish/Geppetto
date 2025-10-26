import React from 'react'
import { Result } from '@effect-atom/atom-react'
import { useRepositoryById } from '../../hooks/useSourceControl'
import { ErrorAlert, LoadingSpinner } from '../ui/ErrorAlert'
import type {
  RepositoryId,
  Branch,
} from '../../../shared/schemas/source-control'

/**
 * BranchItem Component
 *
 * Displays a single branch with its metadata
 */
interface BranchItemProps {
  branch: Branch
  isCurrent: boolean
  onClick?: (branch: Branch) => void
}

function BranchItem({ branch, isCurrent, onClick }: BranchItemProps) {
  const isLocal = branch.type === 'local'
  const isRemote = branch.type === 'remote'
  const shortCommit = branch.commit.value.slice(0, 7)

  return (
    <div
      className={`
        bg-gray-800 rounded-lg p-3 border transition-colors cursor-pointer
        ${isCurrent ? 'border-green-500' : 'border-gray-700 hover:border-gray-600'}
      `}
      onClick={() => onClick?.(branch)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {isCurrent && (
              <span className="w-2 h-2 bg-green-500 rounded-full" title="Current branch"></span>
            )}
            <span className="text-sm font-medium text-white truncate">
              {branch.name.value}
            </span>
            {isLocal && (
              <span className="px-2 py-0.5 text-xs bg-blue-900 text-blue-200 rounded">
                local
              </span>
            )}
            {isRemote && (
              <span className="px-2 py-0.5 text-xs bg-purple-900 text-purple-200 rounded">
                remote
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs text-gray-400">
            <code className="font-mono">{shortCommit}</code>
            {branch.upstream && (
              <span className="truncate" title={`Tracking ${branch.upstream.value}`}>
                → {branch.upstream.value}
              </span>
            )}
          </div>
        </div>

        {branch.isDetached && (
          <span className="px-2 py-1 text-xs bg-yellow-900 text-yellow-200 rounded">
            Detached
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * BranchList Component
 *
 * Displays all branches for a repository.
 *
 * Features:
 * - Shows local and remote branches
 * - Highlights current branch
 * - Shows tracking relationships
 * - Supports branch filtering
 * - Provides branch selection
 *
 * Usage:
 * ```tsx
 * <BranchList
 *   repositoryId={repositoryId}
 *   filter="local"
 *   onBranchSelect={(branch) => console.log(branch)}
 * />
 * ```
 */
interface BranchListProps {
  /**
   * Repository ID to show branches for
   */
  repositoryId: RepositoryId

  /**
   * Filter branches by type
   */
  filter?: 'all' | 'local' | 'remote'

  /**
   * Callback when a branch is selected
   */
  onBranchSelect?: (branch: Branch) => void
}

export function BranchList({
  repositoryId,
  filter = 'all',
  onBranchSelect,
}: BranchListProps) {
  const { repositoryResult, refresh } = useRepositoryById(repositoryId)
  const [filterState, setFilterState] = React.useState(filter)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Branches</h3>
        <div className="flex items-center gap-2">
          <select
            value={filterState}
            onChange={(e) => setFilterState(e.target.value as 'all' | 'local' | 'remote')}
            className="px-2 py-1 text-sm bg-gray-700 text-white rounded border border-gray-600"
          >
            <option value="all">All</option>
            <option value="local">Local</option>
            <option value="remote">Remote</option>
          </select>
          <button
            onClick={refresh}
            className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {Result.builder(repositoryResult)
        .onInitial(() => (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner size="md" />
          </div>
        ))
        .onErrorTag('NetworkError', (error) => (
          <ErrorAlert error={error} message="Failed to load branches" />
        ))
        .onErrorTag('GitOperationError', (error) => (
          <ErrorAlert error={error} message="Git operation failed" />
        ))
        .onErrorTag('ValidationError', (error) => (
          <ErrorAlert error={error} message="Invalid repository data" />
        ))
        .onDefect((defect) => (
          <ErrorAlert message={`Unexpected error: ${String(defect)}`} />
        ))
        .onSuccess((data) => {
          const repository = data.value
          let branches = repository.branches

          // Apply filter
          if (filterState === 'local') {
            branches = branches.filter((b) => b.type === 'local')
          } else if (filterState === 'remote') {
            branches = branches.filter((b) => b.type === 'remote')
          }

          if (branches.length === 0) {
            return (
              <div className="text-center py-12">
                <p className="text-gray-400">
                  No {filterState === 'all' ? '' : filterState} branches found
                </p>
              </div>
            )
          }

          const currentBranchName = repository.state.branch?.value

          return (
            <div className="space-y-3">
              <p className="text-sm text-gray-400">
                {branches.length} {branches.length === 1 ? 'branch' : 'branches'}
              </p>

              <div className="space-y-2">
                {branches.map((branch) => (
                  <BranchItem
                    key={branch.name.value}
                    branch={branch}
                    isCurrent={branch.name.value === currentBranchName}
                    onClick={onBranchSelect}
                  />
                ))}
              </div>
            </div>
          )
        })
        .render()}
    </div>
  )
}

/**
 * RemoteList Component
 *
 * Displays all remotes for a repository.
 *
 * Usage:
 * ```tsx
 * <RemoteList repositoryId={repositoryId} />
 * ```
 */
interface RemoteListProps {
  repositoryId: RepositoryId
}

export function RemoteList({ repositoryId }: RemoteListProps) {
  const { repositoryResult } = useRepositoryById(repositoryId)

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-white">Remotes</h3>

      {Result.builder(repositoryResult)
        .onInitial(() => (
          <div className="flex items-center justify-center py-8">
            <LoadingSpinner size="sm" />
          </div>
        ))
        .onErrorTag('NetworkError', (error) => (
          <ErrorAlert error={error} message="Failed to load remotes" />
        ))
        .onErrorTag('GitOperationError', (error) => (
          <ErrorAlert error={error} message="Git operation failed" />
        ))
        .onErrorTag('ValidationError', (error) => (
          <ErrorAlert error={error} message="Invalid repository data" />
        ))
        .onDefect((defect) => (
          <ErrorAlert message={`Unexpected error: ${String(defect)}`} />
        ))
        .onSuccess((data) => {
          const repository = data.value
          const remotes = repository.remotes

          if (remotes.length === 0) {
            return (
              <div className="text-center py-8">
                <p className="text-gray-400">No remotes configured</p>
              </div>
            )
          }

          return (
            <div className="space-y-2">
              {remotes.map((remote) => (
                <div
                  key={remote.name.value}
                  className="bg-gray-800 rounded-lg p-3 border border-gray-700"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-medium text-white mb-1">
                        {remote.name.value}
                      </h4>
                      <div className="space-y-1 text-xs text-gray-400">
                        <p className="truncate" title={remote.fetchUrl.value}>
                          Fetch: {remote.fetchUrl.value}
                        </p>
                        {remote.pushUrl && (
                          <p className="truncate" title={remote.pushUrl.value}>
                            Push: {remote.pushUrl.value}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        })
        .render()}
    </div>
  )
}
