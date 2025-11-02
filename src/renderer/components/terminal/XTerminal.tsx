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
  // Note: refreshOutput is NOT needed - buffer updated by appendToOutputBuffer automatically

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
    let cancelled = false

    console.log(`[XTerminal] ==================== SUBSCRIBING ====================`)
    console.log(`[XTerminal] Process ID: ${processId}`)
    console.log(`[XTerminal] Terminal instance:`, xtermRef.current)

    // Subscribe to terminal output
    // Note: subscription manager handles StrictMode by updating callback in Map
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

        // NOTE: Don't call refreshOutput() here!
        // The buffer is already updated by appendToOutputBuffer in the subscription manager.
        // Calling refreshOutput() would trigger the buffer restore effect, causing duplicate output.
      }).pipe(Effect.provide(ElectronIpcClient.Default))
    ).then((subscription) => {
      // Only set subscription if not cancelled (prevents orphaned subscriptions)
      if (!cancelled) {
        console.log('[XTerminal] ==================== SUBSCRIPTION SUCCESSFUL ====================')
        subscriptionRef.current = subscription
      } else {
        // Effect cleaned up before promise resolved - unsubscribe immediately
        console.log('[XTerminal] ==================== SUBSCRIPTION CANCELLED - CLEANING UP ====================')
        subscription.unsubscribe()
      }
    }).catch((error) => {
      if (!cancelled) {
        console.error('[XTerminal] ==================== SUBSCRIPTION FAILED ====================', error)
      }
    })

    return () => {
      console.log(`[XTerminal] Unsubscribing from process ${processId}`)
      cancelled = true  // Mark as cancelled to prevent orphaned subscriptions
      subscriptionRef.current?.unsubscribe()
      subscriptionRef.current = null
    }
  }, [processId])

  // Load existing output when switching to this terminal
  // Use component-instance ref to prevent duplicate restoration in StrictMode
  const hasLoadedBufferRef = useRef(false)
  const isLoadingBufferRef = useRef(false)

  useEffect(() => {
    if (!xtermRef.current) return
    if (isLoadingBufferRef.current) return  // StrictMode protection
    if (hasLoadedBufferRef.current) return  // Already loaded for this instance

    isLoadingBufferRef.current = true

    Result.matchWithError(outputResult, {
      onSuccess: (chunks) => {
        if (chunks && chunks.value.length > 0 && xtermRef.current && !hasLoadedBufferRef.current) {
          console.log('[XTerminal] Loading', chunks.value.length, 'chunks of history for:', processId)
          // Write all raw chunks - concatenate without adding newlines!
          const fullOutput = chunks.value.join('')
          xtermRef.current.write(fullOutput)
          hasLoadedBufferRef.current = true
        }
      },
      onError: () => {},
      onDefect: () => {},
      onInitial: () => {},
    })

    isLoadingBufferRef.current = false
  }, [outputResult, processId])

  // Reset buffer loaded flag when processId changes
  useEffect(() => {
    hasLoadedBufferRef.current = false
    isLoadingBufferRef.current = false
  }, [processId])

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
