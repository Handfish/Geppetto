import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Result } from '@effect-atom/atom-react'
import { useCommitGraph, useCommitHistory, useCommit } from '../../hooks/useSourceControl'
import { useGraphSettings } from '../../hooks/useGraphSettings'
import { useGraphKeyboardShortcuts } from '../../hooks/useGraphKeyboardShortcuts'
import { ErrorAlert, LoadingSpinner } from '../ui/ErrorAlert'
import { GraphStage } from './graph'
import { CommitDetailsPanel } from './details'
import { GraphFilters } from './GraphFilters'
import { CommitContextMenu } from './CommitContextMenu'
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
 * - Automatic cache recovery on NotFoundError
 *
 * Usage:
 * ```tsx
 * <CommitGraphView
 *   repositoryId={repositoryId}
 *   repositoryPath={repositoryPath}
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
   * Repository path (for cache recovery)
   */
  repositoryPath: string

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
  repositoryPath,
  options,
  onCommitSelect,
}: CommitGraphViewProps) {
  // Graph settings with persistence
  const { settings, updateFilters, updateDisplay, resetToDefaults } = useGraphSettings()

  // Merge parent options with persisted settings
  const mergedOptions: GraphOptions | undefined = useMemo(() => {
    // Start with defaults
    const defaults: GraphOptions = {
      maxCommits: 20,
      layoutAlgorithm: 'topological',
    }

    // Merge: defaults → parent options → persisted settings
    return {
      ...defaults,
      ...options,
      ...settings,
    } as GraphOptions
  }, [options, settings])

  const { graphResult, refresh } = useCommitGraph(repositoryId, mergedOptions)
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null)
  const [autoRecoveryAttempted, setAutoRecoveryAttempted] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [contextMenu, setContextMenu] = useState<{
    commit: Commit
    position: { x: number; y: number }
  } | null>(null)
  const [zoomLevel, setZoomLevel] = useState(1.0)

  // Refs for keyboard shortcuts
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Ref for graph container to measure dimensions
  const [graphDimensions, setGraphDimensions] = useState<{ width: number; height: number } | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const timeoutsRef = useRef<NodeJS.Timeout[]>([])
  const containerElementRef = useRef<HTMLDivElement | null>(null)

  // Shared dimension update function
  const updateDimensions = useCallback(() => {
    const container = containerElementRef.current
    if (!container) return

    const rect = container.getBoundingClientRect()
    const width = rect.width
    const height = rect.height

    // Skip if container hasn't been laid out yet
    if (width === 0 || height === 0) return

    // Use full container dimensions (GraphStage handles its own borders)
    const finalWidth = Math.max(width, 400)
    const finalHeight = Math.max(height, 400)

    // Only update if dimensions changed significantly (or first measurement)
    setGraphDimensions((prev) => {
      const widthChanged = !prev || Math.abs(prev.width - finalWidth) > 2
      const heightChanged = !prev || Math.abs(prev.height - finalHeight) > 2

      if (widthChanged || heightChanged) {
        return { width: finalWidth, height: finalHeight }
      }

      return prev
    })
  }, [])

  // Callback ref for the graph container - sets up ResizeObserver when element is created
  const graphContainerRef = useCallback((container: HTMLDivElement | null) => {
    // Store the container element for later access
    containerElementRef.current = container

    // Clean up previous observer if it exists
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect()
      timeoutsRef.current.forEach(clearTimeout)
      timeoutsRef.current = []
    }

    if (!container) return

    let debounceTimeout: NodeJS.Timeout | null = null

    // Create ResizeObserver with aggressive debouncing for best performance
    const resizeObserver = new ResizeObserver(() => {
      if (debounceTimeout) {
        clearTimeout(debounceTimeout)
      }
      // Debounce by 150ms for optimal performance
      // Only updates after user stops resizing for 150ms
      debounceTimeout = setTimeout(() => {
        updateDimensions()
      }, 150)
    })

    resizeObserverRef.current = resizeObserver
    resizeObserver.observe(container)

    // Initial measurement and delayed retry for layout completion
    updateDimensions()
    timeoutsRef.current.push(setTimeout(updateDimensions, 100))

    // Store debounce timeout for cleanup
    if (debounceTimeout) {
      timeoutsRef.current.push(debounceTimeout)
    }
  }, [updateDimensions])

  // REMOVED: Manual dimension update on selectedCommit change
  // The ResizeObserver should automatically detect the container resize when details panel opens/closes

  // Zoom control callbacks
  const handleZoomIn = useCallback(() => {
    setZoomLevel((prev) => Math.min(2.0, prev + 0.1))
  }, [])

  const handleZoomOut = useCallback(() => {
    setZoomLevel((prev) => Math.max(0.5, prev - 0.1))
  }, [])

  const handleResetZoom = useCallback(() => {
    setZoomLevel(1.0)
  }, [])

  // Keyboard shortcuts
  useGraphKeyboardShortcuts({
    onFocusSearch: () => searchInputRef.current?.focus(),
    onRefresh: refresh,
    onZoomIn: handleZoomIn,
    onZoomOut: handleZoomOut,
    onResetZoom: handleResetZoom,
    onClearSelection: () => setSelectedCommit(null),
  })

  // Apply client-side search filtering to graph result
  const filteredGraphResult = useMemo(() => {
    if (graphResult._tag !== 'Success' || !searchText.trim()) {
      return graphResult
    }

    const graph = graphResult.value
    const searchLower = searchText.toLowerCase()

    // Filter nodes based on commit subject/message
    const filteredNodes = graph.nodes.filter((node) => {
      const subjectMatch = node.commit.subject.toLowerCase().includes(searchLower)
      const messageMatch = node.commit.message.toLowerCase().includes(searchLower)
      const hashMatch = String(node.commit.hash).toLowerCase().includes(searchLower)
      return subjectMatch || messageMatch || hashMatch
    })

    // Keep only edges where both nodes exist in filtered nodes
    const nodeHashSet = new Set(filteredNodes.map((n) => String(n.id)))
    const filteredEdges = graph.edges.filter(
      (edge) => nodeHashSet.has(String(edge.from)) && nodeHashSet.has(String(edge.to))
    )

    // Return filtered graph
    return {
      ...graphResult,
      value: {
        ...graph,
        nodes: filteredNodes,
        edges: filteredEdges,
      },
    }
  }, [graphResult, searchText])

  // Extract available authors and branches from graph data
  const { availableAuthors, availableBranches } = useMemo(() => {
    if (graphResult._tag !== 'Success') {
      return { availableAuthors: [], availableBranches: [] }
    }

    const graph = graphResult.value
    const authorsSet = new Set<string>()
    const branchesSet = new Set<string>()

    // Extract unique authors from commits
    graph.nodes.forEach((node) => {
      authorsSet.add(node.commit.author.name)
    })

    // Extract branch names from refs
    graph.nodes.forEach((node) => {
      node.refs.forEach((ref) => {
        // Simple branch name extraction (refs like "origin/main", "main", etc.)
        if (ref.includes('/')) {
          const parts = ref.split('/')
          branchesSet.add(parts[parts.length - 1])
        } else {
          branchesSet.add(ref)
        }
      })
    })

    return {
      availableAuthors: Array.from(authorsSet).sort(),
      availableBranches: Array.from(branchesSet).sort(),
    }
  }, [graphResult])

  const handleCommitSelect = (hash: string) => {
    setSelectedCommit(hash)
    onCommitSelect?.(hash)
  }

  const handleCommitContextMenu = (hash: string, position: { x: number; y: number }) => {
    // Find the commit in the graph
    if (filteredGraphResult._tag === 'Success') {
      const node = filteredGraphResult.value.nodes.find((n) => String(n.id) === hash)
      if (node) {
        setContextMenu({
          commit: node.commit,
          position,
        })
      }
    }
  }

  // Automatic cache recovery on NotFoundError
  useEffect(() => {
    if (graphResult._tag === 'Failure' && !graphResult.waiting && !autoRecoveryAttempted) {
      Result.matchWithError(graphResult, {
        onInitial: () => {},
        onError: (error) => {
          if (error._tag === 'NotFoundError') {
            setAutoRecoveryAttempted(true)
            // Attempt to refresh cache
            window.electron.ipcRenderer
              .invoke('source-control:get-repository', { path: repositoryPath })
              .then(() => refresh())
              .catch((err) => console.error('[CommitGraphView] Cache refresh failed:', err))
          }
        },
        onDefect: () => {},
        onSuccess: () => {},
      })
    }
  }, [graphResult, autoRecoveryAttempted, repositoryPath, refresh])

  // Reset recovery flag when switching repositories
  useEffect(() => {
    setAutoRecoveryAttempted(false)
  }, [repositoryId])

  return (
    <div className="flex flex-col h-full space-y-4">
      <div className="flex items-center justify-between flex-shrink-0">
        <h3 className="text-lg font-semibold text-white">Commit Graph</h3>
        <button
          onClick={refresh}
          className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex-shrink-0">
        <GraphFilters
          ref={searchInputRef}
          options={settings}
          onOptionsChange={updateFilters}
          displaySettings={settings.display}
          onDisplayChange={updateDisplay}
          onReset={resetToDefaults}
          availableBranches={availableBranches}
          availableAuthors={availableAuthors}
          searchText={searchText}
          onSearchChange={setSearchText}
        />
      </div>

      {Result.builder(filteredGraphResult)
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
                    ? 'Automatic cache recovery failed. The repository could not be loaded.'
                    : 'Attempting to refresh repository cache...'}
                </p>
                {autoRecoveryAttempted && (
                  <>
                    <p className="text-xs text-red-100 font-mono">
                      Repository ID: {repositoryId.value.slice(0, 8)}...
                    </p>
                    <button
                      onClick={() => {
                        setAutoRecoveryAttempted(false)
                        refresh()
                      }}
                      className="mt-2 px-3 py-1 text-xs bg-red-700 hover:bg-red-600 text-white rounded transition-colors"
                    >
                      Retry
                    </button>
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
            <div className="flex flex-col flex-1 min-h-0 space-y-3">
              <div className="flex items-center justify-between text-sm text-gray-400 flex-shrink-0">
                <span>
                  {graph.totalCommits}{' '}
                  {graph.totalCommits === 1 ? 'commit' : 'commits'}
                </span>
                <span>{graph.totalBranches} branches</span>
              </div>

              {/* Layout: Graph + Details Panel */}
              <div className="flex gap-4 flex-1 min-h-0 overflow-hidden">
                {/* Graph Section */}
                <div ref={graphContainerRef} className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden relative">
                  {graphDimensions ? (
                    <GraphStage
                      graph={graph}
                      selectedCommit={selectedCommit ?? undefined}
                      onCommitSelect={handleCommitSelect}
                      onCommitContextMenu={handleCommitContextMenu}
                      displaySettings={settings.display}
                      zoomLevel={zoomLevel}
                      onZoomChange={setZoomLevel}
                      width={graphDimensions.width}
                      height={graphDimensions.height}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-400">
                      <div className="text-center">
                        <LoadingSpinner size="md" />
                        <p className="mt-2 text-sm">Loading graph...</p>
                      </div>
                    </div>
                  )}

                  {graph.nodes.length < graph.totalCommits && (
                    <div className="text-center py-2 text-sm text-gray-500 flex-shrink-0">
                      Showing {graph.nodes.length} of {graph.totalCommits} commits
                    </div>
                  )}
                </div>

                {/* Details Panel (shown when commit selected) */}
                {selectedCommit && (
                  <div className="w-96 flex flex-col min-h-0">
                    <CommitDetailsPanel
                      repositoryId={repositoryId}
                      repositoryPath={repositoryPath}
                      commitHash={selectedCommit}
                      onClose={() => setSelectedCommit(null)}
                    />
                  </div>
                )}
              </div>

              {/* Context Menu (shown on right-click) */}
              {contextMenu && (
                <CommitContextMenu
                  commit={contextMenu.commit}
                  position={contextMenu.position}
                  onClose={() => setContextMenu(null)}
                  onViewDetails={(commit) => {
                    handleCommitSelect(String(commit.hash))
                  }}
                />
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
