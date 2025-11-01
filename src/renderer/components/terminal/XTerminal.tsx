import React, { useEffect, useRef, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import '@xterm/xterm/css/xterm.css'
import { useAtomValue, useAtomRefresh } from '@effect-atom/atom-react'
import { Result } from '@effect-atom/atom-react'
import { watcherOutputAtom, terminalSubscriptionManager } from '../../atoms/terminal-atoms'
import type { OutputChunk, ProcessEvent } from '../../../shared/schemas/terminal'
import { cn } from '../../lib/utils'
import { Effect } from 'effect'
import { ElectronIpcClient } from '../../lib/ipc-client'

interface XTerminalProps {
  processId: string
  className?: string
  onData?: (data: string) => void
  onResize?: (rows: number, cols: number) => void
  isActive?: boolean
}

export function XTerminal({
  processId,
  className,
  onData,
  onResize,
  isActive = true,
}: XTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const searchAddonRef = useRef<SearchAddon | null>(null)
  const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null)

  const outputResult = useAtomValue(watcherOutputAtom(processId))
  const refreshOutput = useAtomRefresh(watcherOutputAtom(processId))

  // Initialize terminal
  useEffect(() => {
    if (!terminalRef.current) return

    const terminal = new Terminal({
      theme: {
        background: '#0a0a0a',
        foreground: '#e4e4e7',
        black: '#27272a',
        red: '#ef4444',
        green: '#10b981',
        yellow: '#fbbf24',
        blue: '#3b82f6',
        magenta: '#8b5cf6',
        cyan: '#06b6d4',
        white: '#e4e4e7',
        brightBlack: '#52525b',
        brightRed: '#f87171',
        brightGreen: '#34d399',
        brightYellow: '#fde047',
        brightBlue: '#60a5fa',
        brightMagenta: '#a78bfa',
        brightCyan: '#22d3ee',
        brightWhite: '#f4f4f5',
        cursor: '#fbbf24',
        cursorAccent: '#0a0a0a',
        selectionBackground: '#3b82f6',
        selectionForeground: '#ffffff',
      },
      fontFamily: '"JetBrains Mono", "Cascadia Code", "Fira Code", monospace',
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 1000,
      convertEol: true,
    })

    xtermRef.current = terminal

    // Add addons
    const fitAddon = new FitAddon()
    fitAddonRef.current = fitAddon
    terminal.loadAddon(fitAddon)

    const searchAddon = new SearchAddon()
    searchAddonRef.current = searchAddon
    terminal.loadAddon(searchAddon)

    const webLinksAddon = new WebLinksAddon()
    terminal.loadAddon(webLinksAddon)

    // Open terminal
    terminal.open(terminalRef.current)

    // Initial fit
    setTimeout(() => fitAddon.fit(), 0)

    // Write initial message to verify terminal is working (bright yellow on black, bold)
    terminal.write('\x1b[1;33m===== XTerminal Ready =====\x1b[0m\r\n')
    terminal.write('\x1b[32mConnecting to process...\x1b[0m\r\n')
    terminal.write('\x1b[36mType something to test input\x1b[0m\r\n')
    console.log('[XTerminal] Terminal initialized and opened')

    // Handle input
    terminal.onData((data) => {
      console.log('[XTerminal] User input:', data, 'charCode:', data.charCodeAt(0))
      onData?.(data)
    })

    // Handle resize
    terminal.onResize(({ rows, cols }) => {
      onResize?.(rows, cols)
    })

    return () => {
      subscriptionRef.current?.unsubscribe()
      terminal.dispose()
    }
  }, [processId])

  // Subscribe to output stream
  useEffect(() => {
    if (!xtermRef.current) return

    const terminal = xtermRef.current

    console.log(`[XTerminal] ==================== SUBSCRIBING ====================`)
    console.log(`[XTerminal] Process ID: ${processId}`)
    console.log(`[XTerminal] Terminal instance:`, xtermRef.current)

    // Subscribe to terminal output
    Effect.runPromise(
      terminalSubscriptionManager.subscribe(processId, (data) => {
        console.log('[XTerminal] !!!!! CALLBACK TRIGGERED !!!!!', data)
        console.log('[XTerminal] Data type:', typeof data, 'keys:', Object.keys(data))

        if ('data' in data && 'type' in data) {
          // OutputChunk
          const chunk = data as OutputChunk
          console.log('[XTerminal] >>> Writing output chunk to terminal:', chunk.data.substring(0, 100))
          console.log('[XTerminal] >>> Chunk length:', chunk.data.length)
          terminal.write(chunk.data)
          console.log('[XTerminal] >>> Write completed')
        } else {
          // ProcessEvent
          const event = data as ProcessEvent
          console.log('[XTerminal] >>> Received event:', event.type)
          if (event.type === 'stopped' || event.type === 'error') {
            terminal.write(`\r\n\x1b[31m[Process ${event.type}]\x1b[0m\r\n`)
          } else if (event.type === 'idle') {
            terminal.write(`\r\n\x1b[33m[Process idle]\x1b[0m\r\n`)
          } else if (event.type === 'active') {
            terminal.write(`\r\n\x1b[32m[Process active]\x1b[0m\r\n`)
          }
        }

        // Refresh output atom to update buffer
        refreshOutput()
      }).pipe(Effect.provide(ElectronIpcClient.Default))
    ).then((subscription) => {
      console.log('[XTerminal] ==================== SUBSCRIPTION SUCCESSFUL ====================')
      subscriptionRef.current = subscription
    }).catch((error) => {
      console.error('[XTerminal] ==================== SUBSCRIPTION FAILED ====================', error)
    })

    return () => {
      console.log(`[XTerminal] Unsubscribing from process ${processId}`)
      subscriptionRef.current?.unsubscribe()
    }
  }, [processId, refreshOutput])

  // Load existing output
  useEffect(() => {
    if (!xtermRef.current) return

    Result.matchWithError(outputResult, {
      onSuccess: (data) => {
        if (data && data.value.length > 0 && xtermRef.current) {
          xtermRef.current.write(data.value.join('\n'))
        }
      },
      onError: () => {},
      onDefect: () => {},
      onInitial: () => {},
    })
  }, [outputResult])

  // Handle active state changes
  useEffect(() => {
    if (!xtermRef.current) return

    if (isActive) {
      xtermRef.current.focus()
    } else {
      xtermRef.current.blur()
    }
  }, [isActive])

  // Handle resize
  useEffect(() => {
    if (!fitAddonRef.current) return

    const handleResize = () => {
      fitAddonRef.current?.fit()
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    if (!xtermRef.current || !searchAddonRef.current) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isActive) return

      // Ctrl+F: Search
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        const searchTerm = prompt('Search for:')
        if (searchTerm) {
          searchAddonRef.current?.findNext(searchTerm)
        }
      }

      // Ctrl+Shift+C: Copy
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
        e.preventDefault()
        const selection = xtermRef.current?.getSelection()
        if (selection) {
          navigator.clipboard.writeText(selection)
        }
      }

      // Ctrl+Shift+V: Paste
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'V') {
        e.preventDefault()
        navigator.clipboard.readText().then((text) => {
          onData?.(text)
        })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isActive, onData])

  return (
    <div
      ref={terminalRef}
      className={cn(
        'w-full h-full bg-black rounded-lg overflow-hidden',
        isActive && 'ring-2 ring-blue-500',
        className
      )}
    />
  )
}
