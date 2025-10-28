import React, { useState } from 'react'
import { Result } from '@effect-atom/atom-react'
import { useCommitGraph, useCommitHistory } from '../../hooks/useSourceControl'
import { ErrorAlert, LoadingSpinner } from '../ui/ErrorAlert'
import { GraphStage } from './graph'
import type {
  RepositoryId,
  CommitGraph as CommitGraphType,
  GraphOptions,
  Commit,
} from '../../../shared/schemas/source-control'
import type {
  NetworkError,
  GitOperationError,
  NotFoundError,
} from '../../../shared/schemas/errors'

/**
 * CommitNode Component
 *
 * Displays a single commit in the graph
 */
interface CommitNodeProps {
  commit: {
    hash: string
    subject: string
    author: {
      name: string
      email: string
      timestamp: Date
    }
    parents: string[]
  }
  refs: string[]
  isHead: boolean
  onClick?: (hash: string) => void
}

function CommitNode({ commit, refs, isHead, onClick }: CommitNodeProps) {
  const shortHash = commit.hash.slice(0, 7)
  const date = new Date(commit.author.timestamp).toLocaleDateString()

  return (
    <div
      className="bg-gray-800 rounded-lg p-3 border border-gray-700 hover:border-gray-600 transition-colors cursor-pointer"
      onClick={() => onClick?.(commit.hash)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <code className="text-xs font-mono text-blue-400">{shortHash}</code>
            {isHead && (
              <span className="px-2 py-0.5 text-xs bg-green-900 text-green-200 rounded">
                HEAD
              </span>
            )}
            {refs.map((ref) => (
              <span
                key={ref}
                className="px-2 py-0.5 text-xs bg-purple-900 text-purple-200 rounded"
              >
                {ref}
              </span>
            ))}
          </div>
          <p className="text-sm text-white truncate">{commit.subject}</p>
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
            <span>{commit.author.name}</span>
            <span>{date}</span>
          </div>
        </div>
        {commit.parents.length > 1 && (
          <div className="text-xs text-gray-500" title="Merge commit">
            {commit.parents.length} parents
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * CommitGraphView Component
 *
 * Displays the commit graph for a repository.
 *
 * Features:
 * - Shows commits in a list view (simplified graph)
 * - Displays commit metadata (hash, message, author, date)
 * - Shows refs (branches, tags) on commits
 * - Highlights HEAD commit
 * - Supports commit selection
 *
 * Usage:
 * ```tsx
 * <CommitGraphView
 *   repositoryId={repositoryId}
 *   options={{ maxCommits: 50 }}
 *   onCommitSelect={(hash) => console.log(hash)}
 * />
 * ```
 */
interface CommitGraphViewProps {
  /**
   * Repository ID to show graph for
   */
  repositoryId: RepositoryId

  /**
   * Graph options (max commits, branches, etc.)
   */
  options?: GraphOptions

  /**
   * Callback when a commit is selected
   */
  onCommitSelect?: (commitHash: string) => void
}

export function CommitGraphView({
  repositoryId,
  options,
  onCommitSelect,
}: CommitGraphViewProps) {
  const { graphResult, refresh } = useCommitGraph(repositoryId, options)
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null)

  const handleCommitSelect = (hash: string) => {
    setSelectedCommit(hash)
    onCommitSelect?.(hash)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Commit Graph</h3>
        <button
          onClick={refresh}
          className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
        >
          Refresh
        </button>
      </div>

      {Result.builder(graphResult)
        .onInitial(() => (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner size="md" />
          </div>
        ))
        .onErrorTag('NotFoundError', (error: NotFoundError) => (
          <ErrorAlert error={error} message="Repository not found" />
        ))
        .onErrorTag('NetworkError', (error: NetworkError) => (
          <ErrorAlert error={error} message="Failed to load commit graph" />
        ))
        .onErrorTag('GitOperationError', (error: GitOperationError) => (
          <ErrorAlert error={error} message="Git operation failed" />
        ))
        .onDefect((defect: unknown) => (
          <ErrorAlert message={`Unexpected error: ${String(defect)}`} />
        ))
        .onSuccess((graph: CommitGraphType) => {
          if (!graph || graph.nodes.length === 0) {
            return (
              <div className="text-center py-12">
                <p className="text-gray-400">No commits found</p>
              </div>
            )
          }

          return (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm text-gray-400">
                <span>
                  {graph.totalCommits}{' '}
                  {graph.totalCommits === 1 ? 'commit' : 'commits'}
                </span>
                <span>{graph.totalBranches} branches</span>
              </div>

              {/* PixiJS Visual Graph */}
              <GraphStage
                graph={graph}
                selectedCommit={selectedCommit ?? undefined}
                onCommitSelect={handleCommitSelect}
                width={800}
                height={600}
              />

              {graph.nodes.length < graph.totalCommits && (
                <div className="text-center py-2 text-sm text-gray-500">
                  Showing {graph.nodes.length} of {graph.totalCommits} commits
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
 * CommitHistoryList Component
 *
 * Displays commit history for a specific branch.
 * Simpler alternative to full commit graph.
 *
 * Usage:
 * ```tsx
 * <CommitHistoryList
 *   repositoryId={repositoryId}
 *   branchName="main"
 *   maxCount={20}
 * />
 * ```
 */
interface CommitHistoryListProps {
  repositoryId: RepositoryId
  branchName: string
  maxCount?: number
  onCommitSelect?: (commitHash: string) => void
}

export function CommitHistoryList({
  repositoryId,
  branchName,
  maxCount = 50,
  onCommitSelect,
}: CommitHistoryListProps) {
  const { historyResult } = useCommitHistory(repositoryId, branchName, maxCount)

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-white">
        Commits on <span className="text-blue-400">{branchName}</span>
      </h3>

      {Result.builder(historyResult)
        .onInitial(() => (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner size="md" />
          </div>
        ))
        .onErrorTag('NotFoundError', (error: NotFoundError) => (
          <ErrorAlert error={error} message="Repository not found" />
        ))
        .onErrorTag('NetworkError', (error: NetworkError) => (
          <ErrorAlert error={error} message="Failed to load commit history" />
        ))
        .onErrorTag('GitOperationError', (error: GitOperationError) => (
          <ErrorAlert error={error} message="Git operation failed" />
        ))
        .onDefect((defect: unknown) => (
          <ErrorAlert message={`Unexpected error: ${String(defect)}`} />
        ))
        .onSuccess((commits: readonly Commit[]) => {

          if (commits.length === 0) {
            return (
              <div className="text-center py-12">
                <p className="text-gray-400">No commits found</p>
              </div>
            )
          }

          return (
            <div className="space-y-2">
              {commits.map((commit: Commit) => (
                <CommitNode
                  key={commit.hash}
                  commit={{
                    hash: commit.hash,
                    subject: commit.subject,
                    author: commit.author,
                    parents: commit.parents as unknown as string[],
                  }}
                  refs={[]}
                  isHead={false}
                  onClick={onCommitSelect}
                />
              ))}
            </div>
          )
        })
        .render()}
    </div>
  )
}
