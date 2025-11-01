import React from 'react'
import { Terminal, MonitorPlay } from 'lucide-react'
import { useTerminalType, type TerminalType } from '../../atoms/terminal-settings-atoms'
import { cn } from '../../lib/utils'

interface TerminalTypeSwitcherProps {
  className?: string
}

/**
 * Terminal Type Switcher Component
 *
 * NOTE: Currently for testing/future use only.
 * AI watcher launcher still uses tmux - xterm integration is deferred.
 * This switcher allows testing the standalone xterm terminal panel.
 */
export function TerminalTypeSwitcher({ className }: TerminalTypeSwitcherProps) {
  const { terminalType, setTerminalType } = useTerminalType()

  const options: { value: TerminalType; label: string; icon: typeof Terminal; description: string }[] = [
    {
      value: 'tmux',
      label: 'Tmux',
      icon: MonitorPlay,
      description: 'Traditional tmux terminal (stable)',
    },
    {
      value: 'xterm',
      label: 'XTerm',
      icon: Terminal,
      description: 'New xterm.js + node-pty (testing only)',
    },
  ]

  return (
    <div className={cn('flex items-center gap-2 px-3 py-2 border-t border-gray-800', className)}>
      <span className="text-xs text-gray-400">Terminal Type:</span>
      <div className="flex items-center gap-1">
        {options.map((option) => {
          const Icon = option.icon
          const isSelected = terminalType === option.value

          return (
            <button
              key={option.value}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors',
                isSelected
                  ? 'bg-teal-500/20 text-teal-400 ring-1 ring-teal-500/50'
                  : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700/50 hover:text-gray-300'
              )}
              onClick={() => setTerminalType(option.value)}
              title={option.description}
              type="button"
            >
              <Icon className="size-3" />
              <span>{option.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
