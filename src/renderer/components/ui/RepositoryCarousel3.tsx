import { useState, useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Result } from '@effect-atom/atom-react'
import type { GitHubRepository } from '../../../shared/schemas'
import type {
  AuthenticationError,
  NetworkError,
  NotFoundError,
} from '../../../shared/schemas/errors'
import { RepositoryCard } from './RepositoryCard'

type IpcError = AuthenticationError | NetworkError | NotFoundError

interface RepositoryCarouselProps {
  repos: Result.Result<readonly GitHubRepository[], IpcError>
}

// global persistent singleton for Electron listener
let ipcListenerAttached = false

export function RepositoryCarousel3({ repos }: RepositoryCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const prevIndexRef = useRef(0)
  const currentIndexRef = useRef(currentIndex)
  currentIndexRef.current = currentIndex

  useEffect(() => {
    if (ipcListenerAttached) return
    ipcListenerAttached = true

    const handleNext = () => setCurrentIndex(prev => prev + 1)
    const handlePrev = () => setCurrentIndex(prev => prev - 1)

    window.electron.ipcRenderer.on('carousel:next', handleNext)
    window.electron.ipcRenderer.on('carousel:prev', handlePrev)

    return () => {
      window.electron.ipcRenderer.removeListener('carousel:next', handleNext)
      window.electron.ipcRenderer.removeListener('carousel:prev', handlePrev)
    }
  }, [])

  const spacing = 250
  const visibleOffsets = [-2, -1, 0, 1, 2]

  return (
    <div className="relative w-full h-36 flex items-center justify-center overflow-hidden">
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
          )
        })
        .render()}
    </div>
  )
}
