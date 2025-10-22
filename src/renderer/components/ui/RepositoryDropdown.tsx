import { useState, useRef, useEffect } from 'react'
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
} from 'lucide-react'
import type { GitHubRepository } from '../../../shared/schemas'

interface RepositoryDropdownProps {
  repo: GitHubRepository
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
  const { refs, floatingStyles, context, middlewareData } = useFloating({
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

  // Sync anchor element - update whenever anchorRef or isOpen changes
  useEffect(() => {
    if (anchorRef.current && isOpen) {
      refs.setReference(anchorRef.current)
    }
  }, [anchorRef, refs, isOpen, repo.id]) // Re-sync when repo changes

  // Don't render if not open, if anchor is not available, or if hidden by middleware
  const isHidden = middlewareData.hide?.referenceHidden
  if (!isOpen || !anchorRef.current || isHidden) return null

  return (
    <FloatingPortal>
      <FloatingFocusManager context={context} modal={false}>
        <div
          ref={refs.setFloating}
          style={floatingStyles}
          {...getFloatingProps()}
          className="z-50 min-w-[280px] rounded-lg border border-gray-700/80 bg-gradient-to-b from-gray-800/95 to-gray-900/95 backdrop-blur-xl shadow-2xl shadow-black/50"
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
                <span>{repo.stargazers_count}</span>
              </div>
              <div className="flex items-center gap-1.5 text-gray-300">
                <Code className="size-3.5 text-blue-400/80" />
                <span className="text-gray-400">{repo.private ? 'Private' : 'Public'}</span>
              </div>
            </div>
          </div>

          {/* Actions Menu */}
          <div className="py-1.5">
            <MenuItem icon={ExternalLink} label="Open in GitHub" />
            <MenuItem icon={GitBranch} label="View Branches" badge="main" />
            <MenuItem icon={FileText} label="View README" />
            <MenuItem icon={Code} label="Clone Repository" />
          </div>

          {/* Separator */}
          <div className="h-px bg-gray-700/50 my-1" />

          {/* Settings */}
          <div className="py-1.5">
            <MenuItem icon={Settings} label="Repository Settings" />
            <MenuItem
              icon={Star}
              label="Starred"
              badge={<Check className="size-3 text-teal-400" />}
            />
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
        </div>
      </FloatingFocusManager>
    </FloatingPortal>
  )
}

interface MenuItemProps {
  icon: React.ElementType
  label: string
  badge?: React.ReactNode
  onClick?: () => void
}

function MenuItem({ icon: Icon, label, badge, onClick }: MenuItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full px-3 py-2 flex items-center justify-between gap-3 text-sm text-gray-200 hover:bg-gray-700/40 hover:text-white transition-colors cursor-pointer group"
    >
      <div className="flex items-center gap-2.5">
        <Icon className="size-4 text-gray-400 group-hover:text-teal-400 transition-colors" />
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
