import { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Result } from '@effect-atom/atom-react'
import type { GitHubRepository } from '../../../shared/schemas'
import type {
  AuthenticationError,
  NetworkError,
  NotFoundError,
} from '../../../shared/schemas/errors'
import { RepositoryCard } from './RepositoryCard'
import { RepositoryDropdown } from './RepositoryDropdown'

type IpcError = AuthenticationError | NetworkError | NotFoundError

interface RepositoryCarouselProps {
  repos: Result.Result<readonly GitHubRepository[], IpcError>
  isFocused: boolean
}

export interface RepositoryCarouselRef {
  jumpToIndex: (index: number, shuffleRight?: boolean) => void
}

// global persistent singleton for Electron listener
let ipcListenerAttached = false

export const RepositoryCarousel3 = forwardRef<RepositoryCarouselRef, RepositoryCarouselProps>(
  function RepositoryCarousel3({ repos, isFocused }, ref) {
    const [currentIndex, setCurrentIndex] = useState(0)
    const [isDropdownOpen, setIsDropdownOpen] = useState(false)
    const prevIndexRef = useRef(0)
    const currentIndexRef = useRef(currentIndex)
    const staticAnchorRef = useRef<HTMLDivElement>(null)
    currentIndexRef.current = currentIndex

    // Expose methods to parent component
    useImperativeHandle(ref, () => ({
      jumpToIndex: (index: number, shuffleRight = false) => {
        if (shuffleRight) {
          // Shuffle right 5 times quickly
          let count = 0
          const interval = setInterval(() => {
            count++
            setCurrentIndex(prev => prev + 1)
            if (count >= 5) {
              clearInterval(interval)
              // Then jump to the target index
              setTimeout(() => {
                setCurrentIndex(index)
              }, 100)
            }
          }, 100)
        } else {
          setCurrentIndex(index)
        }
      },
    }))

  useEffect(() => {
    if (ipcListenerAttached) return
    ipcListenerAttached = true

    const handleNext = () => {
      if (!isFocused) return // Ignore when unfocused
      setCurrentIndex(prev => prev + 1)
      setIsDropdownOpen(false) // Close dropdown when navigating
    }

    const handlePrev = () => {
      if (!isFocused) return // Ignore when unfocused
      setCurrentIndex(prev => prev - 1)
      setIsDropdownOpen(false) // Close dropdown when navigating
    }

    window.electron.ipcRenderer.on('carousel:next', handleNext)
    window.electron.ipcRenderer.on('carousel:prev', handlePrev)

    return () => {
      window.electron.ipcRenderer.removeListener('carousel:next', handleNext)
      window.electron.ipcRenderer.removeListener('carousel:prev', handlePrev)
    }
  }, [isFocused])

  // Handle Space key to toggle dropdown
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isFocused) return // Ignore when unfocused
      if (e.code === 'Space') {
        e.preventDefault()
        setIsDropdownOpen(prev => !prev)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isFocused])

  const spacing = 250
  const visibleOffsets = [-2, -1, 0, 1, 2]

  return (
    <div className="relative w-full flex items-center justify-center" style={{ height: '160px', overflow: 'visible' }}>
      {/* Static anchor point for dropdown - positioned at center, no animation */}
      <div
        ref={staticAnchorRef}
        style={{
          position: 'absolute',
          width: 200,
          height: 140,
          pointerEvents: 'none',
          visibility: 'hidden',
        }}
      />
      {Result.builder(repos)
        .onSuccess(repositories => {
          const total = repositories.length
          if (total === 0)
            return (
              <div className="text-gray-400 text-lg">No repositories yet</div>
            )

          const current = ((currentIndex % total) + total) % total
          const prevIndex = prevIndexRef.current
          let delta = current - prevIndex

          if (delta > total / 2) delta -= total
          if (delta < -total / 2) delta += total
          delta = Math.sign(delta)
          prevIndexRef.current = current

          return (
            <>
              <AnimatePresence custom={delta} initial={false}>
                {visibleOffsets.map(offset => {
                  const idx = (current + offset + total) % total
                  const repo = repositories[idx]
                  const isActive = offset === 0
                  const x = offset * spacing
                  const scale = isActive ? 1 : 0.85
                  const opacity = isActive
                    ? 1
                    : 0.3 + (0.35 * (2 - Math.abs(offset))) / 2

                  return (
                    <motion.div
                      animate={{ x, opacity, scale }}
                      custom={delta}
                      exit={{
                        x: x - delta * spacing,
                        opacity: 0,
                        scale: 0.85,
                      }}
                      initial={{
                        x: x + delta * spacing,
                        opacity: 0,
                        scale: 0.85,
                      }}
                      key={repo.id}
                      style={{
                        position: 'absolute',
                        width: 200,
                        height: 140,
                        transformStyle: 'preserve-3d',
                        zIndex: isActive ? 10 : 10 - Math.abs(offset),
                      }}
                      transition={{ type: 'spring', stiffness: 180, damping: 20 }}
                    >
                      <RepositoryCard isActive={isActive} repo={repo} />
                    </motion.div>
                  )
                })}
              </AnimatePresence>

              {/* Dropdown Menu for center item */}
              {total > 0 && (
                <RepositoryDropdown
                  repo={repositories[current]}
                  isOpen={isDropdownOpen}
                  onOpenChange={setIsDropdownOpen}
                  anchorRef={staticAnchorRef}
                />
              )}
            </>
          )
        })
        .render()}
    </div>
  )
})
