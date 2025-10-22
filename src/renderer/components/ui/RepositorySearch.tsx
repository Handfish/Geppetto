import { useState, useEffect, useRef } from 'react'
import { Search } from 'lucide-react'
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  size,
} from '@floating-ui/react'
import type { GitHubRepository } from '../../../shared/schemas'

interface RepositorySearchProps {
  repos: readonly GitHubRepository[]
  isFocused: boolean
  onSelectRepo: (index: number) => void
}

export function RepositorySearch({
  repos,
  isFocused,
  onSelectRepo,
}: RepositorySearchProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const { refs, floatingStyles } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    middleware: [
      offset(10),
      flip(),
      shift(),
      size({
        apply({ rects, elements }) {
          Object.assign(elements.floating.style, {
            minWidth: `${rects.reference.width}px`,
          })
        },
      }),
    ],
    whileElementsMounted: autoUpdate,
  })

  // Filter repos based on search query
  const filteredRepos = searchQuery.trim()
    ? repos.filter(repo =>
        repo.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : []

  // Reset selected index when filtered results change
  useEffect(() => {
    setSelectedIndex(0)
  }, [searchQuery])

  // Handle '/' key to focus input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isFocused) return

      // Only capture '/' if we're not already focused in the input
      if (e.key === '/' && document.activeElement !== inputRef.current) {
        e.preventDefault()
        inputRef.current?.focus()
        setIsOpen(true)
      }

      // Handle Escape to close
      if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        e.preventDefault()
        inputRef.current?.blur()
        setIsOpen(false)
        setSearchQuery('')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isFocused])

  // Handle arrow keys and enter
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen || filteredRepos.length === 0) return
      if (document.activeElement !== inputRef.current) return

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex(prev =>
            prev < filteredRepos.length - 1 ? prev + 1 : prev
          )
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex(prev => (prev > 0 ? prev - 1 : prev))
          break
        case 'Enter':
          e.preventDefault()
          if (filteredRepos[selectedIndex]) {
            const repoIndex = repos.findIndex(
              r => r.id === filteredRepos[selectedIndex].id
            )
            if (repoIndex !== -1) {
              onSelectRepo(repoIndex)
              setIsOpen(false)
              setSearchQuery('')
              inputRef.current?.blur()
            }
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, filteredRepos, selectedIndex, repos, onSelectRepo])

  // Auto-scroll selected item into view
  useEffect(() => {
    const selectedElement = document.getElementById(
      `repo-item-${selectedIndex}`
    )
    selectedElement?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedIndex])

  return (
    <div className="flex items-center gap-2">
      <div className="relative" ref={refs.setReference}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-teal-400" />
          <input
            className="pl-10 pr-4 py-2 bg-gray-800/50 rounded border border-gray-700/50 text-gray-300 placeholder:text-gray-500 focus:outline-none focus:border-teal-400/50 focus:ring-1 focus:ring-teal-400/50 transition-colors"
            onChange={e => {
              setSearchQuery(e.target.value)
              setIsOpen(e.target.value.trim().length > 0)
            }}
            onFocus={() => {
              if (searchQuery.trim().length > 0) {
                setIsOpen(true)
              }
            }}
            placeholder="Search repos"
            ref={inputRef}
            style={{ width: '250px' }}
            type="text"
            value={searchQuery}
          />
        </div>

        {/* Floating dropdown */}
        {isOpen && filteredRepos.length > 0 && (
          <div
            className="bg-gray-800/95 backdrop-blur-sm border border-gray-700/50 rounded shadow-xl z-50 overflow-hidden"
            ref={refs.setFloating}
            style={floatingStyles}
          >
            <div className="max-h-64 overflow-y-auto custom-scrollbar">
              {filteredRepos.map((repo, index) => (
                <button
                  className={`w-full px-4 py-3 text-left transition-colors ${
                    index === selectedIndex
                      ? 'bg-teal-400/20 border-l-2 border-teal-400'
                      : 'hover:bg-gray-700/50'
                  }`}
                  id={`repo-item-${index}`}
                  key={repo.id}
                  onClick={() => {
                    const repoIndex = repos.findIndex(r => r.id === repo.id)
                    if (repoIndex !== -1) {
                      onSelectRepo(repoIndex)
                      setIsOpen(false)
                      setSearchQuery('')
                      inputRef.current?.blur()
                    }
                  }}
                >
                  <div className="font-medium text-gray-200">{repo.name}</div>
                  {repo.description && (
                    <div className="text-sm text-gray-400 line-clamp-1">
                      {repo.description}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Help text styled like Navigate/Space buttons */}
      <div className="flex items-center gap-2 text-gray-500 text-sm">
        <kbd className="px-2 py-1 bg-gray-800/50 rounded border border-gray-700/50 text-teal-400">
          /
        </kbd>
        <span>Search</span>
      </div>
    </div>
  )
}
