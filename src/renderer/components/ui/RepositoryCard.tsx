import type { GitHubRepository } from '../../../shared/schemas'

interface RepositoryCardProps {
  repo: GitHubRepository
  isActive?: boolean
}

export function RepositoryCard({
  repo,
  isActive = false,
}: RepositoryCardProps) {
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
          {repo.stargazers_count} ★
        </span>
      </div>
    </div>
  )
}
