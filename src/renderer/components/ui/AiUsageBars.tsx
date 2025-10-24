import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  useFloating,
  offset,
  flip,
  shift,
  useRole,
  useDismiss,
  useInteractions,
  FloatingPortal,
  FloatingFocusManager,
} from '@floating-ui/react'
import { Bot, Code, Sparkles } from 'lucide-react'
import { useAtomValue, Result } from '@effect-atom/atom-react'
import { useAiProviderUsage } from '../../hooks/useAiProviderAtoms'
import { tierLimitsAtom } from '../../atoms/account-atoms'
import type {
  AiProviderType,
  AiUsageSnapshot,
} from '../../../shared/schemas/ai/provider'

interface ToolUsageBarProps {
  toolName: string
  usagePercentage: number
  used: number
  limit: number
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
      return '#00d4aa'
    case 'claude':
      return '#ff6b35'
    case 'openai':
      return '#10a37f'
    default:
      return '#6b7280'
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
  const anchorRef = useRef<HTMLButtonElement>(null)

  const { refs, floatingStyles, context } = useFloating({
    open: isHovered,
    onOpenChange: setIsHovered,
    placement: 'right',
    middleware: [offset(8), flip(), shift({ padding: 8 })],
  })

  const { getReferenceProps, getFloatingProps } = useInteractions([
    useRole(context),
    useDismiss(context),
  ])

  const Icon = getProviderIcon(provider)
  const color = getProviderColor(provider)

  return (
    <>
      <button
        className="group relative cursor-pointer"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        ref={anchorRef}
        type="button"
        {...getReferenceProps()}
      >
        <div className="relative h-3 w-20 overflow-hidden rounded border border-white/20 bg-gradient-to-r from-white/5 to-white/10 backdrop-blur-sm">
          {/* Shimmer effect */}
          <motion.div
            animate={{ x: '100%' }}
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
            initial={{ x: '-100%' }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'linear',
            }}
          />

          {/* Usage bar fill */}
          <motion.div
            animate={{ width: `${Math.min(usagePercentage, 100)}%` }}
            className="absolute inset-0 rounded"
            initial={{ width: 0 }}
            style={{
              background: `linear-gradient(90deg, ${color}40 0%, ${color}80 100%)`,
            }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />

          {/* Content */}
          <div className="relative flex h-full items-center justify-between px-1">
            <div className="flex items-center gap-1">
              <Icon className="h-2 w-2 text-white/80" />
              <span className="text-xs font-medium text-white/90">
                {Math.round(usagePercentage)}%
              </span>
            </div>
          </div>
        </div>
      </button>

      {/* Detailed popover */}
      <FloatingPortal>
        <AnimatePresence>
          {isHovered && (
            <FloatingFocusManager context={context} modal={false}>
              <motion.div
                animate={{ opacity: 1, scale: 1, x: 0 }}
                className="z-50 rounded-lg border border-white/20 bg-black/80 px-4 py-3 backdrop-blur-md shadow-2xl"
                exit={{ opacity: 0, scale: 0.95, x: -10 }}
                initial={{ opacity: 0, scale: 0.95, x: -10 }}
                ref={refs.setFloating}
                style={floatingStyles}
                transition={{ duration: 0.15 }}
                {...getFloatingProps()}
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-white/80" />
                    <span className="font-medium text-white">{toolName}</span>
                  </div>
                  <div className="space-y-1 text-sm text-white/70">
                    <div>
                      Usage: {used} / {limit} {unit}
                    </div>
                    <div>Percentage: {Math.round(usagePercentage)}%</div>
                    <div>
                      Remaining: {limit - used} {unit}
                    </div>
                  </div>
                </div>
              </motion.div>
            </FloatingFocusManager>
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
    usageResult as Result.Result<readonly AiUsageSnapshot[], any>
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
        <div className="space-y-1">
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
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Icon className="h-3 w-3" style={{ color }} />
        <span className="text-xs font-medium text-white/70 capitalize">
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

  if (!aiProvidersEnabled || (!hasCursorData && !hasClaudeData)) {
    return null
  }

  return (
    <div className="absolute top-48 left-8 z-10 space-y-3">
      {hasCursorData && (
        <ProviderUsageBars isEnabled={aiProvidersEnabled} provider="cursor" />
      )}

      {hasClaudeData && (
        <ProviderUsageBars isEnabled={aiProvidersEnabled} provider="claude" />
      )}
    </div>
  )
}
