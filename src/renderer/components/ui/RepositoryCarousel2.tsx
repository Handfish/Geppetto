import { useState, useEffect } from 'react'
import { Result } from '@effect-atom/atom-react'
import type { GitHubRepository } from '../../../shared/schemas'
import type {
  AuthenticationError,
  NetworkError,
  NotFoundError,
} from '../../../shared/schemas/errors'

type IpcError = AuthenticationError | NetworkError | NotFoundError

interface RepositoryCarouselProps {
  repos: Result.Result<readonly GitHubRepository[], IpcError>
}

export function RepositoryCarousel2({ repos }: RepositoryCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0)

  useEffect(() => {
    const handleNext = () => setCurrentIndex(prev => prev + 1)
    const handlePrev = () => setCurrentIndex(prev => prev - 1)

    window.electron.ipcRenderer.on('carousel:next', handleNext)
    window.electron.ipcRenderer.on('carousel:prev', handlePrev)

    return () => {
      window.electron.ipcRenderer.removeListener('carousel:next', handleNext)
      window.electron.ipcRenderer.removeListener('carousel:prev', handlePrev)
    }
  }, [])

  return (
    <div className="relative w-full h-72 flex items-center justify-center perspective-[1200px] overflow-hidden">
      {Result.builder(repos)
        .onSuccess(repositories => {
          const total = repositories.length
          if (total === 0)
            return (
              <div className="text-gray-400 text-lg">No repositories yet</div>
            )

          const current = ((currentIndex % total) + total) % total
          const visibleOffsets = [-2, -1, 0, 1, 2]
          const spacing = 280
          const maxRotation = 60
          const maxScale = 1
          const minScale = 0.85
          const yLift = 10

          return (
            <div
              className="absolute w-full h-full flex items-center justify-center"
              style={{ transformStyle: 'preserve-3d' }}
            >
              {visibleOffsets.map(offset => {
                const idx = (current + offset + total) % total
                const repo = repositories[idx]

                const isActive = offset === 0
                const rotationY =
                  offset < 0
                    ? (Math.abs(offset) / 2) * maxRotation
                    : offset > 0
                      ? -(Math.abs(offset) / 2) * maxRotation
                      : 0

                const scale = isActive
                  ? maxScale
                  : maxScale - (Math.abs(offset) * (maxScale - minScale)) / 2
                const yOffset = Math.abs(offset) * yLift
                const xOffset = offset * spacing

                return (
                  <div
                    className="absolute w-[260px] h-[180px] rounded-xl border p-5 flex flex-col justify-between backdrop-blur-sm transition-all duration-500 ease-in-out"
                    key={repo.id}
                    style={{
                      transform: `translateX(${xOffset}px) translateY(${yOffset}px) scale(${scale}) rotateY(${rotationY}deg)`,
                      transformStyle: 'preserve-3d',
                      zIndex: isActive ? 10 : 10 - Math.abs(offset),
                      backgroundColor: isActive
                        ? 'rgba(0,0,0,0.4)'
                        : 'rgba(0,0,0,0.25)',
                      borderColor: isActive
                        ? 'rgba(16, 185, 129, 0.4)'
                        : 'rgba(16, 185, 129, 0.1)',
                    }}
                  >
                    <div>
                      <h3
                        className={`font-semibold truncate ${isActive ? 'text-xl text-teal-300' : 'text-lg text-teal-400/40'}`}
                      >
                        {repo.name}
                      </h3>
                      {repo.description && (
                        <p
                          className={`text-xs line-clamp-2 ${isActive ? 'text-gray-300' : 'text-gray-400/40'}`}
                        >
                          {repo.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-xs mt-2">
                      <div className="flex items-center gap-2">
                        {repo.language && (
                          <span
                            className={`${isActive ? 'text-fuchsia-300' : 'text-fuchsia-400/40'}`}
                          >
                            {repo.language}
                          </span>
                        )}
                        <span
                          className={`${isActive ? 'text-gray-400' : 'text-gray-500/40'}`}
                        >
                          ⭐ {repo.stargazers_count}
                        </span>
                      </div>
                      {repo.private && (
                        <span
                          className={`${isActive ? 'text-yellow-400' : 'text-yellow-500/40'}`}
                        >
                          Private
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })
        .render()}
    </div>
  )
}
