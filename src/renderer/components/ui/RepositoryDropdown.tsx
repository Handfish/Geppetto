import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
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
  hide,
} from '@floating-ui/react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  GitBranch,
  Star,
  Eye,
  GitFork,
  ExternalLink,
  Code,
  FileText,
  Settings,
  Check,
  Download,
  ListTodo,
} from 'lucide-react'
import type { ProviderRepository } from '../../../shared/schemas/provider'
import { useAtom, Result } from '@effect-atom/atom-react'
import { cloneToWorkspaceAtom } from '../../atoms/workspace-atoms'
import { WorkspaceClient } from '../../lib/ipc-client'
import { Effect } from 'effect'
import { toast } from 'sonner'
import { IssuesModal } from '../ai-watchers/IssuesModal'
import { useDropdownKeyboardNavigation } from '../../hooks/useDropdownKeyboardNavigation'
import { useKeyboardLayer } from '../../hooks/useKeyboardLayer'

interface RepositoryDropdownProps {
  repo: ProviderRepository
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  anchorRef: React.RefObject<HTMLDivElement | null>
}

export function RepositoryDropdown({
  repo,
  isOpen,
  onOpenChange,
  anchorRef,
}: RepositoryDropdownProps) {
  const shouldReduceMotion = useReducedMotion()
  const [isInWorkspace, setIsInWorkspace] = useState(false)
  const [isCheckingWorkspace, setIsCheckingWorkspace] = useState(false)
  const [showIssuesModal, setShowIssuesModal] = useState(false)
  const [workspaceRepositoryId, setWorkspaceRepositoryId] = useState<{ value: string } | null>(null)
  const [cloneResult, cloneToWorkspace] = useAtom(cloneToWorkspaceAtom)
  const issuesButtonRef = useRef<HTMLButtonElement>(null)
  const savedButtonPositionRef = useRef<DOMRect | null>(null)

  // Keyboard navigation state
  const [focusedItemIndex, setFocusedItemIndex] = useState(0)
  const menuItemRefs = useRef<(HTMLButtonElement | null)[]>([])

  const { refs, floatingStyles, context, middlewareData, placement } =
    useFloating({
      open: isOpen,
      onOpenChange,
      placement: 'top',
      middleware: [
        offset(12),
        flip(),
        shift({ padding: 8 }),
        hide(), // Hide if reference element is not visible or detached
      ],
      whileElementsMounted: autoUpdate,
      strategy: 'fixed', // Use fixed positioning for better stability during animations
    })

  const role = useRole(context)
  const dismiss = useDismiss(context)
  const { getReferenceProps, getFloatingProps } = useInteractions([
    role,
    dismiss,
  ])

  // Define handleClone before menuItems that references it
  const handleClone = useCallback(() => {
    cloneToWorkspace({
      cloneUrl: repo.cloneUrl,
      repoName: repo.name,
      owner: repo.owner,
      defaultBranch: repo.defaultBranch,
      provider: repo.provider,
    })
    onOpenChange(false)
  }, [repo, cloneToWorkspace, onOpenChange])

  // Define navigable menu items
  interface MenuItem {
    label: string
    onClick: () => void
    disabled?: boolean
    icon: React.ElementType
    badge?: React.ReactNode
  }

  const menuItems = useMemo<MenuItem[]>(() => {
    const items: MenuItem[] = [
      {
        icon: Download,
        label: isCheckingWorkspace
          ? 'Checking Workspace...'
          : cloneResult.waiting
            ? 'Cloning...'
            : isInWorkspace
              ? 'Already in Workspace'
              : 'Clone to Workspace',
        onClick: () => handleClone(),
        disabled: isInWorkspace || cloneResult.waiting || isCheckingWorkspace,
        badge: isCheckingWorkspace ? (
          <span className="text-xs text-gray-500">Checking...</span>
        ) : undefined,
      },
      {
        icon: ListTodo,
        label: isCheckingWorkspace
          ? 'Checking...'
          : !isInWorkspace
            ? 'View Issues (Clone First)'
            : 'View Issues',
        onClick: () => {
          if (issuesButtonRef.current) {
            savedButtonPositionRef.current = issuesButtonRef.current.getBoundingClientRect()
          }
          setShowIssuesModal(true)
          onOpenChange(false)
        },
        disabled: !isInWorkspace || isCheckingWorkspace,
      },
      {
        icon: ExternalLink,
        label: `Open in ${repo.provider}`,
        onClick: () => {
          // TODO: Implement open in provider
          console.log('[RepositoryDropdown] Open in provider')
        },
        disabled: false,
      },
      {
        icon: GitBranch,
        label: 'View Branches',
        onClick: () => {
          // TODO: Implement view branches
          console.log('[RepositoryDropdown] View branches')
        },
        disabled: false,
        badge: 'main',
      },
      {
        icon: FileText,
        label: 'View README',
        onClick: () => {
          // TODO: Implement view README
          console.log('[RepositoryDropdown] View README')
        },
        disabled: false,
      },
      {
        icon: Settings,
        label: 'Repository Settings',
        onClick: () => {
          // TODO: Implement repository settings
          console.log('[RepositoryDropdown] Repository settings')
        },
        disabled: false,
      },
      {
        icon: Star,
        label: 'Starred',
        onClick: () => {
          // TODO: Implement toggle star
          console.log('[RepositoryDropdown] Toggle star')
        },
        disabled: false,
        badge: <Check className="size-3 text-teal-400" />,
      },
    ]

    // Filter out disabled items for navigation
    return items.filter(item => !item.disabled)
  }, [isCheckingWorkspace, isInWorkspace, cloneResult.waiting, handleClone, onOpenChange, repo.provider])

  // Reset focus when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setFocusedItemIndex(0)
    }
  }, [isOpen])

  // Scroll focused item into view
  useEffect(() => {
    if (isOpen && menuItemRefs.current[focusedItemIndex]) {
      menuItemRefs.current[focusedItemIndex]?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      })
    }
  }, [focusedItemIndex, isOpen])

  // Centralized keyboard layer management - push 'dropdown' layer when open
  useKeyboardLayer('dropdown', isOpen && !showIssuesModal)

  // Keyboard navigation hook - disable when issues modal is open
  useDropdownKeyboardNavigation({
    isOpen,
    itemCount: menuItems.length,
    focusedIndex: focusedItemIndex,
    onNavigate: setFocusedItemIndex,
    onSelect: () => {
      // Trigger onClick for focused item
      menuItems[focusedItemIndex]?.onClick()
    },
    enabled: isOpen && !showIssuesModal, // CRITICAL: Disable when modal is open
  })

  // Function to check workspace status
  const checkWorkspaceStatus = useCallback(() => {
    setIsCheckingWorkspace(true)

    const checkWorkspace = Effect.gen(function* () {
      const client = yield* WorkspaceClient
      const result = yield* client.checkRepositoryInWorkspace({
        owner: repo.owner,
        repoName: repo.name,
        provider: repo.provider,
        defaultBranch: repo.defaultBranch,
      })
      return result
    })

    Effect.runPromise(
      checkWorkspace.pipe(Effect.provide(WorkspaceClient.Default))
    )
      .then(result => {
        setIsInWorkspace(result.inWorkspace)
        setWorkspaceRepositoryId(result.repositoryId)
        setIsCheckingWorkspace(false)
      })
      .catch(() => {
        setIsInWorkspace(false)
        setWorkspaceRepositoryId(null)
        setIsCheckingWorkspace(false)
      })
  }, [repo.owner, repo.name, repo.provider, repo.defaultBranch])

  // Check workspace status when menu opens
  useEffect(() => {
    if (!isOpen) return
    checkWorkspaceStatus()
  }, [isOpen, checkWorkspaceStatus])

  // Show success/error toast when clone completes - only once per operation
  const prevWaitingRef = useRef(false)

  useEffect(() => {
    const wasWaiting = prevWaitingRef.current
    const isWaiting = cloneResult.waiting

    // Only show toast when transitioning from waiting to not waiting (operation just completed)
    if (wasWaiting && !isWaiting) {
      if (Result.isSuccess(cloneResult)) {
        toast.success(`${repo.owner}/${repo.name} cloned to workspace`, {
          duration: 6000,
        })
        // Re-check workspace status after successful clone
        checkWorkspaceStatus()
      } else if (Result.isFailure(cloneResult)) {
        // Extract error message using Result.match
        const errorMessage = Result.match(cloneResult, {
          onSuccess: () => '',
          onFailure: (failure) => {
            // failure is the full Failure result object
            // We need to check if it has the error property
            if (Result.isFailure(failure)) {
              const error = (failure as unknown as { error: { _tag: string; message: string; stderr?: string } }).error

              if (!error) {
                return 'Failed to clone repository to workspace (no error details)'
              }

              // Handle different error types
              if (error._tag === 'GitOperationError') {
                // GitOperationError has stderr with detailed git output
                return error.stderr?.trim() || error.message
              }

              // Fallback to generic message field for other error types
              return error.message || 'Failed to clone repository to workspace'
            }

            return 'Failed to clone repository to workspace'
          },
          onInitial: () => '',
        })

        toast.error(`Clone failed: ${errorMessage}`, {
          duration: 6000,
        })
      }
    }

    prevWaitingRef.current = isWaiting
  }, [cloneResult, repo.owner, repo.name, checkWorkspaceStatus])

  // Sync anchor element - update whenever anchorRef or isOpen changes
  useEffect(() => {
    if (anchorRef.current && isOpen) {
      refs.setReference(anchorRef.current)
    }
  }, [anchorRef, refs, isOpen, repo.repositoryId]) // Re-sync when repo changes


  // Don't render if anchor is not available or if hidden by middleware
  const isHidden = middlewareData.hide?.referenceHidden
  if (!anchorRef.current || isHidden) return null

  // Determine transform origin based on placement to anchor animation to source
  // This creates natural motion from the trigger element
  const getTransformOrigin = () => {
    if (placement.startsWith('top')) return 'bottom center'
    if (placement.startsWith('bottom')) return 'top center'
    if (placement.startsWith('left')) return 'right center'
    if (placement.startsWith('right')) return 'left center'
    return 'center center'
  }

  // Animation configuration based on Emil Kowalski's principles:
  // - Fast animations (<300ms) improve perceived performance
  // - ease-out creates responsive, natural feel
  // - Transform + opacity only for hardware acceleration
  const animationConfig = shouldReduceMotion
    ? {
        duration: 0.2,
        ease: [0.16, 1, 0.3, 1] as const, // Custom ease-out curve from easings.co
      }
    : {
        duration: 0.25,
        ease: [0.16, 1, 0.3, 1] as const, // Custom ease-out - more energetic than CSS defaults
      }

  return (
    <>
    <FloatingPortal>
      <AnimatePresence>
        {isOpen && (
          <FloatingFocusManager context={context} modal={false}>
            {/* Outer div: positioned by Floating UI - NO animation */}
            <div
              ref={refs.setFloating}
              style={floatingStyles}
              {...getFloatingProps()}
              className="z-50"
            >
              {/* Inner div: animated by Framer Motion - positioned relative to outer */}
              <motion.div
                animate={{
                  opacity: 1,
                  scale: 1,
                }}
                className="min-w-[280px] rounded-lg border border-gray-700/80 bg-gradient-to-b from-gray-800/95 to-gray-900/95 backdrop-blur-xl shadow-2xl shadow-black/50"
                exit={{
                  opacity: 0,
                  scale: 0.95,
                }}
                initial={{
                  opacity: 0,
                  scale: 0.95,
                }}
                style={{
                  transformOrigin: getTransformOrigin(),
                }}
                transition={animationConfig}
              >
                {/* Header */}
                <div className="px-4 py-3 border-b border-gray-700/50">
                  <div className="flex items-center gap-2">
                    <Code className="size-4 text-teal-400" />
                    <h3 className="font-semibold text-sm text-gray-100 truncate">
                      {repo.name}
                    </h3>
                  </div>
                  {repo.description && (
                    <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                      {repo.description}
                    </p>
                  )}
                </div>

                {/* Stats Section */}
                <div className="px-3 py-2 border-b border-gray-700/30 bg-gray-800/30">
                  <div className="flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-1.5 text-gray-300">
                      <Star className="size-3.5 text-yellow-400/80" />
                      <span>{repo.stars}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-gray-300">
                      <Code className="size-3.5 text-blue-400/80" />
                      <span className="text-gray-400">
                        {repo.visibility === 'private'
                          ? 'Private'
                          : repo.visibility === 'internal'
                            ? 'Internal'
                            : 'Public'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions Menu - Dynamically rendered from menuItems array */}
                <div className="py-1.5">
                  {menuItems.map((item, index) => (
                    <MenuItem
                      key={item.label}
                      badge={item.badge}
                      disabled={item.disabled}
                      icon={item.icon}
                      isFocused={focusedItemIndex === index}
                      label={item.label}
                      onClick={item.onClick}
                      ref={(el) => {
                        menuItemRefs.current[index] = el
                        // Special ref for "View Issues" button (index 1)
                        if (index === 1) {
                          issuesButtonRef.current = el
                        }
                      }}
                    />
                  ))}
                </div>

                {/* Language Badge */}
                {repo.language && (
                  <div className="px-3 py-2 border-t border-gray-700/50 bg-gray-800/20">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400">Language</span>
                      <span className="text-xs font-medium text-fuchsia-300 bg-fuchsia-500/10 px-2 py-0.5 rounded">
                        {repo.language}
                      </span>
                    </div>
                  </div>
                )}
              </motion.div>
            </div>
          </FloatingFocusManager>
        )}
      </AnimatePresence>
    </FloatingPortal>

    {/* Issues Modal - only show if repository is in workspace */}
    {workspaceRepositoryId && (
      <IssuesModal
        accountId={repo.accountId}
        anchorPosition={savedButtonPositionRef.current}
        isOpen={showIssuesModal}
        owner={repo.owner}
        repo={repo.name}
        repositoryId={workspaceRepositoryId}
        provider={repo.provider}
        defaultBranch={repo.defaultBranch}
        onClose={() => setShowIssuesModal(false)}
        onLaunchWatchers={(issueNumbers) => {
          console.log('[RepositoryDropdown] AI watchers launched for issues:', issueNumbers)
        }}
      />
    )}
  </>
  )
}

interface MenuItemProps {
  icon: React.ElementType
  label: string
  badge?: React.ReactNode
  disabled?: boolean
  onClick?: () => void
  isFocused?: boolean
}

const MenuItem = React.forwardRef<HTMLButtonElement, MenuItemProps>(
  ({ icon: IconComponent, label, badge, disabled, onClick, isFocused }, ref) => {
    return (
      <button
        ref={ref}
        className={`
          w-full px-3 py-2 flex items-center justify-between gap-3 text-sm text-gray-200
          hover:bg-gray-700/40 hover:text-white
          transition-colors cursor-pointer group
          disabled:opacity-50 disabled:cursor-not-allowed
          ${isFocused ? 'bg-gray-700/60 ring-2 ring-inset ring-teal-500/50' : ''}
        `}
        disabled={disabled}
        onClick={onClick}
        type="button"
      >
      <div className="flex items-center gap-2.5">
        {React.createElement(IconComponent, { className: "size-4 text-gray-400 group-hover:text-teal-400 transition-colors" })}
        <span className="font-medium">{label}</span>
      </div>
      {badge && (
        <div className="text-xs text-gray-400">
          {typeof badge === 'string' ? (
            <span className="bg-gray-700/50 px-1.5 py-0.5 rounded">
              {badge}
            </span>
          ) : (
            badge
          )}
        </div>
      )}
    </button>
    )
  }
)
MenuItem.displayName = 'MenuItem'
