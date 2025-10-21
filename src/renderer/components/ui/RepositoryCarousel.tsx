import { useState, useEffect, useId, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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

// Calculate position on a circular carousel (like Tomb Raider item selection)
function getCarouselPosition(
  index: number,
  totalItems: number,
  radius: number = 400
) {
  // Angle in radians - items spread around a circle
  const angle = (index * (Math.PI * 2)) / totalItems

  // Calculate 3D position on the carousel
  const x = Math.sin(angle) * radius
  const z = Math.cos(angle) * radius

  // Y position creates subtle arc (items higher at back)
  const y = Math.cos(angle) * -30

  // Scale based on z-depth (further = smaller)
  const scale = 0.7 + (z / radius) * 0.3

  // Opacity based on z-depth (further = more transparent)
  const opacity = z > 0 ? 0.3 : 0.15 + (Math.abs(z) / radius) * 0.85

  // Rotation to face center
  const rotateY = -angle * (180 / Math.PI)

  return { x, y, z, scale, opacity, rotateY, angle }
}

export function RepositoryCarousel({ repos }: RepositoryCarouselProps) {
  const [rotation, setRotation] = useState(0) // Current rotation angle
  const id = useId()
  const breatheId = `breathe-${id}`

  // Listen for navigation events from main process
  useEffect(() => {
    const handleNext = () => {
      setRotation(prev => prev + 1)
    }

    const handlePrev = () => {
      setRotation(prev => prev - 1)
    }

    window.electron.ipcRenderer.on('carousel:next', handleNext)
    window.electron.ipcRenderer.on('carousel:prev', handlePrev)

    return () => {
      window.electron.ipcRenderer.removeListener('carousel:next', handleNext)
      window.electron.ipcRenderer.removeListener('carousel:prev', handlePrev)
    }
  }, [])

  return (
    <>
      <style>{`
        @keyframes ${breatheId} {
          0%   { filter: brightness(0.9); }
          50%  { filter: brightness(1.1); }
          100% { filter: brightness(0.9); }
        }
        .animate-${breatheId} {
          animation: ${breatheId} 3s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-${breatheId} {
            animation: none !important;
          }
        }
      `}</style>

      <div
        className="relative w-full h-80 flex items-center justify-center"
        style={{ perspective: '1200px' }}
      >
        {Result.builder(repos)
          .onInitial(() => (
            <motion.div
              animate={{ opacity: 1 }}
              className="text-gray-400 text-lg"
              initial={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
            >
              Loading repositories...
            </motion.div>
          ))
          .onErrorTag('AuthenticationError', () => (
            <motion.div
              animate={{ opacity: 1 }}
              className="text-fuchsia-300 text-lg"
              initial={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
            >
              Please sign in to view repositories
            </motion.div>
          ))
          .onErrorTag('NetworkError', error => (
            <motion.div
              animate={{ opacity: 1 }}
              className="text-red-400 text-lg"
              initial={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
            >
              Network error: {error.message}
            </motion.div>
          ))
          .onErrorTag('NotFoundError', () => (
            <motion.div
              animate={{ opacity: 1 }}
              className="text-gray-400 text-lg"
              initial={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
            >
              No repositories found
            </motion.div>
          ))
          .onDefect(defect => (
            <motion.div
              animate={{ opacity: 1 }}
              className="text-red-400 text-lg"
              initial={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
            >
              Error: {String(defect)}
            </motion.div>
          ))
          .onSuccess(repositories => {
            if (repositories.length === 0) {
              return (
                <motion.div
                  animate={{ opacity: 1 }}
                  className="text-gray-400 text-lg"
                  initial={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  No repositories yet
                </motion.div>
              )
            }

            const totalItems = repositories.length
            const currentIndex =
              ((rotation % totalItems) + totalItems) % totalItems

            return (
              <div
                className="relative w-full h-full flex items-center justify-center"
                style={{ transformStyle: 'preserve-3d' }}
              >
                {repositories.map((repo, idx) => {
                  // Calculate offset from current rotation
                  const offset = idx - rotation
                  const position = getCarouselPosition(offset, totalItems)

                  // Check if this is the active (front-center) item
                  const isActive = idx === currentIndex

                  return (
                    <motion.div
                      animate={{
                        x: position.x,
                        y: position.y,
                        z: position.z,
                        scale: position.scale,
                        opacity: position.opacity,
                        rotateY: position.rotateY,
                      }}
                      className={`absolute w-80 h-48 ${isActive ? `animate-${breatheId}` : ''}`}
                      key={repo.id}
                      style={{
                        transformStyle: 'preserve-3d',
                        zIndex: Math.round(position.z),
                      }}
                      transition={{
                        type: 'spring',
                        stiffness: 120,
                        damping: 20,
                        mass: 1,
                      }}
                    >
                      <RepositoryCard
                        isActive={isActive}
                        isFaded={position.z < -200}
                        repo={repo}
                      />
                    </motion.div>
                  )
                })}
              </div>
            )
          })
          .render()}
      </div>
    </>
  )
}

interface RepositoryCardProps {
  repo: GitHubRepository
  isActive?: boolean
  isFaded?: boolean
}

function RepositoryCard({
  repo,
  isActive = false,
  isFaded = false,
}: RepositoryCardProps) {
  const id = useId()
  const cardGradId = `repoCardGrad-${id}`
  const glowId = `repoGlow-${id}`

  return (
    <div
      className="relative w-full h-full rounded-xl overflow-hidden"
      style={{
        transformStyle: 'preserve-3d',
        backfaceVisibility: 'hidden',
      }}
    >
      {/* SVG Background with gradient and glow */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        <defs>
          <radialGradient cx="50%" cy="50%" id={cardGradId} r="70%">
            <stop
              offset="0%"
              stopColor="#00ffff"
              stopOpacity={isActive ? '0.35' : isFaded ? '0.05' : '0.15'}
            />
            <stop
              offset="50%"
              stopColor="#a855f7"
              stopOpacity={isActive ? '0.25' : isFaded ? '0.02' : '0.08'}
            />
            <stop offset="100%" stopColor="#00ffff" stopOpacity="0" />
          </radialGradient>

          <filter height="400%" id={glowId} width="400%" x="-150%" y="-150%">
            <feGaussianBlur
              result="blur"
              stdDeviation={isActive ? '20' : isFaded ? '4' : '8'}
            />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect
          fill={`url(#${cardGradId})`}
          filter={`url(#${glowId})`}
          height="100%"
          rx="12"
          width="100%"
          x="0"
          y="0"
        />
      </svg>

      {/* Content */}
      <div
        className={`relative z-10 p-5 h-full flex flex-col justify-between backdrop-blur-sm rounded-xl transition-all duration-300 ${
          isActive
            ? 'bg-black/40 border-2 border-teal-400/50 shadow-xl shadow-teal-400/30'
            : isFaded
              ? 'bg-black/20 border border-teal-400/5'
              : 'bg-black/25 border border-teal-400/15'
        }`}
      >
        <div>
          <h3
            className={`font-semibold mb-2 truncate transition-all duration-300 ${
              isActive
                ? 'text-2xl text-teal-300'
                : isFaded
                  ? 'text-base text-teal-400/30'
                  : 'text-lg text-teal-400/50'
            }`}
          >
            {repo.name}
          </h3>

          {repo.description && (
            <p
              className={`text-xs line-clamp-2 transition-all duration-300 ${
                isActive
                  ? 'text-gray-300'
                  : isFaded
                    ? 'text-gray-400/20'
                    : 'text-gray-400/40'
              }`}
            >
              {repo.description}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-3">
            {repo.language && (
              <span
                className={`transition-all duration-300 ${
                  isActive
                    ? 'text-fuchsia-300'
                    : isFaded
                      ? 'text-fuchsia-400/20'
                      : 'text-fuchsia-400/35'
                }`}
              >
                {repo.language}
              </span>
            )}
            <span
              className={`flex items-center gap-1 transition-all duration-300 ${
                isActive
                  ? 'text-gray-400'
                  : isFaded
                    ? 'text-gray-500/20'
                    : 'text-gray-500/35'
              }`}
            >
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 16 16">
                <path d="M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z" />
              </svg>
              {repo.stargazers_count}
            </span>
          </div>

          {repo.private && (
            <span
              className={`text-xs transition-all duration-300 ${
                isActive
                  ? 'text-yellow-400'
                  : isFaded
                    ? 'text-yellow-500/20'
                    : 'text-yellow-500/35'
              }`}
            >
              Private
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
