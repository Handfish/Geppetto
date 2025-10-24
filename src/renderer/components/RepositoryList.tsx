import React from 'react'
import { Result } from '@effect-atom/atom-react'
import {
  useProviderAuth,
  useProviderRepositories,
} from '../hooks/useProviderAtoms'
import { ErrorAlert, LoadingSpinner } from './ui/ErrorAlert'

export function RepositoryList() {
  const { accountsResult } = useProviderAuth('github')
  const { repositoriesResult } = useProviderRepositories('github')

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-white">
        Your Connected Repositories
      </h2>

      {Result.builder(repositoriesResult)
        .onInitial(() => <LoadingSpinner size="md" />)
        .onErrorTag('AuthenticationError', error => (
          <ErrorAlert error={error} message="Please authenticate first" />
        ))
        .onErrorTag('NetworkError', error => (
          <ErrorAlert error={error} />
        ))
        .onErrorTag('ProviderOperationError', error => (
          <ErrorAlert error={error} />
        ))
        .onDefect(defect => (
          <ErrorAlert message={String(defect)} />
        ))
        .onSuccess(groups => {
          if (groups.length === 0) {
            return <div className="text-gray-400">No repositories found</div>
          }

          // Get accounts list to show account display names
          const accounts = Result.getOrElse(accountsResult, () => [])

          return (
            <div className="space-y-6">
              {groups.map(group => {
                const account =
                  accounts.find(acc => acc.id === group.accountId) ?? null
                return (
                  <div className="space-y-3" key={group.accountId}>
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-white">
                          {account?.displayName ??
                            account?.username ??
                            group.accountId}
                        </h3>
                        <p className="text-sm text-gray-400">
                          {group.provider.toUpperCase()}
                        </p>
                      </div>
                      <span className="text-sm text-gray-500">
                        {group.repositories.length} repositories
                      </span>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {group.repositories.map(repo => (
                        <div
                          className="bg-gray-800 rounded-lg p-4 border border-gray-700 hover:border-gray-600 transition-colors"
                          key={repo.repositoryId}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h4 className="font-medium text-white truncate">
                                {repo.name}
                              </h4>
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
                              <span className="flex items-center">
                                ⭐ {repo.stars}
                              </span>
                            </div>

                            <a
                              className="text-blue-400 hover:text-blue-300"
                              href={repo.webUrl}
                              rel="noopener noreferrer"
                              target="_blank"
                            >
                              View →
                            </a>
                          </div>
                        </div>
                      ))}
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
