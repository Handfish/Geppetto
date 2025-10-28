import React from 'react'
import { Result } from '@effect-atom/atom-react'
import { useProviderAuth } from '../hooks/useProviderAtoms'
import { ErrorAlert, LoadingSpinner } from './ui/ErrorAlert'

export function AuthCard() {
  const { accountsResult, isAuthenticated, signIn, signOut, isSigningIn, isLoading } =
    useProviderAuth('github')

  // Show authenticated view if we have accounts
  if (isAuthenticated) {
    const accounts = Result.getOrElse(accountsResult, () => [])
    const primaryAccount = accounts[0] ?? null

    return (
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            {primaryAccount?.avatarUrl ? (
              <img
                alt={primaryAccount.username}
                className="w-12 h-12 rounded-full"
                src={primaryAccount.avatarUrl}
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center text-gray-300">
                {primaryAccount?.username.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <h3 className="text-white font-medium">
                {primaryAccount?.displayName ??
                  primaryAccount?.username ??
                  'Connected Account'}
              </h3>
              <p className="text-gray-400 text-sm">GitHub</p>
            </div>
            {primaryAccount && (
              <button
                className="ml-auto px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                onClick={() => signOut(primaryAccount.id)}
              >
                Sign Out
              </button>
            )}
          </div>

          {accounts.length > 1 && (
            <div className="border-t border-gray-700 pt-4">
              <p className="text-gray-400 text-sm mb-2">Connected accounts</p>
              <div className="space-y-2">
                {accounts.map(account => (
                  <div
                    className="flex items-center justify-between text-sm text-gray-300 bg-gray-900/40 border border-gray-700/40 rounded-md px-3 py-2"
                    key={account.id}
                  >
                    <span>{account.displayName ?? account.username}</span>
                    <button
                      className="text-red-400 hover:text-red-300"
                      onClick={() => signOut(account.id)}
                    >
                      Disconnect
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Show unauthenticated view
  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 text-center">
      <h2 className="text-xl font-semibold text-white mb-4">
        Git Provider Integration
      </h2>
      <p className="text-gray-300 mb-6">
        Connect your repository providers to access projects across accounts.
      </p>
      <button
        className="px-6 py-2 bg-gray-900 text-white rounded-md border border-gray-600 hover:bg-gray-700 transition-colors disabled:opacity-50"
        disabled={isSigningIn || isLoading}
        onClick={() => signIn()}
      >
        {isSigningIn || isLoading ? 'Connecting...' : 'Connect GitHub'}
      </button>
    </div>
  )
}
