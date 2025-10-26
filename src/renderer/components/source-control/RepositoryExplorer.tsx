import React from 'react'
import { Result } from '@effect-atom/atom-react'
import { useAllRepositories, useDiscoverRepositories } from '../../hooks/useSourceControl'
import { ErrorAlert, LoadingSpinner } from '../ui/ErrorAlert'
import type { Repository } from '../../../shared/schemas/source-control'

/**
 * RepositoryItem Component
 *
 * Displays a single repository with its metadata
 */
interface RepositoryItemProps {
  repository: Repository
  onSelect?: (repository: Repository) => void
}

function RepositoryItem({ repository, onSelect }: RepositoryItemProps) {
  const currentBranch = repository.state.branch?.value ?? 'detached'
  const remotesCount = repository.remotes.length
  const branchesCount = repository.branches.length

  return (
    <div
      className="bg-gray-800 rounded-lg p-4 border border-gray-700 hover:border-gray-600 transition-colors cursor-pointer"
      onClick={() => onSelect?.(repository)}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h4 className="font-medium text-white truncate">{repository.name}</h4>
          <p className="text-sm text-gray-400 mt-1 truncate">{repository.path}</p>
        </div>
        {repository.state.isDetached && (
          <span className="px-2 py-1 text-xs bg-yellow-900 text-yellow-200 rounded">
            Detached
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center gap-4 text-sm text-gray-400">
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 bg-green-500 rounded-full"></span>
          <span>{currentBranch}</span>
        </div>
        <div>{branchesCount} branches</div>
        {remotesCount > 0 && <div>{remotesCount} remotes</div>}
      </div>

      {repository.state.isMerging && (
        <div className="mt-2 px-2 py-1 text-xs bg-orange-900 text-orange-200 rounded inline-block">
          Merging
        </div>
      )}
      {repository.state.isRebasing && (
        <div className="mt-2 px-2 py-1 text-xs bg-purple-900 text-purple-200 rounded inline-block">
          Rebasing
        </div>
      )}
      {repository.state.isCherryPicking && (
        <div className="mt-2 px-2 py-1 text-xs bg-pink-900 text-pink-200 rounded inline-block">
          Cherry-picking
        </div>
      )}
    </div>
  )
}

/**
 * RepositoryExplorer Component
 *
 * Main component for exploring Git repositories.
 *
 * Features:
 * - Displays all discovered repositories
 * - Shows repository status (branch, remotes, operation state)
 * - Provides repository selection
 * - Uses Result.builder pattern for exhaustive error handling
 *
 * Usage:
 * ```tsx
 * <RepositoryExplorer onRepositorySelect={(repo) => console.log(repo)} />
 * ```
 */
interface RepositoryExplorerProps {
  /**
   * Callback when a repository is selected
   */
  onRepositorySelect?: (repository: Repository) => void

  /**
   * Optional search paths for repository discovery
   * If not provided, shows all known repositories
   */
  searchPaths?: string[]
}

export function RepositoryExplorer({
  onRepositorySelect,
  searchPaths,
}: RepositoryExplorerProps) {
  // Use discovery if search paths provided, otherwise show all repos
  const { repositoriesResult: discoveredResult, refresh: refreshDiscovered } =
    useDiscoverRepositories(searchPaths ?? [])
  const { repositoriesResult: allResult, refresh: refreshAll } = useAllRepositories()

  const repositoriesResult = searchPaths ? discoveredResult : allResult
  const refresh = searchPaths ? refreshDiscovered : refreshAll

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">Git Repositories</h2>
        <button
          onClick={refresh}
          className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
        >
          Refresh
        </button>
      </div>

      {Result.builder(repositoriesResult)
        .onInitial(() => (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner size="lg" />
          </div>
        ))
        .onErrorTag('NetworkError', (error) => (
          <ErrorAlert
            error={error}
            message="Failed to load repositories"
          />
        ))
        .onErrorTag('GitOperationError', (error) => (
          <ErrorAlert
            error={error}
            message="Git operation failed"
          />
        ))
        .onErrorTag('ValidationError', (error) => (
          <ErrorAlert
            error={error}
            message="Invalid repository data"
          />
        ))
        .onDefect((defect) => (
          <ErrorAlert message={`Unexpected error: ${String(defect)}`} />
        ))
        .onSuccess((data) => {
          const repositories = data.value

          if (repositories.length === 0) {
            return (
              <div className="text-center py-12">
                <p className="text-gray-400 mb-4">No repositories found</p>
                {searchPaths && (
                  <p className="text-sm text-gray-500">
                    Try searching in different directories
                  </p>
                )}
              </div>
            )
          }

          return (
            <div className="space-y-3">
              <p className="text-sm text-gray-400">
                {repositories.length} {repositories.length === 1 ? 'repository' : 'repositories'} found
              </p>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {repositories.map((repo) => (
                  <RepositoryItem
                    key={repo.id.value}
                    repository={repo}
                    onSelect={onRepositorySelect}
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
