/**
 * Terminal Settings - User preferences for terminal type
 */

import { useState, useEffect } from 'react'

export type TerminalType = 'tmux' | 'xterm'

const STORAGE_KEY = 'geppetto:terminal-type'

/**
 * Get terminal type from localStorage
 */
function getStoredTerminalType(): TerminalType {
  const stored = localStorage.getItem(STORAGE_KEY)
  return (stored === 'xterm' || stored === 'tmux') ? stored : 'tmux'
}

/**
 * Set terminal type to localStorage
 */
function setStoredTerminalType(type: TerminalType): void {
  localStorage.setItem(STORAGE_KEY, type)
}

/**
 * Hook to get and set terminal type preference
 */
export function useTerminalType() {
  const [terminalType, setTerminalTypeState] = useState<TerminalType>(getStoredTerminalType)

  const setTerminalType = (type: TerminalType) => {
    setTerminalTypeState(type)
    setStoredTerminalType(type)
  }

  // Sync with localStorage on mount
  useEffect(() => {
    const stored = getStoredTerminalType()
    if (stored !== terminalType) {
      setTerminalTypeState(stored)
    }
  }, [])

  return {
    terminalType,
    setTerminalType,
    isTmux: terminalType === 'tmux',
    isXterm: terminalType === 'xterm',
  }
}
