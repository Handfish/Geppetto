import type { ProviderRepository } from '../../../shared/schemas/provider'
import type { Account } from '../../../shared/schemas/account-context'

interface RepositoryCardProps {
  repo: ProviderRepository
  isActive?: boolean
  account?: Account | null
}

export function RepositoryCard({
  repo,
  isActive = false,
  account = null,
}: RepositoryCardProps) {
  const providerLabel = repo.provider.toUpperCase()
  return (
    <div
      className={`relative w-full h-full flex flex-col justify-between rounded-xl border p-4 ${
        isActive
          ? 'bg-black/20 border-teal-400/40 shadow-lg shadow-teal-400/30'
          : 'bg-black/10 border-teal-400/10'
      }`}
      style={{ backfaceVisibility: 'hidden' }}
    >
      <h3
        className={`font-semibold ${isActive ? 'text-xl text-teal-300' : 'text-lg text-teal-400/40'} truncate`}
      >
        {repo.name}
      </h3>
      <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
        <span className={isActive ? 'text-emerald-300' : 'text-emerald-300/40'}>
          {providerLabel}
        </span>
        {account && (
          <span className={isActive ? 'text-gray-300' : 'text-gray-500/40'}>
            {account.displayName ?? account.username}
          </span>
        )}
      </div>
      {repo.description && (
        <p
          className={`text-xs line-clamp-2 ${isActive ? 'text-gray-300' : 'text-gray-400/40'}`}
        >
          {repo.description}
        </p>
      )}
      <div className="flex items-center justify-between text-xs mt-2">
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
    </div>
  )
}
