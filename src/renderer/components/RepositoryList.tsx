import React from 'react'
import { Result } from '@effect-atom/atom-react'
import {
  useProviderAuth,
  useProviderRepositories,
} from '../hooks/useProviderAtoms'
import { ErrorAlert, LoadingSpinner } from './ui/ErrorAlert'
import { RepositoryActionsMenu } from './RepositoryActionsMenu'
import type { ProviderRepository } from '../../shared/schemas/provider'

function RepositoryListContent() {
  const { accountsResult, signIn } = useProviderAuth('github')
  const { repositoriesResult } = useProviderRepositories('github')
  const [openMenuRepoId, setOpenMenuRepoId] = React.useState<string | null>(null)
  const buttonRefs = React.useRef<Record<string, React.RefObject<HTMLButtonElement | null>>>({})

  const getButtonRef = (repoId: string): React.RefObject<HTMLButtonElement | null> => {
    if (!buttonRefs.current[repoId]) {
      buttonRefs.current[repoId] = React.createRef<HTMLButtonElement>()
    }
    return buttonRefs.current[repoId]
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-white">
        Your Connected Repositories
      </h2>

      {Result.builder(repositoriesResult)
        .onInitial(() => <LoadingSpinner size="md" />)
        .onErrorTag('AuthenticationError', error => (
          <ErrorAlert
            error={error}
            message="Your credentials have expired. Please re-authenticate to continue."
            action={
              <button
                onClick={() => signIn()}
                type="button"
                className="px-4 py-2 border border-red-400 rounded-md text-red-100 hover:bg-red-500/20 transition-colors"
              >
                Re-authenticate
              </button>
            }
          />
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
                      {group.repositories.map(repo => {
                        const buttonRef = getButtonRef(repo.repositoryId)
                        return (
                          <div
                            className="bg-gray-800 rounded-lg p-4 border border-gray-700 hover:border-gray-600 transition-colors relative"
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
                              <button
                                ref={buttonRef}
                                onClick={() => setOpenMenuRepoId(repo.repositoryId)}
                                onKeyDown={(e) => {
                                  if (e.key === ' ' || e.key === 'Enter') {
                                    e.preventDefault()
                                    setOpenMenuRepoId(repo.repositoryId)
                                  }
                                }}
                                className="ml-2 text-gray-400 hover:text-white p-1 rounded transition-colors"
                                type="button"
                                aria-label="Repository actions"
                              >
                                ⋮
                              </button>
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
                            </div>

                            <RepositoryActionsMenu
                              repository={repo}
                              isOpen={openMenuRepoId === repo.repositoryId}
                              onClose={() => setOpenMenuRepoId(null)}
                              buttonRef={buttonRef}
                            />
                          </div>
                        )
                      })}
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

export function RepositoryList() {
  const [shouldLoad, setShouldLoad] = React.useState(false)

  if (!shouldLoad) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-white">
          Your Connected Repositories
        </h2>
        <div className="bg-gray-800 rounded-lg p-8 border border-gray-700 text-center">
          <p className="text-gray-300 mb-4">
            Ready to load your repositories
          </p>
          <button
            onClick={() => setShouldLoad(true)}
            type="button"
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Load Repositories
          </button>
        </div>
      </div>
    )
  }

  return <RepositoryListContent />
}
