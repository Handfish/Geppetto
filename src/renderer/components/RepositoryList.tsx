import React from 'react'
import { Result } from '@effect-atom/atom-react'
import { useUserRepos } from '../hooks/useGitHubAtoms'

export function RepositoryList() {
  const { repos, isLoading } = useUserRepos()

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-white">Your Repositories</h2>

      {Result.builder(repos)
        .onInitial(() => <div className="text-gray-400">Loading repositories...</div>)
        .onErrorTag('AuthenticationError', () => (
          <div className="text-red-400">Please authenticate first</div>
        ))
        .onErrorTag('NetworkError', (error) => (
          <div className="text-red-400">Network error: {error.message}</div>
        ))
        .onDefect(() => <div className="text-red-400">Unexpected error occurred</div>)
        .onSuccess((repositories) => {
          if (repositories.length === 0) {
            return <div className="text-gray-400">No repositories found</div>
          }

          return (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {repositories.map((repo) => (
                <div
                  key={repo.id}
                  className="bg-gray-800 rounded-lg p-4 border border-gray-700 hover:border-gray-600 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-medium text-white truncate">{repo.name}</h3>
                      {repo.description && (
                        <p className="text-sm text-gray-400 mt-1 line-clamp-2">
                          {repo.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-4 text-sm text-gray-400">
                    <div className="flex items-center space-x-4">
                      {repo.language && (
                        <span className="flex items-center">
                          <span className="w-3 h-3 rounded-full bg-blue-500 mr-2"></span>
                          {repo.language}
                        </span>
                      )}
                      <span className="flex items-center">⭐ {repo.stargazers_count}</span>
                    </div>

                    <a
                      href={repo.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300"
                    >
                      View →
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )
        })
        .render()}
    </div>
  )
}

