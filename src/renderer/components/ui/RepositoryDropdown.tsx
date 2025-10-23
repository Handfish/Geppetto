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
} from 'lucide-react'
import type { ProviderRepository } from '../../../shared/schemas/provider'

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

                {/* Actions Menu */}
                <div className="py-1.5">
                  <MenuItem
                    icon={ExternalLink}
                    label={`Open in ${repo.provider}`}
                  />
                  <MenuItem
                    badge="main"
                    icon={GitBranch}
                    label="View Branches"
                  />
                  <MenuItem icon={FileText} label="View README" />
                  <MenuItem icon={Code} label="Clone Repository" />
                </div>

                {/* Separator */}
                <div className="h-px bg-gray-700/50 my-1" />

                {/* Settings */}
                <div className="py-1.5">
                  <MenuItem icon={Settings} label="Repository Settings" />
                  <MenuItem
                    badge={<Check className="size-3 text-teal-400" />}
                    icon={Star}
                    label="Starred"
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
              </motion.div>
            </div>
          </FloatingFocusManager>
        )}
      </AnimatePresence>
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
      className="w-full px-3 py-2 flex items-center justify-between gap-3 text-sm text-gray-200 hover:bg-gray-700/40 hover:text-white transition-colors cursor-pointer group"
      onClick={onClick}
      type="button"
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
