import { motion, useReducedMotion } from 'framer-motion'
import type { ProviderRepository } from '../../../shared/schemas/provider'
import type { Account } from '../../../shared/schemas/account-context'

interface RepositoryCardProps {
  repo: ProviderRepository
  isActive?: boolean
  account?: Account | null
}

export function RepositoryCard4({
  repo,
  isActive = false,
  account = null,
}: RepositoryCardProps) {
  const shouldReduceMotion = useReducedMotion()
  const providerLabel = repo.provider.toUpperCase()

  // Subtle hover effect for active card only
  const hoverVariants = {
    initial: { scale: 1 },
    hover: isActive && !shouldReduceMotion ? { scale: 1.02 } : { scale: 1 },
  }

  const hoverTransition = shouldReduceMotion
    ? { duration: 0.15, ease: [0.16, 1, 0.3, 1] }
    : { type: 'spring', stiffness: 400, damping: 25 }

  return (
    <motion.div
      className={`relative w-full h-full flex flex-col justify-between rounded-lg border p-3 ${
        isActive
          ? 'bg-black/20 border-teal-400/40 shadow-lg shadow-teal-400/30'
          : 'bg-black/10 border-teal-400/10'
      }`}
      style={{
        backfaceVisibility: 'hidden',
        // Only animate transform and opacity for optimal performance
        willChange: isActive ? 'transform' : 'auto',
      }}
      variants={hoverVariants}
      initial="initial"
      whileHover="hover"
      transition={hoverTransition}
    >
      {/* Header with repo name */}
      <h3
        className={`font-semibold ${isActive ? 'text-lg text-teal-300' : 'text-base text-teal-400/40'} truncate leading-tight`}
      >
        {repo.name}
      </h3>

      {/* Provider and account info */}
      <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
        <span className={isActive ? 'text-emerald-300' : 'text-emerald-300/40'}>
          {providerLabel}
        </span>
        {account && (
          <span className={isActive ? 'text-gray-300' : 'text-gray-500/40'}>
            {account.displayName ?? account.username}
          </span>
        )}
      </div>

      {/* Description - only show if active and exists */}
      {repo.description && (
        <p
          className={`text-xs line-clamp-2 ${isActive ? 'text-gray-300' : 'text-gray-400/40'}`}
        >
          {repo.description}
        </p>
      )}

      {/* Footer with language and stars */}
      <div className="flex items-center justify-between text-xs mt-1.5">
        {repo.language && (
          <span
            className={isActive ? 'text-fuchsia-300' : 'text-fuchsia-400/40'}
          >
            {repo.language}
          </span>
        )}
        <span className={isActive ? 'text-gray-400' : 'text-gray-500/40'}>
          {repo.stars} ★
        </span>
      </div>
    </motion.div>
  )
}
