import React from 'react'
import { Result, useAtomValue } from '@effect-atom/atom-react'
import { useAiProviderAuth } from '../hooks/useAiProviderAtoms'
import type {
  AiProviderType,
  AiUsageSnapshot,
} from '../../shared/schemas/ai/provider'
import type {
  AiAuthenticationError,
  AiProviderUnavailableError,
  AiFeatureUnavailableError,
  AiUsageUnavailableError,
} from '../../shared/schemas/ai/errors'
import type {
  AuthenticationError,
  NetworkError,
} from '../../shared/schemas/errors'
import { tierLimitsAtom } from '../atoms/account-atoms'
import { Alert, AlertDescription, AlertTitle } from './ui/alert'
import {
  showProFeatureLockedToast,
  DEFAULT_PRO_FEATURE_MESSAGE,
} from '../lib/toast'

type UsageError =
  | AiAuthenticationError
  | AiProviderUnavailableError
  | AiFeatureUnavailableError
  | AiUsageUnavailableError
  | NetworkError

type SignInError =
  | AuthenticationError
  | NetworkError
  | AiAuthenticationError
  | AiFeatureUnavailableError
  | AiProviderUnavailableError

const BAR_SEGMENTS = 20

const clampPercent = (value: number) => Math.max(0, Math.min(100, value))

const renderUsageBar = (percent: number) => {
  const clamped = clampPercent(percent)
  const filledSegments = Math.round((clamped / 100) * BAR_SEGMENTS)
  return `[${'#'.repeat(filledSegments).padEnd(BAR_SEGMENTS, '-')}]`
}

const formatPercent = (value: number) =>
  clampPercent(value).toFixed(1).replace(/\.0$/, '')

type ProviderCopy = {
  title: string
  description: string
  connectDescription: string
  connectCta: string
  noAccountsMessage: string
  authenticationFallback: string
  providerUnavailableFallback: string
  usageUnavailableFallback: string
  usageConsoleLabel: string
  providerDisplayName: string
}

const PROVIDER_COPY: Record<AiProviderType, ProviderCopy> = {
  openai: {
    title: 'OpenAI CLI Usage',
    description:
      'Track how the pro-tier CLI tools are consuming your OpenAI quota.',
    connectDescription:
      'Connect OpenAI to start monitoring usage. Pro tier is required.',
    connectCta: 'Connect OpenAI',
    noAccountsMessage: 'No OpenAI accounts connected yet.',
    authenticationFallback: 'Authentication required to fetch OpenAI usage.',
    providerUnavailableFallback: 'OpenAI provider is currently unavailable.',
    usageUnavailableFallback: 'Unable to fetch OpenAI usage right now.',
    usageConsoleLabel: 'OpenAI Usage',
    providerDisplayName: 'OpenAI',
  },
  claude: {
    title: 'Claude CLI Usage',
    description:
      'Monitor Claude Code activity and track how the pro-tier CLI tools use Claude credits.',
    connectDescription:
      'Connect Claude to sync usage from Claude Code. Pro tier is required.',
    connectCta: 'Connect Claude',
    noAccountsMessage: 'No Claude accounts connected yet.',
    authenticationFallback: 'Authentication required to fetch Claude usage.',
    providerUnavailableFallback: 'Claude provider is currently unavailable.',
    usageUnavailableFallback: 'Unable to fetch Claude usage right now.',
    usageConsoleLabel: 'Claude Usage',
    providerDisplayName: 'Claude',
  },
}

type ProviderUsageSectionProps = {
  provider: AiProviderType
  enabled: boolean
}

function ProviderUsageSection({
  provider,
  enabled,
}: ProviderUsageSectionProps) {
  const copy = PROVIDER_COPY[provider]
  const [featureLockMessage, setFeatureLockMessage] =
    React.useState<string | null>(null)
  const signInFeatureToastShownRef = React.useRef(false)
  const usageFeatureToastShownRef = React.useRef(false)

  const {
    signIn,
    signOut,
    signInResult,
    usageResult,
    isAuthenticated,
    refreshUsage,
  } = useAiProviderAuth(provider, { loadUsage: enabled })

  // Refresh usage after successful sign-in to update with new account
  React.useEffect(() => {
    if (enabled && signInResult._tag === 'Success') {
      refreshUsage()
    }
  }, [enabled, refreshUsage, signInResult])

  React.useEffect(() => {
    if (enabled) {
      setFeatureLockMessage(null)
      signInFeatureToastShownRef.current = false
      usageFeatureToastShownRef.current = false
    }
  }, [enabled])

  React.useEffect(() => {
    if (signInResult.waiting) {
      signInFeatureToastShownRef.current = false
      return
    }

    if (
      Result.isFailure(signInResult) &&
      signInResult.error._tag === 'AiFeatureUnavailableError'
    ) {
      const message = signInResult.error.message ?? DEFAULT_PRO_FEATURE_MESSAGE
      setFeatureLockMessage(message)
      signInFeatureToastShownRef.current = true
    }
  }, [signInResult])

  React.useEffect(() => {
    if (usageResult.waiting) {
      usageFeatureToastShownRef.current = false
      return
    }

    if (
      usageResult._tag === 'Failure' &&
      usageResult.error._tag === 'AiFeatureUnavailableError'
    ) {
      const message = usageResult.error.message ?? DEFAULT_PRO_FEATURE_MESSAGE
      setFeatureLockMessage(message)

      if (
        !signInFeatureToastShownRef.current &&
        !usageFeatureToastShownRef.current
      ) {
        showProFeatureLockedToast(message)
        usageFeatureToastShownRef.current = true
      }
    }
  }, [usageResult])

  const lastLoggedUsageRef = React.useRef<string | null>(null)

  React.useEffect(() => {
    if (usageResult._tag !== 'Success') {
      return
    }

    const snapshots = usageResult.value ?? []
    const key = JSON.stringify(
      snapshots.map(snapshot => ({
        accountId: snapshot.accountId,
        capturedAt: snapshot.capturedAt,
        metrics: snapshot.metrics.map(metric => ({
          id: metric.toolId,
          used: metric.used,
          limit: metric.limit,
          percentage: metric.usagePercentage,
        })),
      }))
    )

    if (key === lastLoggedUsageRef.current) {
      return
    }
    lastLoggedUsageRef.current = key

    const consoleLabel = PROVIDER_COPY[provider].usageConsoleLabel

    snapshots.forEach(snapshot => {
      console.group(`[${consoleLabel}] ${snapshot.accountId}`)
      snapshot.metrics.forEach(metric => {
        const percentUsed = clampPercent(metric.usagePercentage)
        const bar = renderUsageBar(percentUsed)
        const limitLabel =
          metric.limit != null
            ? ` (${metric.used}${metric.unit ? ` ${metric.unit}` : ''} / ${metric.limit}${metric.unit ? ` ${metric.unit}` : ''})`
            : metric.unit
              ? ` (${metric.used} ${metric.unit})`
              : ''

        console.log(
          `${metric.toolName}: ${bar} ${formatPercent(percentUsed)}% used${limitLabel}`
        )
      })
      console.groupEnd()
    })
  }, [provider, usageResult])

  const usageContent = Result.builder(
    usageResult as Result.Result<readonly AiUsageSnapshot[], UsageError>
  )
    .onInitial(() =>
      usageResult.waiting ? (
        <div className="text-gray-400 text-sm">Loading usage…</div>
      ) : null
    )
    .onErrorTag('AiAuthenticationError', error => (
      <div className="text-red-400 text-sm">
        {error.message ?? copy.authenticationFallback}
      </div>
    ))
    .onErrorTag('AiProviderUnavailableError', error => (
      <div className="text-red-400 text-sm">
        {error.message ?? copy.providerUnavailableFallback}
      </div>
    ))
    .onErrorTag('AiUsageUnavailableError', error => (
      <div className="text-red-400 text-sm">
        {error.message ?? copy.usageUnavailableFallback}
      </div>
    ))
    .onErrorTag('NetworkError', error => (
      <div className="text-red-400 text-sm">Network error: {error.message}</div>
    ))
    .onDefect(defect => (
      <div className="text-red-400 text-sm">
        Unexpected error: {String(defect)}
      </div>
    ))
    .onSuccess((snapshots: readonly AiUsageSnapshot[]) => {
      if (snapshots.length === 0) {
        return (
          <div className="text-gray-400 text-sm">
            {copy.noAccountsMessage}
          </div>
        )
      }

      return (
        <div className="space-y-6">
          {snapshots.map(snapshot => (
            <div className="space-y-4" key={snapshot.accountId}>
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
                {snapshot.metrics.map(metric => (
                  <div className="space-y-2" key={metric.toolId}>
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
                        style={{
                          width: `${Math.min(metric.usagePercentage, 100)}%`,
                        }}
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

  const signInErrorContent = Result.builder(
    signInResult as Result.Result<unknown, SignInError>
  )
    .onInitial(() => null)
    .onSuccess(() => null)
    .onErrorTag('AuthenticationError', error => (
      <p className="text-red-400 text-sm">
        {error.message ?? `Unable to connect to ${copy.providerDisplayName}.`}
      </p>
    ))
    .onErrorTag('NetworkError', error => (
      <p className="text-red-400 text-sm">Network error: {error.message}</p>
    ))
    .onErrorTag('AiAuthenticationError', error => (
      <p className="text-red-400 text-sm">{error.message}</p>
    ))
    .onErrorTag('AiProviderUnavailableError', error => (
      <p className="text-red-400 text-sm">{error.message}</p>
    ))
    .render()

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-lg font-semibold text-white">{copy.title}</h3>
        <p className="text-gray-400 text-sm">{copy.description}</p>
      </div>

      {!isAuthenticated && (
        <div className="flex flex-col gap-3">
          <p className="text-gray-300 text-sm">{copy.connectDescription}</p>
          <button
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-500 transition-colors disabled:opacity-50"
            disabled={signInResult.waiting}
            onClick={() => signIn()}
          >
            {signInResult.waiting ? 'Connecting…' : copy.connectCta}
          </button>
          {signInErrorContent}
        </div>
      )}

      {featureLockMessage && (
        <Alert className="bg-gray-950/85 border border-yellow-500/70 text-yellow-200 shadow-lg">
          <AlertTitle className="text-lg font-semibold uppercase tracking-wide text-yellow-300">
            Pro feature locked
          </AlertTitle>
          <AlertDescription className="text-sm text-yellow-100/85">
            {featureLockMessage}
          </AlertDescription>
        </Alert>
      )}

      {usageContent}
    </div>
  )
}

export function AiUsageCard() {
  const tierLimitsResult = useAtomValue(tierLimitsAtom)
  const aiProvidersEnabled = Result.match(tierLimitsResult, {
    onSuccess: ({ value }) => value.enableAiProviders,
    onInitial: () => false,
    onFailure: () => false,
  })

  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <div className="flex flex-col gap-8">
        <div>
          <h2 className="text-xl font-semibold text-white">AI CLI Usage</h2>
          <p className="text-gray-400 text-sm">
            Track how pro-tier CLI tools consume your quotas across OpenAI and Claude.
          </p>
        </div>

        <ProviderUsageSection provider="openai" enabled={aiProvidersEnabled} />

        <div className="border-t border-gray-700 pt-6">
          <ProviderUsageSection provider="claude" enabled={aiProvidersEnabled} />
        </div>
      </div>
    </div>
  )
}
