import * as Effect from 'effect/Effect'
import * as Stream from 'effect/Stream'
import * as Option from 'effect/Option'
import type * as pty from 'node-pty'
import { ProcessMonitorError } from '../errors'
import { ProcessEvent } from '../schemas'

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
 *
 * Provides helpers for:
 * - Spawning tmux -CC with proper PTY support
 * - Parsing %output events from control mode stream
 * - Sending input via send-keys
 * - Creating event streams from pane output
 *
 * Control Mode Protocol:
 * - %output %<pane-id> <data>       : Pane output event
 * - %window-pane-changed %<pane-id> : Pane focus changed
 * - %session-changed %<session-id>  : Session changed
 * - %exit <code>                     : Client exiting
 *
 * INTEGRATION: Used by NodeProcessMonitorAdapter.pipeTmuxSession() to provide
 * real-time activity detection (< 10ms latency) without FIFO buffering delays.
 */
export namespace TmuxControlClient {
  /**
   * Spawn a tmux control mode client with a proper PTY
   * This enables tmux -CC to work correctly in Node environment
   */
  export const spawnWithPty = (
    sessionName: string,
    targetPaneId: string | null
  ): Effect.Effect<ControlModeClientState, ProcessMonitorError> =>
    Effect.gen(function* () {
      console.log(
        `[TmuxControl] Spawning control mode with PTY for session: ${sessionName}, paneId: ${targetPaneId || 'all'}`
      )

      // Get node-pty module
      const ptyModule = yield* getPty()

      // Spawn tmux -CC attach-session with a real PTY
      const ptyProcess = yield* Effect.try({
        try: () => {
          console.log(
            `[TmuxControl] Creating PTY for: tmux -CC attach-session -t ${sessionName}`
          )
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

          console.log(
            `[TmuxControl] PTY created successfully, PID: ${pty.pid}`
          )
          return pty
        },
        catch: (error) =>
          new ProcessMonitorError({
            message: `Failed to spawn tmux control mode PTY: ${String(error)}`,
            processId: sessionName,
            cause: error,
          }),
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
   * Parses %output lines and emits them as ProcessEvent objects
   */
  export const createEventStream = (
    client: ControlModeClientState
  ): Stream.Stream<ProcessEvent, ProcessMonitorError> => {
    console.log(
      `[TmuxControl] Creating event stream for session: ${client.sessionName}`
    )

    // Create an async stream that receives data from PTY onData callbacks
    return Stream.async<ProcessEvent, ProcessMonitorError>((emit) =>
      Effect.gen(function* () {
        console.log(`[TmuxControl] Setting up PTY onData handler`)

        // Handler for incoming data from PTY
        const onDataHandler = (data: string) => {
          console.log(
            `[TmuxControl] Raw PTY data (${data.length} bytes): ${JSON.stringify(data.slice(0, 100))}`
          )

          // Accumulate in buffer
          client.buffer += data
          console.log(`[TmuxControl] Buffer size: ${client.buffer.length}`)

          // Split into lines
          const lines = client.buffer.split('\n')
          // Keep incomplete last line in buffer
          client.buffer = lines.pop() ?? ''

          // Process each complete line
          for (const line of lines) {
            if (!line.trim()) continue

            console.log(`[TmuxControl] Processing line: ${JSON.stringify(line.slice(0, 80))}`)

            // Parse %output events
            if (line.startsWith('%output ')) {
              const match = line.match(/%output %(\d+) (.*)$/)
              if (match) {
                const paneId = match[1]
                const data = match[2]

                // Filter by target pane if specified
                if (client.targetPaneId && paneId !== client.targetPaneId) {
                  console.log(
                    `[TmuxControl] Skipping event from pane ${paneId} (target: ${client.targetPaneId})`
                  )
                  continue
                }

                console.log(
                  `[TmuxControl] ✓ %output pane=${paneId}, bytes=${data.length}`
                )

                client.paneIds.add(paneId)

                // Unescape data
                const unescapedData = data
                  .replace(/\\e/g, '\x1b')
                  .replace(/\\\\n/g, '\n')

                const event = new ProcessEvent({
                  type: 'stdout',
                  data: unescapedData + '\n',
                  timestamp: new Date(),
                  processId: paneId,
                })

                // Emit the event
                emit.single(event)
              }
            } else if (line.startsWith('%window-pane-changed ')) {
              const match = line.match(/%window-pane-changed %(\d+)/)
              if (match) {
                console.log(`[TmuxControl] ✓ %window-pane-changed pane=${match[1]}`)
              }
            } else if (line.startsWith('%exit ')) {
              const match = line.match(/%exit (\d+)/)
              const exitCode = match ? parseInt(match[1]) : 0
              console.log(
                `[TmuxControl] ✓ Control mode exiting with code ${exitCode}`
              )
              // End the stream on exit
              emit.end()
            } else if (line.startsWith('%begin ')) {
              console.log(`[TmuxControl] ✓ %begin: ${line}`)
            } else if (line.startsWith('%end ')) {
              console.log(`[TmuxControl] ✓ %end: ${line}`)
            } else {
              console.log(
                `[TmuxControl] ⚠️ Unhandled line: ${JSON.stringify(line.slice(0, 80))}`
              )
            }
          }
        }

        // Set up PTY data handler
        client.ptyProcess.onData((data: string) => {
          onDataHandler(data)
        })

        // Set up exit handler
        client.ptyProcess.onExit(({ exitCode, signal }) => {
          console.log(
            `[TmuxControl] PTY exited with code ${exitCode}, signal ${signal}`
          )
          emit.end()
        })

        console.log(`[TmuxControl] PTY handlers configured, stream is ready`)

        // Return cleanup function
        return Effect.sync(() => {
          console.log(`[TmuxControl] Cleaning up PTY stream`)
          client.ptyProcess.kill()
        })
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

        console.log(`[TmuxControl] Sending keys to pane=${paneId}: ${keys.slice(0, 50)}`)

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
