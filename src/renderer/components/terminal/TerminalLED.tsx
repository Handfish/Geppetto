import React from 'react'
import { cn } from '../../lib/utils'
import type { ProcessState } from '../../../shared/schemas/terminal'

interface TerminalLEDProps {
  state: ProcessState
  label?: string
  onClick?: () => void
  isActive?: boolean
  className?: string
}

export function TerminalLED({ state, label, onClick, isActive, className }: TerminalLEDProps) {
  const getStatusColor = () => {
    switch (state.status) {
      case 'running':
        return 'bg-green-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]'
      case 'idle':
        return 'bg-yellow-500 shadow-[0_0_10px_rgba(251,191,36,0.8)]'
      case 'starting':
        return 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)] animate-pulse'
      case 'error':
        return 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]'
      case 'stopped':
      default:
        return 'bg-gray-600'
    }
  }

  const getStatusText = () => {
    switch (state.status) {
      case 'running':
        return 'Running'
      case 'idle':
        return 'Idle'
      case 'starting':
        return 'Starting...'
      case 'error':
        return 'Error'
      case 'stopped':
        return 'Stopped'
    }
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        'group flex items-center gap-2 px-3 py-1.5 rounded-full',
        'bg-gray-900/90 backdrop-blur-sm border',
        isActive ? 'border-blue-500 bg-blue-950/50' : 'border-gray-700 hover:border-gray-600',
        'transition-all duration-200',
        onClick && 'cursor-pointer hover:scale-105',
        className
      )}
      title={`${label || `Process ${state.pid || 'N/A'}`}: ${getStatusText()}`}
    >
      <div className={cn('w-2 h-2 rounded-full', getStatusColor())} />
      {label && (
        <span className="text-xs font-medium text-gray-300 group-hover:text-white">
          {label}
        </span>
      )}
      <span className="text-xs text-gray-500">
        {getStatusText()}
      </span>
    </button>
  )
}
