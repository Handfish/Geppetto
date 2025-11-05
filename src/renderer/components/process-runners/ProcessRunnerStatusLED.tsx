import { motion } from 'framer-motion'
import type { ProcessRunner } from '../../shared/schemas/process-runners'
import { X } from 'lucide-react'

const getProviderFavicon = (type: string) => {
  switch (type) {
    case 'claude-code':
    case 'claude':
      return '🤖' // Or actual favicon URL
    case 'codex':
      return '⚡'
    case 'cursor':
      return '🎯'
    default:
      return '🔧'
  }
}

const getStatusColor = (status: ProcessRunner['status']) => {
  switch (status) {
    case 'starting':
      return {
        bg: '#3b82f650',
        border: '#3b82f6',
        glow: '#3b82f680',
        shadow: '0 0 20px #3b82f680',
      }
    case 'running':
      return {
        bg: '#10b98150',
        border: '#10b981',
        glow: '#10b98180',
        shadow: '0 0 20px #10b98180',
      }
    case 'idle':
      return {
        bg: '#fbbf2450',
        border: '#fbbf24',
        glow: '#fbbf2480',
        shadow: '0 0 20px #fbbf2480',
      }
    case 'stopped':
    case 'errored':
      return {
        bg: '#1f293710',
        border: '#374151',
        glow: 'transparent',
        shadow: 'none',
      }
    default:
      return {
        bg: '#6b728050',
        border: '#6b7280',
        glow: '#6b728080',
        shadow: '0 0 20px #6b728080',
      }
  }
}

interface ProcessRunnerLEDProps {
  watcher: ProcessRunner
  onClear?: (runnerId: string) => void
  onClick?: (runner: ProcessRunner) => void
}

export function ProcessRunnerStatusLED({ watcher, onClear, onClick }: ProcessRunnerLEDProps) {
  const colors = getStatusColor(watcher.status)
  const favicon = getProviderFavicon(watcher.type)
  const isActive = watcher.status === 'starting' || watcher.status === 'running' || watcher.status === 'idle'
  const isDead = watcher.status === 'stopped' || watcher.status === 'errored'

  const handleClick = () => {
    console.log('[ProcessRunnerStatusLED] Button clicked!')
    console.log('[ProcessRunnerStatusLED] Runner:', watcher.id, 'Status:', watcher.status)
    console.log('[ProcessRunnerStatusLED] isDead:', isDead, 'onClick defined:', !!onClick)

    if (onClick && !isDead) {
      console.log('[ProcessRunnerStatusLED] Calling onClick handler...')
      onClick(watcher)
    } else {
      console.log('[ProcessRunnerStatusLED] NOT calling onClick - isDead:', isDead, 'onClick:', !!onClick)
    }
  }

  return (
    <motion.div
      animate={{ opacity: 1, scale: 1 }}
      className="relative group"
      exit={{ opacity: 0, scale: 0.8 }}
      initial={{ opacity: 0, scale: 0.8 }}
      layout
    >
      {/* LED Square */}
      <button
        className="relative size-12 rounded border-2 backdrop-blur-xl transition-all duration-300 cursor-pointer hover:scale-110"
        style={{
          backgroundColor: colors.bg,
          borderColor: colors.border,
          boxShadow: isActive ? colors.shadow : 'none',
        }}
        onClick={handleClick}
        type="button"
      >
        {/* Favicon */}
        <div className="absolute inset-0 flex items-center justify-center text-lg">
          {favicon}
        </div>

        {/* Pulsing Glow (only when active) */}
        {isActive && (
          <motion.div
            animate={{ opacity: [0.5, 1, 0.5] }}
            className="absolute inset-0 rounded"
            style={{
              backgroundColor: colors.glow,
              filter: 'blur(8px)',
              zIndex: -1,
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        )}

        {/* Clear button (only when dead) */}
        {isDead && onClear && (
          <button
            className="absolute -top-1 -right-1 size-4 bg-gray-700 hover:bg-red-500 rounded-full flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation()
              onClear(watcher.id)
            }}
            type="button"
          >
            <X className="size-3 text-white" />
          </button>
        )}
      </button>

      {/* Tooltip on hover */}
      <div className="absolute right-full mr-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
        <div className="bg-gray-900/95 border border-gray-700/50 rounded px-2 py-1 text-xs text-white backdrop-blur-xl">
          <div className="font-medium">{watcher.name}</div>
          <div className="text-gray-400 capitalize">{watcher.status}</div>
        </div>
      </div>
    </motion.div>
  )
}

// Backwards compatibility alias
export const WatcherStatusLED = ProcessRunnerStatusLED