import React from 'react'
import { Result } from '@effect-atom/atom-react'
import { useAiProviderAuth } from '../hooks/useAiProviderAtoms'
import type { AiUsageSnapshot } from '../../shared/schemas/ai/provider'
import {
  AiAuthenticationError,
  AiProviderUnavailableError,
  AiUsageUnavailableError,
} from '../../shared/schemas/ai/errors'
import { AuthenticationError, NetworkError } from '../../shared/schemas/errors'

type UsageError =
  | AiAuthenticationError
  | AiProviderUnavailableError
  | AiUsageUnavailableError
  | NetworkError

type SignInError =
  | AuthenticationError
  | NetworkError
  | AiAuthenticationError
  | AiProviderUnavailableError

export function AiUsageCard() {
  const { signIn, signOut, signInResult, usageResult, isAuthenticated, refreshUsage } =
    useAiProviderAuth('openai')

  React.useEffect(() => {
    if (signInResult._tag === 'Success') {
      refreshUsage()
    }
  }, [refreshUsage, signInResult])

  const usageContent = Result.builder(
    usageResult as Result.Result<readonly AiUsageSnapshot[], UsageError>
  )
    .onInitial(() =>
      usageResult.waiting ? <div className="text-gray-400 text-sm">Loading usage…</div> : null
    )
    .onErrorTag('AiAuthenticationError', (error) => (
      <div className="text-red-400 text-sm">
        {error.message ?? 'Authentication required to fetch OpenAI usage.'}
      </div>
    ))
    .onErrorTag('AiProviderUnavailableError', (error) => (
      <div className="text-red-400 text-sm">
        {error.message ?? 'OpenAI provider is currently unavailable.'}
      </div>
    ))
    .onErrorTag('AiUsageUnavailableError', (error) => (
      <div className="text-red-400 text-sm">
        {error.message ?? 'Unable to fetch OpenAI usage right now.'}
      </div>
    ))
    .onErrorTag('NetworkError', (error) => (
      <div className="text-red-400 text-sm">Network error: {error.message}</div>
    ))
    .onDefect((defect) => (
      <div className="text-red-400 text-sm">Unexpected error: {String(defect)}</div>
    ))
    .onSuccess((snapshots: readonly AiUsageSnapshot[]) => {
      if (snapshots.length === 0) {
        return <div className="text-gray-400 text-sm">No OpenAI accounts connected yet.</div>
      }

      return (
        <div className="space-y-6">
          {snapshots.map((snapshot) => (
            <div key={snapshot.accountId} className="space-y-4">
              <div className="flex items-center justify-between text-sm text-gray-400">
                <span>Account: {snapshot.accountId}</span>
                <div className="flex items-center gap-3">
                  <span>{new Date(snapshot.capturedAt).toLocaleString()}</span>
                  <button
                    className="px-3 py-1 text-xs bg-gray-700 text-gray-200 rounded hover:bg-gray-600 transition-colors"
                    onClick={() => signOut(snapshot.accountId)}
                  >
                    Disconnect
                  </button>
                </div>
              </div>
              <div className="space-y-3">
                {snapshot.metrics.map((metric) => (
                  <div key={metric.toolId} className="space-y-2">
                    <div className="flex items-center justify-between text-sm text-gray-300">
                      <span>{metric.toolName}</span>
                      <span>
                        {metric.used}
                        {metric.unit ? ` ${metric.unit}` : ''}
                        {metric.limit
                          ? ` / ${metric.limit}${metric.unit ? ` ${metric.unit}` : ''}`
                          : ''}
                      </span>
                    </div>
                    <div className="h-2 bg-gray-700 rounded">
                      <div
                        className="h-2 bg-indigo-500 rounded"
                        style={{ width: `${Math.min(metric.usagePercentage, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )
    })
    .render()

  const signInErrorContent = Result.builder(signInResult as Result.Result<unknown, SignInError>)
    .onInitial(() => null)
    .onSuccess(() => null)
    .onErrorTag('AuthenticationError', (error) => (
      <p className="text-red-400 text-sm">
        {error.message ?? 'Unable to connect to OpenAI.'}
      </p>
    ))
    .onErrorTag('NetworkError', (error) => (
      <p className="text-red-400 text-sm">Network error: {error.message}</p>
    ))
    .onErrorTag('AiAuthenticationError', (error) => (
      <p className="text-red-400 text-sm">{error.message}</p>
    ))
    .onErrorTag('AiProviderUnavailableError', (error) => (
      <p className="text-red-400 text-sm">{error.message}</p>
    ))
    .render()

  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">OpenAI CLI Usage</h2>
          <p className="text-gray-400 text-sm">
            Track how the pro-tier CLI tools are consuming your OpenAI quota.
          </p>
        </div>

        {!isAuthenticated && (
          <div className="flex flex-col gap-3">
            <p className="text-gray-300 text-sm">
              Connect OpenAI to start monitoring usage. Pro tier is required.
            </p>
            <button
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-500 transition-colors disabled:opacity-50"
              disabled={signInResult.waiting}
              onClick={() => signIn()}
            >
              {signInResult.waiting ? 'Connecting…' : 'Connect OpenAI'}
            </button>
            {signInErrorContent}
          </div>
        )}

        {usageContent}
      </div>
    </div>
  )
}
