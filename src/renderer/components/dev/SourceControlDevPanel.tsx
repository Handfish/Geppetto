/**
 * Development-only Source Control Testing Panel
 *
 * Allows testing source control functionality in development mode.
 * Displays repositories, commit graphs, branches, and working tree status.
 */

import { useEffect, useRef, useState, useMemo } from 'react'
import { Result } from '@effect-atom/atom-react'
import {
  RepositoryExplorer,
  CommitGraphView,
  CommitHistoryList,
  BranchList,
  RemoteList,
  StatusBar,
  StatusSummary,
} from '../source-control'
import { useRefreshRepository } from '../../hooks/useSourceControl'
import type {
  Repository,
  RepositoryId,
} from '../../../shared/schemas/source-control'

type TabType = 'repositories' | 'commits' | 'branches' | 'status'

export function SourceControlDevPanel() {
  const [showPanel, setShowPanel] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>('repositories')
  const [selectedRepository, setSelectedRepository] = useState<Repository | null>(null)
  const hasLoggedRef = useRef(false)
  const { refresh: refreshRepository } = useRefreshRepository()

  // Log welcome message only once on mount
  useEffect(() => {
    if (process.env.NODE_ENV === 'development' && !hasLoggedRef.current) {
      hasLoggedRef.current = true

      console.log(
        '%c[Source Control] Developer panel loaded!',
        'color: #22c55e; font-weight: bold'
      )
      console.log(
        '%cUse window.__DEV_SOURCE_CONTROL__ to interact:',
        'color: #6b7280'
      )
      console.log('  • showPanel()             - Show visual panel')
      console.log('  • hidePanel()             - Hide visual panel')
      console.log('  • selectRepository(repo)  - Select a repository')
      console.log('  • clearSelection()        - Clear repository selection')
      console.log('')
    }
  }, [])

  // Update API when functions/state change
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      const api = {
        showPanel: () => {
          console.log('[Source Control] Showing panel')
          setShowPanel(true)
        },
        hidePanel: () => {
          console.log('[Source Control] Hiding panel')
          setShowPanel(false)
        },
        selectRepository: (repo: Repository) => {
          console.log('[Source Control] Selecting repository:', repo.name)
          setSelectedRepository(repo)
        },
        clearSelection: () => {
          console.log('[Source Control] Clearing selection')
          setSelectedRepository(null)
        },
        getSelectedRepository: () => selectedRepository,
      }

      ;(window as any).__DEV_SOURCE_CONTROL__ = api
    }

    return () => {
      if (process.env.NODE_ENV === 'development') {
        delete (window as any).__DEV_SOURCE_CONTROL__
      }
    }
  }, [selectedRepository])

  if (!showPanel) {
    return (
      <button
        onClick={() => setShowPanel(true)}
        className="fixed bottom-4 right-4 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg shadow-lg z-50 transition-colors"
        title="Show Source Control Dev Panel"
      >
        <span className="text-sm font-medium">📦 Source Control</span>
      </button>
    )
  }

  // Memoize graph options to ensure stable reference for atom family
  // This prevents creating new atom subscriptions on every render
  const graphOptions = useMemo(
    () => ({ maxCommits: 20, layoutAlgorithm: 'topological' as const }),
    []
  )

  const tabs: { id: TabType; label: string; icon: string }[] = [
    { id: 'repositories', label: 'Repositories', icon: '📂' },
    { id: 'commits', label: 'Commits', icon: '🔀' },
    { id: 'branches', label: 'Branches', icon: '🌿' },
    { id: 'status', label: 'Status', icon: '📝' },
  ]

  return (
    <div className="fixed bottom-4 right-4 w-[800px] max-h-[600px] bg-gray-800 rounded-lg shadow-2xl border border-gray-700 z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-white">
            📦 Source Control Dev Panel
          </h3>
          {selectedRepository && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-400">→</span>
              <span className="text-green-400 font-medium">
                {selectedRepository.name}
              </span>
              <button
                onClick={() => setSelectedRepository(null)}
                className="text-gray-500 hover:text-gray-300 transition-colors"
                title="Clear selection"
              >
                ✕
              </button>
            </div>
          )}
        </div>
        <button
          onClick={() => setShowPanel(false)}
          className="text-gray-400 hover:text-white transition-colors"
          title="Hide panel"
        >
          ✕
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-700 px-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              px-4 py-2 text-sm font-medium transition-colors relative
              ${
                activeTab === tab.id
                  ? 'text-green-400'
                  : 'text-gray-400 hover:text-gray-200'
              }
            `}
            disabled={!selectedRepository && tab.id !== 'repositories'}
          >
            <span className="mr-2">{tab.icon}</span>
            {tab.label}
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-green-400" />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'repositories' && (
          <RepositoryExplorer
            onRepositorySelect={async (repo) => {
              // Ensure repository is cached in backend before accessing it
              console.log('[SourceControlDevPanel] Refreshing repository to ensure it\'s cached:', repo.name)
              await refreshRepository(repo.id)
              setSelectedRepository(repo)
              setActiveTab('commits')
            }}
          />
        )}

        {activeTab === 'commits' && selectedRepository && (
          <div className="space-y-6">
            <CommitGraphView
              repositoryId={selectedRepository.id}
              options={graphOptions}
            />
          </div>
        )}

        {activeTab === 'branches' && selectedRepository && (
          <div className="space-y-6">
            <BranchList repositoryId={selectedRepository.id} />
            <RemoteList repositoryId={selectedRepository.id} />
          </div>
        )}

        {activeTab === 'status' && selectedRepository && (
          <div className="space-y-6">
            <StatusSummary repositoryId={selectedRepository.id} />
            <StatusBar repositoryId={selectedRepository.id} refreshInterval={5} />
          </div>
        )}

        {!selectedRepository && activeTab !== 'repositories' && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <p className="text-gray-400 mb-2">No repository selected</p>
              <button
                onClick={() => setActiveTab('repositories')}
                className="text-sm text-green-400 hover:text-green-300 transition-colors"
              >
                Select a repository →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-700 px-4 py-2 bg-gray-900">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>
            Press <kbd className="px-1 py-0.5 bg-gray-800 rounded">F12</kbd> to open
            DevTools Console
          </span>
          <span>window.__DEV_SOURCE_CONTROL__</span>
        </div>
      </div>
    </div>
  )
}
