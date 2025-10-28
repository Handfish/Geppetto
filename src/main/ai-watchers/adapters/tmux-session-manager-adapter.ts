import * as Effect from 'effect/Effect'
import * as Duration from 'effect/Duration'
import * as Scope from 'effect/Scope'
import * as Stream from 'effect/Stream'
import { Command } from '@effect/platform'
import { NodeContext } from '@effect/platform-node'
import type { ProcessConfig } from '../ports'
import { ProcessHandle, type TmuxSession } from '../schemas'
import { TmuxSessionNotFoundError, TmuxCommandError } from '../errors'
import { NodeProcessMonitorAdapter } from './node-process-monitor-adapter'

/**
 * Execute a tmux command and return the output
 *
 * Uses Command API for consistency and structured concurrency.
 * Effect.scoped() provides the Scope required by Command.start() and
 * automatically closes it after the command completes.
 */
const executeTmuxCommand = (
  command: string
): Effect.Effect<string, TmuxCommandError> =>
  Effect.scoped(
    Effect.gen(function* () {
      const cmd = Command.make('sh', '-c', command)
      const process = yield* Command.start(cmd).pipe(
        Effect.provide(NodeContext.layer),
        Effect.mapError(error =>
          new TmuxCommandError({
            message: `Failed to start tmux command: ${command}`,
            command,
            cause: error,
          })
        )
      )

      const [stdout, stderr, exitCode] = yield* Effect.all([
        process.stdout.pipe(
          Stream.decodeText('utf8'),
          Stream.runFold('', (acc, chunk) => acc + chunk)
        ),
        process.stderr.pipe(
          Stream.decodeText('utf8'),
          Stream.runFold('', (acc, chunk) => acc + chunk)
        ),
        process.exitCode,
      ]).pipe(
        Effect.mapError(error =>
          new TmuxCommandError({
            message: `Failed to execute tmux command: ${command}`,
            command,
            cause: error,
          })
        )
      )

      if (exitCode !== 0) {
        return yield* Effect.fail(
          new TmuxCommandError({
            message: `Tmux command failed with code ${exitCode}: ${stderr.trim()}`,
            command,
            cause: stderr.trim() || `Exit code ${exitCode}`,
          })
        )
      }

      return stdout.trim()
    })
  )

/**
 * TmuxSessionManagerAdapter - Tmux implementation of SessionManagerPort
 *
 * HEXAGONAL ARCHITECTURE: This is an ADAPTER implementing SessionManagerPort.
 * It can be replaced with other implementations (Screen, Docker, SSH, etc.) for testing or different environments.
 *
 * This adapter provides:
 * - Creating new tmux sessions with AI agents
 * - Attaching to existing tmux sessions
 * - Listing active tmux sessions
 * - Managing session lifecycle
 */
export class TmuxSessionManagerAdapter extends Effect.Service<TmuxSessionManagerAdapter>()(
  'TmuxSessionManagerAdapter',
  {
    dependencies: [NodeProcessMonitorAdapter.Default],
    effect: Effect.gen(function* () {
      const processMonitor = yield* NodeProcessMonitorAdapter

      /**
       * Attach to a session by name, getting both pane ID and PID
       */
      const attachSessionByName = (sessionName: string) =>
        Effect.gen(function* () {
          yield* Effect.logDebug(
            `attachSessionByName: Starting attach for "${sessionName}"`
          )

          // Get tmux session info
          const sessionInfo = yield* executeTmuxCommand(
            `tmux list-sessions -F "#{session_name}:#{session_id}" | grep "^${sessionName}:"`
          ).pipe(
            Effect.tap((info) =>
              Effect.logDebug(
                `attachSessionByName: Got session info: "${info}"`
              )
            ),
            Effect.catchAll((error) =>
              Effect.gen(function* () {
                yield* Effect.logWarning(
                  `attachSessionByName: Failed to get session info for "${sessionName}": ${String(error)}`
                )
                return yield* Effect.fail(
                  new TmuxSessionNotFoundError({
                    message: `Tmux session "${sessionName}" not found`,
                    sessionName,
                  })
                )
              })
            )
          )

          const parts = sessionInfo.split(':')
          if (parts.length < 2) {
            yield* Effect.logError(
              `attachSessionByName: Invalid session info format: "${sessionInfo}"`
            )
            return yield* Effect.fail(
              new TmuxSessionNotFoundError({
                message: `Invalid tmux session info format for "${sessionName}"`,
                sessionName,
              })
            )
          }

          const sessionId = parts[1]
          yield* Effect.logDebug(
            `attachSessionByName: Session ID is "${sessionId}"`
          )

          // Get pane info (pane id and PID)
          const paneInfo = yield* executeTmuxCommand(
            `tmux list-panes -t '${sessionId}' -F "#{pane_id}:#{pane_pid}" | head -n 1`
          ).pipe(
            Effect.tap((info) =>
              Effect.logDebug(`attachSessionByName: Got pane info: "${info}"`)
            ),
            Effect.catchAll((error) =>
              Effect.gen(function* () {
                yield* Effect.logError(
                  `attachSessionByName: Failed to get pane info: ${String(error)}`
                )
                return yield* Effect.fail(
                  new TmuxSessionNotFoundError({
                    message: `Could not get pane info for tmux session "${sessionName}"`,
                    sessionName,
                  })
                )
              })
            )
          )

          const [paneId, panePidStr] = paneInfo.split(':')
          if (!paneId || !panePidStr) {
            yield* Effect.logError(
              `attachSessionByName: Invalid pane info format: "${paneInfo}"`
            )
            return yield* Effect.fail(
              new TmuxSessionNotFoundError({
                message: `Invalid pane info "${paneInfo}" for tmux session "${sessionName}"`,
                sessionName,
              })
            )
          }

          const panePid = parseInt(panePidStr, 10)
          if (isNaN(panePid)) {
            yield* Effect.logError(
              `attachSessionByName: Invalid PID: "${panePidStr}"`
            )
            return yield* Effect.fail(
              new TmuxSessionNotFoundError({
                message: `Invalid PID "${panePidStr}" for tmux session "${sessionName}"`,
                sessionName,
              })
            )
          }

          yield* Effect.logDebug(
            `attachSessionByName: Pane ID="${paneId}", PID=${panePid}`
          )

          // Attach to the process
          yield* Effect.logDebug(
            `attachSessionByName: Calling processMonitor.attach(${panePid})`
          )
          const handle = yield* processMonitor.attach(panePid)
          yield* Effect.logDebug(
            `attachSessionByName: Successfully attached, handle.id="${handle.id}"`
          )

          // Pipe the tmux pane output
          yield* Effect.logDebug(
            `attachSessionByName: Calling pipeTmuxSession with paneId="${paneId}"`
          )
          yield* processMonitor.pipeTmuxSession(handle, paneId)
          yield* Effect.logDebug(
            `attachSessionByName: Successfully piped tmux session`
          )

          return handle
        })

      return {
        /**
         * Create a new tmux session and spawn a command in it
         *
         * Uses Command API with Scope-based lifecycle management.
         * The tmux process runs in ATTACHED mode, allowing us to monitor its lifecycle.
         * When tmux exits, the Scope closes, triggering automatic cleanup.
         *
         * @param name - Session name
         * @param command - Command to run in the session (e.g., 'bash')
         * @param args - Arguments for the command (e.g., ['-c', 'echo hello'])
         * @param cwd - Working directory for the command
         * @returns ProcessHandle for the spawned session (within Scope)
         */
        createSession: (
          name: string,
          command: string,
          args?: string[],
          cwd?: string
        ) =>
          Effect.gen(function* () {
            // Build tmux arguments - CREATE DETACHED (-d flag required for Electron)
            const tmuxArgs = ['new-session', '-d', '-s', name]

            // Add working directory if specified
            if (cwd) {
              tmuxArgs.push('-c', cwd)
            }

            // Add the command to run
            tmuxArgs.push(command)

            // Add command arguments if provided
            if (args && args.length > 0) {
              tmuxArgs.push(...args)
            }

            yield* Effect.logInfo(
              `Creating monitored tmux session "${name}" with command: "${command}"${args ? ` args: ${JSON.stringify(args)}` : ''}`
            )
            yield* Effect.logInfo(
              `Full tmux args: ${JSON.stringify(tmuxArgs)}`
            )

            // Create the detached session
            const createCmd = Command.make('tmux', ...tmuxArgs)
            const createProcess = yield* Command.start(createCmd).pipe(
              Effect.provide(NodeContext.layer),
              Effect.mapError((error) =>
                new TmuxSessionNotFoundError({
                  message: `Failed to start tmux: ${String(error)}`,
                  sessionName: name,
                })
              )
            )

            // Wait for session creation to complete
            const [createStdout, createStderr, createExitCode] = yield* Effect.all([
              createProcess.stdout.pipe(
                Stream.decodeText('utf8'),
                Stream.runFold('', (acc, chunk) => acc + chunk)
              ),
              createProcess.stderr.pipe(
                Stream.decodeText('utf8'),
                Stream.runFold('', (acc, chunk) => acc + chunk)
              ),
              createProcess.exitCode,
            ]).pipe(
              Effect.mapError((error) =>
                new TmuxSessionNotFoundError({
                  message: `Failed to create tmux session: ${String(error)}`,
                  sessionName: name,
                })
              )
            )

            if (createExitCode !== 0) {
              return yield* Effect.fail(
                new TmuxSessionNotFoundError({
                  message: `Tmux creation failed with code ${createExitCode}: ${createStderr}`,
                  sessionName: name,
                })
              )
            }

            yield* Effect.logInfo(
              `Tmux session "${name}" created successfully`
            )

            // Wait briefly for session initialization
            yield* Effect.sleep(Duration.millis(200))

            // Attach to get the PID first
            const handle = yield* attachSessionByName(name)

            yield* Effect.logInfo(
              `Tmux session "${name}" created with handle ${handle.id}`
            )

            // Now start monitoring the session (scoped) with access to the handle
            // When session dies, kill the process to trigger normal exit flow
            yield* Effect.forkScoped(
              Effect.gen(function* () {
                yield* Effect.logInfo(
                  `Starting lifecycle monitor for tmux session "${name}"`
                )

                // Use `tmux has-session` polling to monitor session lifecycle
                // This blocks until the session is killed
                const monitorCmd = Command.make(
                  'sh',
                  '-c',
                  `while tmux has-session -t '${name}' 2>/dev/null; do sleep 1; done; echo "session-died"`
                )

                const monitorProcess = yield* Command.start(monitorCmd).pipe(
                  Effect.provide(NodeContext.layer)
                )

                const exitCode = yield* monitorProcess.exitCode

                yield* Effect.logWarning(
                  `Tmux session "${name}" has died (monitor exit code ${exitCode}). Killing process handle to trigger watcher shutdown.`
                )

                // Kill the process handle to trigger the normal exit event flow
                // This will cause the watcher to detect the exit and update status
                yield* processMonitor.kill(handle).pipe(
                  Effect.catchAll((error) => {
                    // Ignore errors if process already dead
                    return Effect.logDebug(
                      `Process ${handle.id} already dead or kill failed: ${String(error)}`
                    )
                  })
                )

                yield* Effect.logInfo(
                  `Triggered process kill for session "${name}" after external termination`
                )
              })
            )

            return handle
          }),

        /**
         * Attach to an existing tmux session by name
         *
         * @param sessionName - Name of the tmux session to attach to
         * @returns ProcessHandle for the attached session
         */
        attachToSession: (sessionName: string) => attachSessionByName(sessionName),

        /**
         * List all active tmux sessions
         *
         * @returns Array of TmuxSession objects
         */
        listSessions: () =>
          Effect.gen(function* () {
            // Execute tmux list-sessions
            const output = yield* executeTmuxCommand(
              'tmux list-sessions -F "#{session_name}:#{session_attached}:#{session_created}:#{session_id}"'
            ).pipe(
              // If no sessions exist, tmux returns an error - handle gracefully
              Effect.catchAll(() => Effect.succeed(''))
            )

            if (!output) {
              return []
            }

            const lines = output.split('\n').filter(Boolean)

            return lines.map(line => {
              const [name, attachedStr, createdStr, sessionId] = line.split(':')
              return {
                name,
                attached: attachedStr === '1',
                created: new Date(Number(createdStr) * 1000),
                sessionId,
              } as TmuxSession
            })
          }),

        /**
         * Kill a tmux session by name
         *
         * @param sessionName - Name of the session to kill
         */
        killSession: (sessionName: string) =>
          Effect.gen(function* () {
            // Note: Quote session name to prevent shell expansion
            yield* executeTmuxCommand(`tmux kill-session -t '${sessionName}'`)
          }),

        /**
         * Check if a tmux session exists
         *
         * @param sessionName - Name of the session to check
         * @returns true if session exists, false otherwise
         */
        sessionExists: (sessionName: string) =>
          Effect.gen(function* () {
            const sessions = yield* executeTmuxCommand(
              'tmux list-sessions -F "#{session_name}"'
            ).pipe(Effect.catchAll(() => Effect.succeed('')))

            if (!sessions) {
              return false
            }

            const sessionNames = sessions.split('\n').filter(Boolean)
            return sessionNames.includes(sessionName)
          }),
      }
    }),
  }
) {}
