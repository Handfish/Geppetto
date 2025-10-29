import React, { useState, useMemo } from 'react'
import type { GraphOptions } from '../../../shared/schemas/source-control'
import type { GraphDisplaySettings } from '../../hooks/useGraphSettings'

/**
 * GraphFilters Component
 *
 * Provides filtering UI for commit graph display:
 * - Text search (filters commit messages)
 * - Branch filter (include/exclude branches)
 * - Author filter (filter by commit author)
 * - Max commits slider
 * - Display toggles (show refs, merge commits, messages)
 *
 * Usage:
 * ```tsx
 * <GraphFilters
 *   options={graphOptions}
 *   onOptionsChange={setGraphOptions}
 *   displaySettings={displaySettings}
 *   onDisplayChange={updateDisplay}
 *   availableBranches={['main', 'develop']}
 *   availableAuthors={['John Doe', 'Jane Smith']}
 * />
 * ```
 */

interface GraphFiltersProps {
  /** Current graph options */
  options: Partial<GraphOptions>

  /** Callback when options change */
  onOptionsChange: (options: Partial<GraphOptions>) => void

  /** Display settings (show/hide visual elements) */
  displaySettings?: GraphDisplaySettings

  /** Callback when display settings change */
  onDisplayChange?: (settings: Partial<GraphDisplaySettings>) => void

  /** Available branches for dropdown */
  availableBranches?: string[]

  /** Available authors for dropdown */
  availableAuthors?: string[]

  /** Search text value (controlled) */
  searchText?: string

  /** Callback when search text changes */
  onSearchChange?: (text: string) => void

  /** Callback to reset all settings to defaults */
  onReset?: () => void
}

export function GraphFilters({
  options,
  onOptionsChange,
  displaySettings,
  onDisplayChange,
  availableBranches = [],
  availableAuthors = [],
  searchText = '',
  onSearchChange,
  onReset,
}: GraphFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  // Extract current values from options
  const maxCommits = options.maxCommits ?? 20
  const selectedAuthor = options.author ?? ''
  const includeBranches = options.includeBranches ?? []

  const handleMaxCommitsChange = (value: number) => {
    onOptionsChange({
      ...options,
      maxCommits: value,
    })
  }

  const handleAuthorChange = (author: string) => {
    onOptionsChange({
      ...options,
      author: author || undefined,
    })
  }

  const handleBranchToggle = (branch: string) => {
    const currentBranches = includeBranches as readonly string[]
    const isSelected = currentBranches.includes(branch)

    const newBranches = isSelected
      ? currentBranches.filter((b) => b !== branch)
      : [...currentBranches, branch]

    onOptionsChange({
      ...options,
      includeBranches: newBranches.length > 0 ? (newBranches as any) : undefined,
    })
  }

  const handleClearFilters = () => {
    onSearchChange?.('')
    onOptionsChange({
      maxCommits: 20,
      layoutAlgorithm: options.layoutAlgorithm ?? 'topological',
    })
  }

  const handleResetAll = () => {
    onSearchChange?.('')
    onReset?.()
  }

  const hasActiveFilters =
    selectedAuthor !== '' || includeBranches.length > 0 || searchText !== ''

  return (
    <div className="bg-gray-800 border-b border-gray-700">
      {/* Collapsed header */}
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label={isExpanded ? 'Collapse filters' : 'Expand filters'}
          >
            <svg
              className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>

          <span className="text-sm font-medium text-gray-300">
            Filters {hasActiveFilters && `(${[selectedAuthor ? 1 : 0, includeBranches.length, searchText ? 1 : 0].filter(Boolean).reduce((a, b) => a + b, 0)} active)`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick search input (always visible) */}
          <div className="relative">
            <input
              type="text"
              value={searchText}
              onChange={(e) => onSearchChange?.(e.target.value)}
              placeholder="Search commits..."
              className="px-3 py-1 pl-8 text-sm bg-gray-900 border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 w-64"
            />
            <svg
              className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>

          {hasActiveFilters && (
            <button
              onClick={handleClearFilters}
              className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Expanded filter controls */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-700 pt-3">
          {/* Author filter */}
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-400 w-24">Author:</label>
            <select
              value={selectedAuthor}
              onChange={(e) => handleAuthorChange(e.target.value)}
              className="flex-1 px-3 py-1 text-sm bg-gray-900 border border-gray-700 rounded text-white focus:outline-none focus:border-blue-500"
            >
              <option value="">All authors</option>
              {availableAuthors.map((author) => (
                <option key={author} value={author}>
                  {author}
                </option>
              ))}
            </select>
          </div>

          {/* Branch filter */}
          <div className="flex items-start gap-3">
            <label className="text-sm text-gray-400 w-24 pt-1">Branches:</label>
            <div className="flex-1">
              {availableBranches.length === 0 ? (
                <p className="text-xs text-gray-500">No branches available</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {availableBranches.map((branch) => {
                    const isSelected = (includeBranches as readonly string[]).includes(
                      branch
                    )
                    return (
                      <button
                        key={branch}
                        onClick={() => handleBranchToggle(branch)}
                        className={`px-3 py-1 text-xs rounded transition-colors ${
                          isSelected
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        {branch}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Max commits slider */}
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-400 w-24">Max commits:</label>
            <input
              type="range"
              min="10"
              max="200"
              step="10"
              value={maxCommits}
              onChange={(e) => handleMaxCommitsChange(Number(e.target.value))}
              className="flex-1"
            />
            <span className="text-sm text-gray-300 w-12">{maxCommits}</span>
          </div>

          {/* Display Settings */}
          {displaySettings && onDisplayChange && (
            <>
              <div className="border-t border-gray-700 my-3" />

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Display Options</label>

                {/* Show Refs Toggle */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={displaySettings.showRefs}
                    onChange={(e) =>
                      onDisplayChange({ showRefs: e.target.checked })
                    }
                    className="w-4 h-4 bg-gray-900 border-gray-700 rounded focus:ring-blue-500 focus:ring-2"
                  />
                  <span className="text-sm text-gray-400">
                    Show branch/tag labels
                  </span>
                </label>

                {/* Show Merge Commits Toggle */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={displaySettings.showMergeCommits}
                    onChange={(e) =>
                      onDisplayChange({ showMergeCommits: e.target.checked })
                    }
                    className="w-4 h-4 bg-gray-900 border-gray-700 rounded focus:ring-blue-500 focus:ring-2"
                  />
                  <span className="text-sm text-gray-400">
                    Show merge commits
                  </span>
                </label>

                {/* Show Messages Toggle */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={displaySettings.showMessages}
                    onChange={(e) =>
                      onDisplayChange({ showMessages: e.target.checked })
                    }
                    className="w-4 h-4 bg-gray-900 border-gray-700 rounded focus:ring-blue-500 focus:ring-2"
                  />
                  <span className="text-sm text-gray-400">
                    Show commit messages
                  </span>
                </label>
              </div>

              {/* Reset to Defaults Button */}
              {onReset && (
                <button
                  onClick={handleResetAll}
                  className="mt-3 w-full px-3 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
                >
                  Reset All Settings to Defaults
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
