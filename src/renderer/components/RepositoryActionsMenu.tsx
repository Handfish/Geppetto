import React from 'react'
import { useAtom, useAtomSet } from '@effect-atom/atom-react'
import {
  cloneToWorkspaceAtom,
} from '../atoms/workspace-atoms'
import { WorkspaceClient } from '../lib/ipc-client'
import type { ProviderRepository } from '../../shared/schemas/provider'
import { Effect } from 'effect'

interface MenuItem {
  id: string
  label: string
  disabled: boolean
  action: () => void
}

interface RepositoryActionsMenuProps {
  repository: ProviderRepository
  isOpen: boolean
  onClose: () => void
  buttonRef: React.RefObject<HTMLButtonElement | null>
}

export function RepositoryActionsMenu({
  repository,
  isOpen,
  onClose,
  buttonRef,
}: RepositoryActionsMenuProps) {
  const [selectedIndex, setSelectedIndex] = React.useState(0)
  const menuRef = React.useRef<HTMLDivElement>(null)
  const [isInWorkspace, setIsInWorkspace] = React.useState(false)
  const [isCheckingWorkspace, setIsCheckingWorkspace] = React.useState(false)

  // Clone action
  const [cloneResult, cloneToWorkspace] = useAtom(cloneToWorkspaceAtom)

  const isCloning = cloneResult.waiting

  // Only check workspace status when menu opens
  React.useEffect(() => {
    if (!isOpen) return

    setIsCheckingWorkspace(true)

    const checkWorkspace = Effect.gen(function* () {
      const client = yield* WorkspaceClient
      const result = yield* client.checkRepositoryInWorkspace({
        owner: repository.owner,
        repoName: repository.name,
        provider: repository.provider,
        defaultBranch: repository.defaultBranch,
      })
      return result.inWorkspace
    })

    Effect.runPromise(
      checkWorkspace.pipe(Effect.provide(WorkspaceClient.Default))
    )
      .then(inWorkspace => {
        setIsInWorkspace(inWorkspace)
        setIsCheckingWorkspace(false)
      })
      .catch(() => {
        setIsInWorkspace(false)
        setIsCheckingWorkspace(false)
      })
  }, [isOpen, repository.owner, repository.name])

  const handleClone = () => {
    cloneToWorkspace({
      cloneUrl: repository.cloneUrl,
      repoName: repository.name,
      owner: repository.owner,
      defaultBranch: repository.defaultBranch,
      provider: repository.provider,
    })
    onClose()
  }

  const menuItems: MenuItem[] = [
    {
      id: 'clone',
      label: isInWorkspace ? 'Already in Workspace' : 'Clone to Workspace',
      disabled: isInWorkspace || isCloning,
      action: handleClone,
    },
    {
      id: 'view',
      label: 'View on GitHub',
      disabled: false,
      action: () => {
        window.open(repository.webUrl, '_blank')
        onClose()
      },
    },
  ]

  // Keyboard navigation
  React.useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex((prev) => (prev + 1) % menuItems.length)
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex((prev) => (prev - 1 + menuItems.length) % menuItems.length)
          break
        case 'Enter':
        case ' ':
          e.preventDefault()
          const selectedItem = menuItems[selectedIndex]
          if (!selectedItem.disabled) {
            selectedItem.action()
          }
          break
        case 'Escape':
          e.preventDefault()
          onClose()
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, selectedIndex, menuItems, onClose])

  // Click outside to close
  React.useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, onClose, buttonRef])

  // Reset selected index when menu opens
  React.useEffect(() => {
    if (isOpen) {
      setSelectedIndex(0)
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div
      ref={menuRef}
      className="absolute top-full right-0 mt-1 w-56 bg-gray-800 border border-gray-700 rounded-md shadow-lg z-50 py-1"
    >
      {menuItems.map((item, index) => (
        <button
          key={item.id}
          onClick={() => {
            if (!item.disabled) {
              item.action()
            }
          }}
          disabled={item.disabled}
          className={`
            w-full text-left px-4 py-2 text-sm transition-colors
            ${
              selectedIndex === index
                ? 'bg-blue-600 text-white'
                : 'text-gray-300 hover:bg-gray-700'
            }
            ${item.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
