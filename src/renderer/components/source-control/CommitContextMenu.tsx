import React, { useEffect, useRef } from 'react'
import type { Commit } from '../../../shared/schemas/source-control'

/**
 * CommitContextMenu Component
 *
 * Right-click context menu for commit operations.
 *
 * Features:
 * - Copy commit hash
 * - Copy commit message
 * - View commit details
 * - Placeholder for future operations (checkout, cherry-pick, etc.)
 * - Smart positioning (adjusts if too close to edge)
 * - Click-outside to close
 *
 * Usage:
 * ```tsx
 * {contextMenu && (
 *   <CommitContextMenu
 *     commit={contextMenu.commit}
 *     position={contextMenu.position}
 *     onClose={() => setContextMenu(null)}
 *     onViewDetails={(commit) => handleCommitSelect(commit.hash)}
 *   />
 * )}
 * ```
 */

interface CommitContextMenuProps {
  /** The commit to show menu for */
  commit: Commit

  /** Position where menu should appear (x, y in pixels) */
  position: { x: number; y: number }

  /** Callback when menu should close */
  onClose: () => void

  /** Callback when "View Details" is clicked */
  onViewDetails?: (commit: Commit) => void
}

interface MenuItemProps {
  icon: string
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}

function MenuItem({ icon, label, onClick, disabled = false, danger = false }: MenuItemProps) {
  return (
    <button
      onClick={() => {
        if (!disabled) {
          onClick()
        }
      }}
      disabled={disabled}
      className={`
        w-full flex items-center gap-3 px-4 py-2 text-sm text-left transition-colors
        ${
          disabled
            ? 'text-gray-500 cursor-not-allowed'
            : danger
              ? 'text-red-400 hover:bg-red-900/20'
              : 'text-gray-200 hover:bg-gray-700'
        }
      `}
    >
      <span className="w-5 text-center">{icon}</span>
      <span>{label}</span>
      {disabled && <span className="ml-auto text-xs text-gray-600">Soon</span>}
    </button>
  )
}

export function CommitContextMenu({
  commit,
  position,
  onClose,
  onViewDetails,
}: CommitContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  const shortHash = String(commit.hash).slice(0, 7)

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    // Use capture phase to ensure we detect clicks before they bubble
    document.addEventListener('mousedown', handleClickOutside, true)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true)
    }
  }, [onClose])

  // Handle escape key to close
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  // Adjust position if menu would go off-screen
  const adjustedPosition = (() => {
    const menuWidth = 240
    const menuHeight = 400 // Approximate
    const padding = 10

    let x = position.x
    let y = position.y

    // Adjust if too close to right edge
    if (x + menuWidth > window.innerWidth - padding) {
      x = window.innerWidth - menuWidth - padding
    }

    // Adjust if too close to bottom
    if (y + menuHeight > window.innerHeight - padding) {
      y = window.innerHeight - menuHeight - padding
    }

    return { x, y }
  })()

  const handleCopyHash = () => {
    navigator.clipboard.writeText(String(commit.hash))
    console.log('[CommitContextMenu] Copied hash to clipboard:', shortHash)
    onClose()
  }

  const handleCopyShortHash = () => {
    navigator.clipboard.writeText(shortHash)
    console.log('[CommitContextMenu] Copied short hash to clipboard:', shortHash)
    onClose()
  }

  const handleCopyMessage = () => {
    navigator.clipboard.writeText(commit.message)
    console.log('[CommitContextMenu] Copied message to clipboard')
    onClose()
  }

  const handleViewDetails = () => {
    onViewDetails?.(commit)
    onClose()
  }

  return (
    <div
      ref={menuRef}
      className="fixed bg-gray-800 border border-gray-700 rounded-lg shadow-2xl z-[100] min-w-[240px]"
      style={{
        left: `${adjustedPosition.x}px`,
        top: `${adjustedPosition.y}px`,
      }}
    >
      {/* Header */}
      <div className="px-4 py-2 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <code className="text-xs font-mono text-blue-400">{shortHash}</code>
          <span className="text-xs text-gray-500 truncate max-w-[160px]">
            {commit.subject}
          </span>
        </div>
      </div>

      {/* Menu Items */}
      <div className="py-1">
        <MenuItem
          icon="📋"
          label="Copy Hash"
          onClick={handleCopyHash}
        />
        <MenuItem
          icon="📋"
          label="Copy Short Hash"
          onClick={handleCopyShortHash}
        />
        <MenuItem
          icon="📄"
          label="Copy Commit Message"
          onClick={handleCopyMessage}
        />

        <div className="h-px bg-gray-700 my-1" />

        <MenuItem
          icon="🔍"
          label="View Details"
          onClick={handleViewDetails}
        />

        <div className="h-px bg-gray-700 my-1" />

        {/* Future operations - disabled for now */}
        <MenuItem
          icon="📍"
          label="Checkout"
          onClick={() => {}}
          disabled
        />
        <MenuItem
          icon="🍒"
          label="Cherry Pick"
          onClick={() => {}}
          disabled
        />
        <MenuItem
          icon="↩️"
          label="Revert"
          onClick={() => {}}
          disabled
          danger
        />
        <MenuItem
          icon="🌿"
          label="Create Branch Here"
          onClick={() => {}}
          disabled
        />
        <MenuItem
          icon="🏷️"
          label="Create Tag"
          onClick={() => {}}
          disabled
        />

        <div className="h-px bg-gray-700 my-1" />

        <MenuItem
          icon="🔗"
          label="Compare with Working Tree"
          onClick={() => {}}
          disabled
        />
      </div>
    </div>
  )
}
