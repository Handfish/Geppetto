import * as Effect from 'effect/Effect'
import * as Stream from 'effect/Stream'
import * as Option from 'effect/Option'
import type * as pty from 'node-pty'
import { ProcessMonitorError } from '../../errors'
import { ProcessEvent } from '../../schemas'

// Lazy import of node-pty to avoid loading native module at startup
const getPty = () => Effect.sync(() => require('node-pty') as typeof pty)

/**
 * Internal state for a control mode client powered by node-pty PTY
 */
interface ControlModeClientState {
  ptyProcess: pty.IPty
  sessionName: string
  targetPaneId: string | null
  paneIds: Set<string>
  buffer: string
  dataCallbacks: Set<(data: string) => void>
}

/**
 * TmuxControlClient - PTY-based tmux control mode operation
 *
 * Uses node-pty to create a proper pseudo-terminal for tmux -CC,
 * enabling real-time event streaming without buffering delays.
 */
export namespace TmuxControlClient {
  /**
   * Spawn a tmux control mode client with a proper PTY
   */
  export const spawnWithPty = (
    sessionName: string,
    targetPaneId: string | null
  ): Effect.Effect<ControlModeClientState, ProcessMonitorError> =>
    Effect.gen(function* () {
      const ptyModule = yield* getPty()

      console.log(`[TmuxControl:${sessionName}] Spawning tmux -CC attach-session`)

      const ptyProcess = yield* Effect.try({
        try: () => {
          const pty = ptyModule.spawn('tmux', ['-CC', 'attach-session', '-t', sessionName], {
            name: 'xterm-256color',
            cols: 200,
            rows: 50,
            env: {
              ...process.env,
              TERM: 'xterm-256color',
              COLORTERM: 'truecolor',
            } as Record<string, string>,
          })

          console.log(`[TmuxControl:${sessionName}] PTY spawned successfully, PID=${pty.pid}`)
          return pty
        },
        catch: (error) => {
          console.error(`[TmuxControl:${sessionName}] Failed to spawn PTY:`, error)
          return new ProcessMonitorError({
            message: `Failed to spawn tmux control mode PTY: ${String(error)}`,
            processId: sessionName,
            cause: error,
          })
        },
      })

      const client: ControlModeClientState = {
        ptyProcess,
        sessionName,
        targetPaneId,
        paneIds: new Set(),
        buffer: '',
        dataCallbacks: new Set(),
      }

      return client
    })

  /**
   * Create a stream of ProcessEvents from a control mode client
   * This uses async generator approach which properly executes immediately
   */
  export const createEventStream = (
    client: ControlModeClientState
  ): Stream.Stream<ProcessEvent, ProcessMonitorError> => {
    return Stream.fromAsyncIterable(
      (async function* () {
        console.log(`[TmuxControl:${client.sessionName}] Stream created`)

        let streamEnded = false
        const events: ProcessEvent[] = []

        // Handler for incoming data from PTY
        const onDataHandler = (data: string) => {
          if (streamEnded) return

          console.log(`[TmuxControl:${client.sessionName}] onData (${data.length}b): ${JSON.stringify(data.slice(0, 100))}`)

          // Accumulate in buffer
          client.buffer += data

          // Split into lines
          const lines = client.buffer.split('\n')
          // Keep incomplete last line in buffer
          client.buffer = lines.pop() ?? ''

          console.log(`[TmuxControl:${client.sessionName}] Buffer state: lines=${lines.length}, remaining=${client.buffer.length}b`)
          if (lines.length > 0) {
            console.log(`[TmuxControl:${client.sessionName}] First line: ${JSON.stringify(lines[0].slice(0, 50))}`)
          }

          // Process each complete line (trim \r\n)
          for (const line of lines) {
            const cleanLine = line.replace(/\r\n?$/, '')
            if (!cleanLine.trim()) continue

            // Debug: log all non-empty lines we're processing
            const lineStart = cleanLine.slice(0, 30)
            console.log(`[TmuxControl:${client.sessionName}] Processing line: ${JSON.stringify(lineStart)}...`)

            // Parse %output events
            if (cleanLine.startsWith('%output ')) {
              console.log(`[TmuxControl:${client.sessionName}] Found %output line (${cleanLine.length}b): ${JSON.stringify(cleanLine.slice(0, 50))}`)
              const match = cleanLine.match(/^%output %(\d+) (.*)$/)
              console.log(`[TmuxControl:${client.sessionName}] Regex match result: ${match ? 'YES' : 'NO'} (${match ? `paneId=${match[1]}` : 'no match'})`)
              if (match) {
                const paneId = match[1]
                const eventData = match[2]

                // Filter by target pane if specified
                if (client.targetPaneId && paneId !== client.targetPaneId) {
                  console.log(`[TmuxControl:${client.sessionName}] Filtering out pane ${paneId} (target=${client.targetPaneId})`)
                  continue
                }

                console.log(`[TmuxControl:${client.sessionName}] ✓ %output pane=${paneId} (${eventData.length}b)`)

                client.paneIds.add(paneId)

                // Unescape data - the data comes escaped with \\033 not \033
                const unescapedData = eventData
                  .replace(/\\033/g, '\x1b')
                  .replace(/\\(\d+)/g, (match, code) => String.fromCharCode(parseInt(code, 8)))

                const event = new ProcessEvent({
                  type: 'stdout',
                  data: unescapedData,
                  timestamp: new Date(),
                  processId: paneId,
                })

                console.log(`[TmuxControl:${client.sessionName}] Pushing event to queue, total events: ${events.length + 1}`)
                events.push(event)
              } else {
                console.log(`[TmuxControl:${client.sessionName}] ✗ %output regex mismatch: ${JSON.stringify(cleanLine.slice(0, 50))}`)
              }
            } else if (cleanLine.startsWith('%exit ')) {
              console.log(`[TmuxControl:${client.sessionName}] %exit`)
              streamEnded = true
            }
          }
        }

        console.log(`[TmuxControl:${client.sessionName}] Registering handlers`)

        // Set up PTY data handler
        client.ptyProcess.onData((data: string) => {
          onDataHandler(data)
        })

        // Set up exit handler
        client.ptyProcess.onExit(({ exitCode, signal }) => {
          console.log(`[TmuxControl:${client.sessionName}] PTY.onExit code=${exitCode}`)
          streamEnded = true
        })

        console.log(`[TmuxControl:${client.sessionName}] Sending list-windows`)
        try {
          client.ptyProcess.write('list-windows\n')
        } catch (e) {
          console.error(`[TmuxControl:${client.sessionName}] Write failed:`, e)
        }

        // Yield events as they arrive
        while (!streamEnded || events.length > 0) {
          if (events.length > 0) {
            const event = events.shift()!
            console.log(`[TmuxControl:${client.sessionName}] YIELDING ${event.type}`)
            yield event
          } else {
            await new Promise(resolve => setTimeout(resolve, 50))
          }
        }

        console.log(`[TmuxControl:${client.sessionName}] Stream ended`)
        client.ptyProcess.kill()
      })(),
      (error) =>
        new ProcessMonitorError({
          message: `Stream async iterable error: ${error instanceof Error ? error.message : String(error)}`,
          processId: client.sessionName,
          cause: error,
        })
    )
  }

  /**
   * Send keys to a pane via the control mode PTY
   */
  export const sendKeys = (
    client: ControlModeClientState,
    paneId: string,
    keys: string
  ): Effect.Effect<void, ProcessMonitorError> =>
    Effect.try({
      try: () => {
        const command = `send-keys -t %${paneId} "${keys.replace(/"/g, '\\"')}"\n`
        console.log(`[TmuxControl] Sending keys to pane=${paneId}`)
        client.ptyProcess.write(command)
      },
      catch: (error) =>
        new ProcessMonitorError({
          message: `Failed to send keys: ${String(error)}`,
          processId: client.sessionName,
          cause: error,
        }),
    })

  /**
   * Kill the control mode client
   */
  export const kill = (client: ControlModeClientState): Effect.Effect<void> =>
    Effect.sync(() => {
      console.log(`[TmuxControl] Killing PTY process`)
      client.ptyProcess.kill()
    })
}
