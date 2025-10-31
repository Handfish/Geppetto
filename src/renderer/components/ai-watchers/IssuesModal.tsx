import React, { useState, useEffect, useMemo, useCallback, memo, useRef } from 'react'
import { useAtomValue, Result } from '@effect-atom/atom-react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { X, Check, Zap, ListTodo } from 'lucide-react'
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  useRole,
  useDismiss,
  useInteractions,
  FloatingPortal,
  FloatingFocusManager,
  size,
} from '@floating-ui/react'
import { repositoryIssuesAtom } from '../../atoms/github-issue-atoms'
import { useAiWatcherLauncher } from '../../hooks/useAiWatcherLauncher'
import { useIssueModalKeyboardNavigation } from '../../hooks/useIssueModalKeyboardNavigation'
import { useKeyboardLayer } from '../../hooks/useKeyboardLayer'
import type { AccountId } from '../../../shared/schemas/account-context'
import type { GitHubIssue } from '../../../shared/schemas/github/issue'

interface IssuesModalProps {
  isOpen: boolean
  onClose: () => void
  accountId: AccountId
  owner: string
  repo: string
  repositoryId: { value: string }
  anchorPosition: DOMRect | null
  onLaunchWatchers?: (issueNumbers: number[]) => void
}

export function IssuesModal({
  isOpen,
  onClose,
  accountId,
  owner,
  repo,
  repositoryId,
  anchorPosition,
  onLaunchWatchers,
}: IssuesModalProps) {
  // Don't render anything (and don't subscribe to atoms) if modal is closed
  // This prevents IPC spam when modal is not visible
  if (!isOpen) {
    return null
  }

  return (
    <IssuesModalContent
      accountId={accountId}
      anchorPosition={anchorPosition}
      isOpen={isOpen}
      onClose={onClose}
      onLaunchWatchers={onLaunchWatchers}
      owner={owner}
      repo={repo}
      repositoryId={repositoryId}
    />
  )
}

function IssuesModalContent({
  isOpen,
  onClose,
  accountId,
  owner,
  repo,
  repositoryId,
  anchorPosition,
  onLaunchWatchers,
}: IssuesModalProps) {
  const shouldReduceMotion = useReducedMotion()
  const [shortlist, setShortlist] = useState<Set<number>>(new Set())
  const [selectedProvider, setSelectedProvider] = useState<'claude-code' | 'codex' | 'cursor'>('claude-code')

  const { launchWatcherForIssue, isLaunching } = useAiWatcherLauncher()

  // Issue navigation state
  const [focusedIssueIndex, setFocusedIssueIndex] = useState(0)
  const issueRowRefs = useRef<(HTMLButtonElement | null)[]>([])

  // Per-issue agent selection (Map of issue number → AI agent type)
  const [issueAgents, setIssueAgents] = useState<Map<number, 'claude-code' | 'codex' | 'cursor'>>(
    new Map()
  )

  // Helper to get effective agent for an issue (falls back to global selectedProvider)
  const getIssueAgent = useCallback(
    (issueNumber: number): 'claude-code' | 'codex' | 'cursor' => {
      return issueAgents.get(issueNumber) ?? selectedProvider
    },
    [issueAgents, selectedProvider]
  )

  // Helper to cycle agent for an issue
  const cycleIssueAgent = useCallback(
    (issueNumber: number, direction: 'left' | 'right') => {
      const agents: Array<'claude-code' | 'codex' | 'cursor'> = [
        'claude-code',
        'codex',
        'cursor',
      ]

      const currentAgent = getIssueAgent(issueNumber)
      const currentIndex = agents.indexOf(currentAgent)

      let nextIndex: number
      if (direction === 'right') {
        nextIndex = (currentIndex + 1) % agents.length
      } else {
        nextIndex = (currentIndex - 1 + agents.length) % agents.length
      }

      setIssueAgents((prev) => {
        const next = new Map(prev)
        next.set(issueNumber, agents[nextIndex])
        return next
      })
    },
    [getIssueAgent]
  )

  // Create virtual element from saved position
  const virtualElement = useMemo(() => {
    if (!anchorPosition) return null
    return {
      getBoundingClientRect: () => anchorPosition,
    }
  }, [anchorPosition])

  // Floating UI setup
  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: onClose,
    placement: 'bottom-start',
    middleware: [
      offset(8),
      flip(),
      shift({ padding: 8 }),
      size({
        apply({ availableHeight, elements }) {
          Object.assign(elements.floating.style, {
            maxHeight: `${Math.min(600, availableHeight - 16)}px`,
          })
        },
      }),
    ],
    whileElementsMounted: autoUpdate,
    strategy: 'fixed',
  })

  const role = useRole(context)
  const dismiss = useDismiss(context)
  const { getReferenceProps, getFloatingProps } = useInteractions([role, dismiss])

  // Set virtual element as reference
  useEffect(() => {
    if (virtualElement && isOpen) {
      refs.setReference(virtualElement)
    }
  }, [virtualElement, refs, isOpen])

  // Use useMemo to ensure atom params are stable and prevent re-fetches
  const issuesAtomParams = useMemo(
    () => ({
      accountId,
      owner,
      repo,
      options: {
        state: 'open' as const,
        limit: 50, // Reduced from 100 to improve performance
      },
    }),
    [accountId, owner, repo]
  )

  const issuesResult = useAtomValue(repositoryIssuesAtom(issuesAtomParams))

  // Reset shortlist, focus, and per-issue agents when modal closes
  useEffect(() => {
    if (!isOpen) {
      setShortlist(new Set())
      setFocusedIssueIndex(0)
      setIssueAgents(new Map())
    }
  }, [isOpen])

  // Get issues array for navigation
  const issues = Result.getOrElse(issuesResult, () => [] as GitHubIssue[])

  // Scroll focused issue into view
  useEffect(() => {
    if (isOpen && issues.length > 0 && issueRowRefs.current[focusedIssueIndex]) {
      issueRowRefs.current[focusedIssueIndex]?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      })
    }
  }, [focusedIssueIndex, isOpen, issues.length])

  // Memoize toggle callback to prevent IssueRow re-renders
  const toggleShortlist = useCallback((issueNumber: number) => {
    setShortlist((prev) => {
      const next = new Set(prev)
      if (next.has(issueNumber)) {
        next.delete(issueNumber)
      } else {
        next.add(issueNumber)
      }
      return next
    })
  }, [])

  const handleLaunch = async () => {
    if (shortlist.size === 0) return

    // Get shortlisted issues from result
    const issues = Result.getOrElse(issuesResult, () => [] as GitHubIssue[])
    const shortlistedIssues = issues.filter(issue => shortlist.has(issue.number))

    if (shortlistedIssues.length === 0) return

    try {
      // Launch watchers sequentially to avoid git conflicts
      // Each issue uses its individually selected agent (or defaults to global provider)
      for (const issue of shortlistedIssues) {
        const agent = getIssueAgent(issue.number)

        await launchWatcherForIssue(
          issue,
          agent,
          repositoryId,
          owner,
          repo
        )
      }

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

  // Centralized keyboard layer management - push 'modal' layer when open
  useKeyboardLayer('modal', isOpen)

  // Keyboard navigation hook
  useIssueModalKeyboardNavigation({
    isOpen,
    issueCount: issues.length,
    focusedIndex: focusedIssueIndex,
    onNavigate: setFocusedIssueIndex,
    onToggleSelection: () => {
      if (issues[focusedIssueIndex]) {
        toggleShortlist(issues[focusedIssueIndex].number)
      }
    },
    onCycleAgentLeft: () => {
      const issue = issues[focusedIssueIndex]
      if (issue && shortlist.has(issue.number)) {
        cycleIssueAgent(issue.number, 'left')
      }
    },
    onCycleAgentRight: () => {
      const issue = issues[focusedIssueIndex]
      if (issue && shortlist.has(issue.number)) {
        cycleIssueAgent(issue.number, 'right')
      }
    },
    onLaunch: handleLaunch,
    onClose: onClose,
    enabled: isOpen,
  })

  // Animation config
  const animationConfig = shouldReduceMotion
    ? { duration: 0.2, ease: [0.16, 1, 0.3, 1] as const }
    : { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const }

  if (!anchorPosition) return null

  return (
    <FloatingPortal>
      <AnimatePresence>
        {isOpen && (
          <FloatingFocusManager context={context} modal={false}>
            <div
              ref={refs.setFloating}
              style={floatingStyles}
              {...getFloatingProps()}
              className="z-50"
              onClick={(e) => e.stopPropagation()}
            >
              <motion.div
                animate={{ opacity: 1, scale: 1 }}
                className="w-[600px] max-h-[600px] bg-gradient-to-b from-gray-800/95 to-gray-900/95 border border-gray-700/50 rounded-lg shadow-2xl backdrop-blur-xl flex flex-col"
                exit={{ opacity: 0, scale: 0.95 }}
                initial={{ opacity: 0, scale: 0.95 }}
                style={{ transformOrigin: 'top left' }}
                transition={animationConfig}
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
                      ↑↓ Navigate • Space Select • ←→ Change Agent • Enter Launch • Esc Close
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
                          {issues.map((issue, index) => (
                            <IssueRow
                              isFocused={index === focusedIssueIndex}
                              isShortlisted={shortlist.has(issue.number)}
                              issue={issue}
                              key={issue.number}
                              onToggle={toggleShortlist}
                              ref={(el) => (issueRowRefs.current[index] = el)}
                              selectedAgent={getIssueAgent(issue.number)}
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
            </motion.div>
          </div>
        </FloatingFocusManager>
      )}
    </AnimatePresence>
  </FloatingPortal>
  )
}

interface IssueRowProps {
  issue: GitHubIssue
  isShortlisted: boolean
  isFocused?: boolean
  selectedAgent?: 'claude-code' | 'codex' | 'cursor'
  onToggle: (issueNumber: number) => void
}

// Memoize IssueRow to prevent re-renders when other issues change
const IssueRow = memo(
  React.forwardRef<HTMLButtonElement, IssueRowProps>(function IssueRow(
    { issue, isShortlisted, isFocused, selectedAgent, onToggle },
    ref
  ) {
    return (
      <button
        ref={ref}
        className={`
          w-full p-3 rounded-lg border transition-all text-left
          ${
            isShortlisted
              ? 'border-teal-500/50 bg-teal-500/10'
              : 'border-gray-700/50 bg-gray-800/30 hover:bg-gray-700/40'
          }
          ${isFocused ? 'ring-2 ring-teal-500/50' : ''}
        `}
        onClick={() => onToggle(issue.number)}
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
            <span>{new Date(issue.created_at).toLocaleDateString()}</span>
          </div>

          {/* Agent Badge (only shown when shortlisted) */}
          {isShortlisted && selectedAgent && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-gray-400">Agent:</span>
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-teal-500/20 text-teal-300 border border-teal-500/30">
                {selectedAgent === 'claude-code' ? 'Claude Code' : selectedAgent === 'codex' ? 'Codex' : 'Cursor'}
              </span>
              {isFocused && (
                <span className="text-xs text-gray-500 ml-1">← → to change</span>
              )}
            </div>
          )}
        </div>
      </div>
    </button>
    )
  })
)
