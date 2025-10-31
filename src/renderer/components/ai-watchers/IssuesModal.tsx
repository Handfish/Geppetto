import { useState, useEffect } from 'react'
import { useAtomValue, Result } from '@effect-atom/atom-react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Check, Zap, ListTodo } from 'lucide-react'
import { repositoryIssuesAtom } from '../../atoms/github-issue-atoms'
import { useAiWatcherLauncher } from '../../hooks/useAiWatcherLauncher'
import type { AccountId } from '../../../shared/schemas/account-context'
import type { GitHubIssue } from '../../../shared/schemas/github/issue'

interface IssuesModalProps {
  isOpen: boolean
  onClose: () => void
  accountId: AccountId
  owner: string
  repo: string
  repositoryId: { value: string }
  onLaunchWatchers?: (issueNumbers: number[]) => void
}

export function IssuesModal({
  isOpen,
  onClose,
  accountId,
  owner,
  repo,
  repositoryId,
  onLaunchWatchers,
}: IssuesModalProps) {
  const [shortlist, setShortlist] = useState<Set<number>>(new Set())
  const [selectedProvider, setSelectedProvider] = useState<'claude-code' | 'codex' | 'cursor'>('claude-code')

  const { launchWatchersForIssues, isLaunching } = useAiWatcherLauncher()

  // Fetch issues for the repository
  const issuesResult = useAtomValue(
    repositoryIssuesAtom({
      accountId,
      owner,
      repo,
      options: {
        state: 'open',
        limit: 100,
      },
    })
  )

  // Reset shortlist when modal closes
  useEffect(() => {
    if (!isOpen) {
      setShortlist(new Set())
    }
  }, [isOpen])

  const toggleShortlist = (issueNumber: number) => {
    setShortlist((prev) => {
      const next = new Set(prev)
      if (next.has(issueNumber)) {
        next.delete(issueNumber)
      } else {
        next.add(issueNumber)
      }
      return next
    })
  }

  const handleLaunch = async () => {
    if (shortlist.size === 0) return

    // Get shortlisted issues from result
    const issues = Result.getOrElse(issuesResult, () => [] as GitHubIssue[])
    const shortlistedIssues = issues.filter(issue => shortlist.has(issue.number))

    if (shortlistedIssues.length === 0) return

    try {
      // Launch watchers sequentially to avoid git conflicts
      await launchWatchersForIssues(
        shortlistedIssues,
        selectedProvider,
        repositoryId,
        owner,
        repo
      )

      // Call optional callback with issue numbers
      if (onLaunchWatchers) {
        onLaunchWatchers(Array.from(shortlist))
      }

      // Close modal after successful launch
      onClose()
    } catch (error) {
      // Error already handled in hook with toast
      console.error('[IssuesModal] Failed to launch watchers:', error)
    }
  }

  // Keyboard shortcuts - handled in separate hook (Phase 2.3)
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        handleLaunch()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, shortlist, onClose])

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            animate={{ opacity: 1, scale: 1 }}
            className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none p-4"
            exit={{ opacity: 0, scale: 0.95 }}
            initial={{ opacity: 0, scale: 0.95 }}
          >
            <div
              className="w-full max-w-4xl h-[80vh] bg-gradient-to-b from-gray-800/95 to-gray-900/95 border border-gray-700/50 rounded-lg shadow-2xl backdrop-blur-xl pointer-events-auto flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-700/50">
                <div className="flex items-center gap-3">
                  <ListTodo className="size-5 text-teal-400" />
                  <div>
                    <h2 className="text-lg font-semibold text-white">
                      Issues: {owner}/{repo}
                    </h2>
                    <p className="text-xs text-gray-400 mt-1">
                      Click issues to add to shortlist • Enter to launch watchers
                    </p>
                  </div>
                </div>
                <button
                  className="p-2 hover:bg-gray-700/50 rounded transition-colors"
                  onClick={onClose}
                  type="button"
                >
                  <X className="size-5 text-gray-400 hover:text-white" />
                </button>
              </div>

              {/* Issue List */}
              <div className="flex-1 overflow-y-auto p-4">
                {Result.builder(issuesResult)
                  .onInitial(() => (
                    <div className="flex items-center justify-center py-12">
                      <div className="text-center">
                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-teal-400 mb-4" />
                        <p className="text-gray-400">Loading issues...</p>
                      </div>
                    </div>
                  ))
                  .onErrorTag('AuthenticationError', (error) => (
                    <div className="text-center py-12">
                      <p className="text-red-400 mb-2">Authentication Error</p>
                      <p className="text-gray-400 text-sm">{error.message}</p>
                    </div>
                  ))
                  .onErrorTag('NetworkError', (error) => (
                    <div className="text-center py-12">
                      <p className="text-red-400 mb-2">Network Error</p>
                      <p className="text-gray-400 text-sm">{error.message}</p>
                    </div>
                  ))
                  .onErrorTag('NotFoundError', (error) => (
                    <div className="text-center py-12">
                      <p className="text-red-400 mb-2">Repository Not Found</p>
                      <p className="text-gray-400 text-sm">{error.message}</p>
                    </div>
                  ))
                  .onDefect((defect) => (
                    <div className="text-center py-12">
                      <p className="text-red-400 mb-2">Unexpected Error</p>
                      <p className="text-gray-400 text-sm">{String(defect)}</p>
                    </div>
                  ))
                  .onSuccess((issues) => (
                    <>
                      {issues.length === 0 ? (
                        <div className="text-center py-12">
                          <ListTodo className="size-12 text-gray-600 mx-auto mb-4" />
                          <p className="text-gray-400">No open issues found</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {issues.map((issue) => (
                            <IssueRow
                              isShortlisted={shortlist.has(issue.number)}
                              issue={issue}
                              key={issue.number}
                              onToggle={() => toggleShortlist(issue.number)}
                            />
                          ))}
                        </div>
                      )}
                    </>
                  ))
                  .render()}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between p-4 border-t border-gray-700/50 bg-gray-800/50">
                <div className="flex items-center gap-4">
                  {/* Shortlist Counter */}
                  <div className="flex items-center gap-2 text-sm text-gray-300">
                    <Check className="size-4 text-teal-400" />
                    <span>
                      {shortlist.size} issue{shortlist.size !== 1 ? 's' : ''} shortlisted
                    </span>
                  </div>

                  {/* Provider Selector */}
                  <select
                    className="px-3 py-1.5 bg-gray-700/50 border border-gray-600 rounded-lg text-sm text-white hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={isLaunching}
                    onChange={(e) => setSelectedProvider(e.target.value as 'claude-code' | 'codex' | 'cursor')}
                    value={selectedProvider}
                  >
                    <option value="claude-code">Claude Code</option>
                    <option value="codex">Codex</option>
                    <option value="cursor">Cursor</option>
                  </select>
                </div>

                {/* Launch Button */}
                <button
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium flex items-center gap-2"
                  disabled={shortlist.size === 0 || isLaunching}
                  onClick={handleLaunch}
                  type="button"
                >
                  {isLaunching ? (
                    <>
                      <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                      Launching...
                    </>
                  ) : (
                    <>
                      <Zap className="size-4" />
                      Launch AI Watchers
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

interface IssueRowProps {
  issue: GitHubIssue
  isShortlisted: boolean
  onToggle: () => void
}

function IssueRow({ issue, isShortlisted, onToggle }: IssueRowProps) {
  return (
    <button
      className={`
        w-full p-3 rounded-lg border transition-all text-left
        ${
          isShortlisted
            ? 'border-teal-500/50 bg-teal-500/10'
            : 'border-gray-700/50 bg-gray-800/30 hover:bg-gray-700/40'
        }
      `}
      onClick={onToggle}
      type="button"
    >
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <div
          className={`
            size-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors
            ${
              isShortlisted
                ? 'border-teal-500 bg-teal-500'
                : 'border-gray-600 bg-transparent'
            }
          `}
        >
          {isShortlisted && <Check className="size-3 text-white" />}
        </div>

        {/* Issue Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 mb-1">
            <span className="text-gray-400 text-sm font-mono">#{issue.number}</span>
            <h3 className="text-white font-medium flex-1 line-clamp-2">
              {issue.title}
            </h3>
          </div>

          {/* Labels */}
          {issue.labels && issue.labels.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {issue.labels.slice(0, 5).map((label) => (
                <span
                  className="px-2 py-0.5 rounded text-xs font-medium"
                  key={label.name}
                  style={{
                    backgroundColor: `#${label.color}20`,
                    color: `#${label.color}`,
                  }}
                >
                  {label.name}
                </span>
              ))}
              {issue.labels.length > 5 && (
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-700 text-gray-400">
                  +{issue.labels.length - 5} more
                </span>
              )}
            </div>
          )}

          {/* Metadata */}
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
            <span>Opened by {issue.user.login}</span>
            <span>•</span>
            <span>{new Date(issue.createdAt).toLocaleDateString()}</span>
            {issue.comments > 0 && (
              <>
                <span>•</span>
                <span>{issue.comments} comment{issue.comments !== 1 ? 's' : ''}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}
