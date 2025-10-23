import {
  useState,
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
} from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Result } from '@effect-atom/atom-react'
import type { ProviderRepository } from '../../../shared/schemas/provider'
import type { Account } from '../../../shared/schemas/account-context'
import type {
  AuthenticationError,
  NetworkError,
  NotFoundError,
  ProviderFeatureUnavailableError,
  ProviderOperationError,
  ProviderUnavailableError,
} from '../../../shared/schemas/errors'
import { RepositoryCard4 } from './RepositoryCard4'
import { PlaceholderCard } from './PlaceholderCard'
import { RepositoryDropdown } from './RepositoryDropdown'

// Custom spring presets for more energetic, natural motion
const SPRING_CONFIGS = {
  // Snappy, responsive spring for card movement
  card: {
    type: 'spring' as const,
    stiffness: 300,
    damping: 30,
    mass: 0.8,
  },
  // Softer spring for scale/opacity to avoid jarring transitions
  decorative: {
    type: 'spring' as const,
    stiffness: 250,
    damping: 25,
    mass: 0.5,
  },
  // Reduced motion fallback - simple ease-out curve
  reduced: {
    type: 'tween' as const,
    duration: 0.2,
    ease: [0.16, 1, 0.3, 1] as const, // Custom ease-out curve from easings.co
  },
}

type IpcError =
  | AuthenticationError
  | NetworkError
  | NotFoundError
  | ProviderFeatureUnavailableError
  | ProviderOperationError
  | ProviderUnavailableError

interface RepositoryCarouselProps {
  repos: Result.Result<readonly ProviderRepository[], IpcError>
  isFocused: boolean
  account?: Account | null
}

export interface RepositoryCarouselRef {
  jumpToIndex: (index: number, shuffleRight?: boolean) => void
}

// global persistent singleton for Electron listener
let ipcListenerAttached = false

export const RepositoryCarousel4 = forwardRef<
  RepositoryCarouselRef,
  RepositoryCarouselProps
>(function RepositoryCarousel4({ repos, isFocused, account = null }, ref) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const prevIndexRef = useRef(0)
  const currentIndexRef = useRef(currentIndex)
  const staticAnchorRef = useRef<HTMLDivElement>(null)
  const shouldReduceMotion = useReducedMotion()
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
          if (count >= 3) {
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

  // Compact spacing - only show 3 cards (left half, center, right half)
  const spacing = 150
  const visibleOffsets = [-1, 0, 1]

  return (
    <div
      className="relative w-full flex items-center justify-center"
      style={{ height: '140px', overflow: 'visible' }}
    >
      {/* Static anchor point for dropdown - positioned at center, no animation */}
      <div
        ref={staticAnchorRef}
        style={{
          position: 'absolute',
          width: 240,
          height: 120,
          pointerEvents: 'none',
          visibility: 'hidden',
        }}
      />
      {Result.builder(repos)
        .onSuccess(repositories => {
          const total = repositories.length
          if (total === 0)
            return (
              <div className="text-gray-400 text-sm">No repositories yet</div>
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

                  // Main card: full size and full opacity
                  // Side cards: scaled down and clipped to show only half
                  const scale = isActive ? 1 : 0.9
                  const opacity = isActive ? 1 : 0.5

                  // Choose transition based on reduced motion preference
                  const positionTransition = shouldReduceMotion
                    ? SPRING_CONFIGS.reduced
                    : SPRING_CONFIGS.card
                  const decorativeTransition = shouldReduceMotion
                    ? SPRING_CONFIGS.reduced
                    : SPRING_CONFIGS.decorative

                  return (
                    <motion.div
                      animate={{
                        x,
                        opacity,
                        scale,
                      }}
                      custom={delta}
                      exit={{
                        x: x - delta * spacing,
                        opacity: 0,
                        scale: 0.9,
                        transition: positionTransition,
                      }}
                      initial={{
                        x: x + delta * spacing,
                        opacity: 0,
                        scale: 0.9,
                      }}
                      key={repo.repositoryId}
                      style={{
                        position: 'absolute',
                        width: 240,
                        height: 120,
                        transformStyle: 'preserve-3d',
                        zIndex: isActive ? 10 : 5,
                        clipPath: isActive
                          ? 'none'
                          : offset < 0
                            ? 'inset(0 50% 0 0)' // Show left half for left card
                            : 'inset(0 0 0 50%)', // Show right half for right card
                        // Enable hardware acceleration
                        willChange: 'transform, opacity',
                      }}
                      transition={{
                        // Position changes are snappy and responsive
                        x: positionTransition,
                        // Scale and opacity are softer for visual comfort
                        scale: decorativeTransition,
                        opacity: decorativeTransition,
                      }}
                    >
                      {isActive ? (
                        <RepositoryCard4
                          account={account}
                          isActive={isActive}
                          repo={repo}
                        />
                      ) : (
                        <PlaceholderCard />
                      )}
                    </motion.div>
                  )
                })}
              </AnimatePresence>

              {/* Dropdown Menu for center item */}
              {total > 0 && (
                <RepositoryDropdown
                  anchorRef={staticAnchorRef}
                  isOpen={isDropdownOpen}
                  onOpenChange={setIsDropdownOpen}
                  repo={repositories[current]}
                />
              )}
            </>
          )
        })
        .render()}
    </div>
  )
})
