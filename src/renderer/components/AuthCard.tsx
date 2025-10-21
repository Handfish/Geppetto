import React from 'react'
import { Result } from '@effect-atom/atom-react'
import { Option } from 'effect'
import { useGitHubAuth } from '../hooks/useGitHubAtoms'

export function AuthCard() {
  const { isAuthenticated, currentUser, signIn, signOut, isSigningIn } =
    useGitHubAuth()

  if (isAuthenticated) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <div className="flex items-center space-x-4">
          {Option.isSome(currentUser) && (
            <>
              <img
                alt={currentUser.value.login}
                className="w-12 h-12 rounded-full"
                src={currentUser.value.avatar_url}
              />
              <div>
                <h3 className="text-white font-medium">
                  {currentUser.value.name || currentUser.value.login}
                </h3>
                <p className="text-gray-400">@{currentUser.value.login}</p>
              </div>
            </>
          )}
          <button
            className="ml-auto px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
            onClick={signOut}
          >
            Sign Out
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 text-center">
      <h2 className="text-xl font-semibold text-white mb-4">
        GitHub Integration
      </h2>
      <p className="text-gray-300 mb-6">
        Connect your GitHub account to access repositories and issues.
      </p>
      <button
        className="px-6 py-2 bg-gray-900 text-white rounded-md border border-gray-600 hover:bg-gray-700 transition-colors disabled:opacity-50"
        disabled={isSigningIn}
        onClick={signIn}
      >
        {isSigningIn ? 'Connecting...' : 'Connect GitHub'}
      </button>
    </div>
  )
}
