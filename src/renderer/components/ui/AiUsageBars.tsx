import { useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  useRole,
  useDismiss,
  useInteractions,
  FloatingPortal,
  hide,
} from '@floating-ui/react'
import { Bot, Code, Sparkles } from 'lucide-react'
import { useAtomValue, Result } from '@effect-atom/atom-react'
import { useAiProviderUsage } from '../../hooks/useAiProviderAtoms'
import { tierLimitsAtom } from '../../atoms/account-atoms'
import type {
  AiProviderType,
  AiUsageSnapshot,
} from '../../../shared/schemas/ai/provider'
import type {
  AiAuthenticationError,
  AiProviderUnavailableError,
  AiFeatureUnavailableError,
  AiUsageUnavailableError,
} from '../../../shared/schemas/ai/errors'
import type { NetworkError } from '../../../shared/schemas/errors'

type UsageError =
  | AiAuthenticationError
  | AiProviderUnavailableError
  | AiFeatureUnavailableError
  | AiUsageUnavailableError
  | NetworkError

interface ToolUsageBarProps {
  toolName: string
  usagePercentage: number
  used: number
  limit?: number
  unit?: string
  provider: AiProviderType
}

const getProviderIcon = (provider: AiProviderType) => {
  switch (provider) {
    case 'cursor':
      return Code
    case 'claude':
      return Bot
    case 'openai':
      return Sparkles
    default:
      return Bot
  }
}

const getProviderColor = (provider: AiProviderType) => {
  switch (provider) {
    case 'cursor':
      return '#00ffff'
    case 'claude':
      return '#ff6b35'
    case 'openai':
      return '#10a37f'
    default:
      return '#6b7280'
  }
}

const getProviderGradient = (provider: AiProviderType) => {
  const color = getProviderColor(provider)
  return {
    from: `${color}20`,
    to: `${color}40`,
    glow: `${color}60`,
  }
}

function ToolUsageBar({
  toolName,
  usagePercentage,
  used,
  limit,
  unit,
  provider,
}: ToolUsageBarProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const shouldReduceMotion = useReducedMotion()

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement: 'right-start',
    middleware: [offset(12), flip(), shift({ padding: 8 }), hide()],
    whileElementsMounted: autoUpdate,
    strategy: 'fixed',
  })

  const role = useRole(context)
  const dismiss = useDismiss(context)
  const { getReferenceProps, getFloatingProps } = useInteractions([
    role,
    dismiss,
  ])

  const color = getProviderColor(provider)
  const gradient = getProviderGradient(provider)
  const Icon = getProviderIcon(provider)
  const clampedPercentage = Math.min(usagePercentage, 100)

  const formatValue = (value: number, unit?: string) => {
    if (unit) {
      return `${value} ${unit}`
    }
    return value.toString()
  }

  const limitText = limit ? ` / ${formatValue(limit, unit)}` : ''
  const displayText = `${formatValue(used, unit)}${limitText}`

  const animationConfig = shouldReduceMotion
    ? {
        duration: 0.2,
        ease: [0.16, 1, 0.3, 1] as const,
      }
    : {
        duration: 0.3,
        ease: [0.16, 1, 0.3, 1] as const,
      }

  return (
    <>
      <button
        className="group relative cursor-pointer"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={() => setIsOpen(!isOpen)}
        ref={refs.setReference}
        type="button"
        {...getReferenceProps()}
      >
        {/* Main bar container - minimal height */}
        <div className="relative h-4 w-32 overflow-hidden rounded border border-gray-600/30 bg-gradient-to-r from-gray-800/50 to-gray-700/50 backdrop-blur-sm">
          {/* Background glow */}
          <div
            className="absolute inset-0 rounded opacity-0 transition-opacity duration-300"
            style={{
              background: `linear-gradient(90deg, ${gradient.from} 0%, ${gradient.to} 100%)`,
              opacity: isHovered ? 0.3 : 0.1,
            }}
          />

          {/* Usage fill */}
          <motion.div
            animate={{ width: `${clampedPercentage}%` }}
            className="relative h-full rounded"
            initial={{ width: 0 }}
            style={{
              background: `linear-gradient(90deg, ${color}40 0%, ${color}80 100%)`,
              boxShadow: `inset 0 1px 0 ${color}60, 0 0 8px ${color}30`,
            }}
            transition={animationConfig}
          >
            {/* Animated shimmer effect */}
            <motion.div
              animate={{
                x: ['-100%', '100%'],
              }}
              className="absolute inset-0 rounded"
              style={{
                background: `linear-gradient(90deg, transparent 0%, ${color}60 50%, transparent 100%)`,
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: 'linear',
              }}
            />
          </motion.div>

          {/* Border highlight */}
          <div
            className="absolute inset-0 rounded border border-gray-500/20"
            style={{
              boxShadow: isHovered
                ? `inset 0 0 0 1px ${color}40, 0 0 12px ${color}20`
                : `inset 0 0 0 1px ${color}20`,
            }}
          />

          {/* Provider icon */}
          <div className="absolute left-1.5 top-1/2 -translate-y-1/2">
            <Icon
              className="text-gray-200/90"
              size={10}
              style={{ color: isHovered ? color : undefined }}
            />
          </div>

          {/* Percentage display in bar */}
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-gray-200/90">
            {clampedPercentage.toFixed(0)}%
          </div>
        </div>

        {/* Hover tooltip */}
        <AnimatePresence>
          {isHovered && (
            <motion.div
              animate={{ opacity: 1, x: 0 }}
              className="absolute left-full top-1/2 -translate-y-1/2 ml-2 whitespace-nowrap rounded-md bg-gray-900/95 px-2 py-1 text-xs text-gray-200 backdrop-blur-sm"
              exit={{ opacity: 0, x: -4 }}
              initial={{ opacity: 0, x: -4 }}
              style={{
                boxShadow: `0 4px 12px rgba(0, 0, 0, 0.3), 0 0 0 1px ${color}30`,
              }}
              transition={{ duration: 0.15 }}
            >
              <div>{toolName}</div>
              <div className="text-[10px] text-gray-400">(Click to expand)</div>
            </motion.div>
          )}
        </AnimatePresence>
      </button>

      {/* Detailed popover - from commit b99 */}
      <FloatingPortal>
        <AnimatePresence>
          {isOpen && (
            <div
              ref={refs.setFloating}
              style={floatingStyles}
              {...getFloatingProps()}
              className="z-[9999] pointer-events-auto"
            >
              <motion.div
                animate={{ opacity: 1, scale: 1 }}
                className="min-w-[220px] rounded-lg border border-gray-600/50 bg-gradient-to-b from-gray-800/95 to-gray-900/95 backdrop-blur-xl shadow-2xl"
                exit={{ opacity: 0, scale: 0.95 }}
                initial={{ opacity: 0, scale: 0.95 }}
                style={{
                  boxShadow: `0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px ${color}20`,
                }}
                transition={animationConfig}
              >
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Icon size={18} style={{ color }} />
                    <span className="font-semibold text-base text-gray-100">
                      {toolName}
                    </span>
                  </div>
                  <div className="space-y-2 text-sm text-gray-300">
                    <div className="flex justify-between">
                      <span>Usage:</span>
                      <span className="font-medium">{displayText}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Percentage:</span>
                      <span
                        className="font-semibold text-base"
                        style={{ color }}
                      >
                        {clampedPercentage.toFixed(1)}%
                      </span>
                    </div>
                    {limit && (
                      <div className="flex justify-between">
                        <span>Remaining:</span>
                        <span className="font-medium">
                          {formatValue(limit - used, unit)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </FloatingPortal>
    </>
  )
}

interface UsageBarProps {
  provider: AiProviderType
  isEnabled: boolean
}

function ProviderUsageBars({ provider, isEnabled }: UsageBarProps) {
  const { usageResult } = useAiProviderUsage(provider, { enabled: isEnabled })
  const Icon = getProviderIcon(provider)
  const color = getProviderColor(provider)

  const usageContent = Result.builder(
    usageResult as Result.Result<readonly AiUsageSnapshot[], UsageError>
  )
    .onInitial(() => null)
    .onErrorTag('AiAuthenticationError', () => null)
    .onErrorTag('AiProviderUnavailableError', () => null)
    .onErrorTag('AiUsageUnavailableError', () => null)
    .onErrorTag('NetworkError', () => null)
    .onDefect(() => null)
    .onSuccess((data: readonly AiUsageSnapshot[]) => {
      if (data.length === 0) return null

      // Get the most recent snapshot for each account
      const latestSnapshots = data.reduce((acc, snapshot) => {
        const existing = acc.find(s => s.accountId === snapshot.accountId)
        if (!existing || snapshot.capturedAt > existing.capturedAt) {
          acc = acc.filter(s => s.accountId !== snapshot.accountId)
          acc.push(snapshot)
        }
        return acc
      }, [] as AiUsageSnapshot[])

      // Get all unique tools across all accounts
      const allTools = latestSnapshots.flatMap(snapshot =>
        snapshot.metrics.map(metric => ({
          ...metric,
          accountId: snapshot.accountId,
        }))
      )

      if (allTools.length === 0) return null

      return (
        <div className="flex flex-col space-y-1">
          {allTools.map((metric, index) => (
            <ToolUsageBar
              key={`${metric.toolId}-${index}`}
              limit={metric.limit}
              provider={provider}
              toolName={metric.toolName}
              unit={metric.unit}
              usagePercentage={metric.usagePercentage}
              used={metric.used}
            />
          ))}
        </div>
      )
    })
    .render()

  if (!usageContent) return null

  return (
    <div className="isolate">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={16} style={{ color }} />
        <span className="text-sm font-semibold text-white/90 capitalize">
          {provider}
        </span>
      </div>
      {usageContent}
    </div>
  )
}

export function AiUsageBars() {
  const tierLimitsResult = useAtomValue(tierLimitsAtom)
  const aiProvidersEnabled = Result.match(tierLimitsResult, {
    onSuccess: ({ value }) => value.enableAiProviders,
    onInitial: () => false,
    onFailure: () => false,
  })

  const { usageResult: cursorUsage } = useAiProviderUsage('cursor', {
    enabled: aiProvidersEnabled,
  })
  const { usageResult: claudeUsage } = useAiProviderUsage('claude', {
    enabled: aiProvidersEnabled,
  })
  const { usageResult: openaiUsage } = useAiProviderUsage('openai', {
    enabled: aiProvidersEnabled,
  })

  const hasCursorData = Result.match(cursorUsage, {
    onSuccess: data => data.value.length > 0,
    onInitial: () => false,
    onFailure: () => false,
  })

  const hasClaudeData = Result.match(claudeUsage, {
    onSuccess: data => data.value.length > 0,
    onInitial: () => false,
    onFailure: () => false,
  })

  const hasOpenaiData = Result.match(openaiUsage, {
    onSuccess: data => data.value.length > 0,
    onInitial: () => false,
    onFailure: () => false,
  })

  if (
    !aiProvidersEnabled ||
    (!hasCursorData && !hasClaudeData && !hasOpenaiData)
  ) {
    return null
  }

  return (
    <div className="absolute top-48 left-8 z-10 space-y-4">
      {hasCursorData && (
        <ProviderUsageBars isEnabled={aiProvidersEnabled} provider="cursor" />
      )}

      {hasClaudeData && (
        <ProviderUsageBars isEnabled={aiProvidersEnabled} provider="claude" />
      )}

      {hasOpenaiData && (
        <ProviderUsageBars isEnabled={aiProvidersEnabled} provider="openai" />
      )}
    </div>
  )
}
