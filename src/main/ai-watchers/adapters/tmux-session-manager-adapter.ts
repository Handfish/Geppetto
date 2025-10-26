import * as Effect from 'effect/Effect'
import * as Duration from 'effect/Duration'
import { exec, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import type { ProcessConfig } from '../ports'
import type { ProcessHandle, TmuxSession } from '../schemas'
import { TmuxSessionNotFoundError, TmuxCommandError } from '../errors'
import { NodeProcessMonitorAdapter } from './node-process-monitor-adapter'

const execAsync = promisify(exec)

/**
 * Execute a tmux command and return the output
 */
const executeTmuxCommand = (
  command: string
): Effect.Effect<string, TmuxCommandError> =>
  Effect.tryPromise({
    try: async () => {
      const { stdout } = await execAsync(command)
      return stdout.trim()
    },
    catch: error =>
      new TmuxCommandError({
        message: `Failed to execute tmux command: ${command}`,
        command,
        cause: error instanceof Error ? error.message : String(error),
      }),
  })

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
         * @param name - Session name
         * @param command - Command to run in the session (e.g., 'bash')
         * @param args - Arguments for the command (e.g., ['-c', 'echo hello'])
         * @param cwd - Working directory for the command
         * @returns ProcessHandle for the spawned session
         */
        createSession: (
          name: string,
          command: string,
          args?: string[],
          cwd?: string
        ) =>
          Effect.gen(function* () {
            // Build tmux arguments array (NO shell parsing!)
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
              `Creating tmux session "${name}" with command: "${command}"${args ? ` args: ${JSON.stringify(args)}` : ''}`
            )
            yield* Effect.logInfo(
              `Full tmux args: ${JSON.stringify(tmuxArgs)}`
            )

            // Use spawn (not exec!) to avoid shell parsing issues
            const createResult = yield* Effect.async<
              void,
              TmuxSessionNotFoundError
            >((resume) => {
              const child = spawn('tmux', tmuxArgs, {
                stdio: ['ignore', 'pipe', 'pipe'],
              })

              let stderr = ''
              child.stderr?.on('data', (chunk) => {
                stderr += chunk.toString()
              })

              child.on('error', (error) => {
                resume(
                  Effect.fail(
                    new TmuxSessionNotFoundError({
                      message: `Failed to spawn tmux: ${error.message}`,
                      sessionName: name,
                    })
                  )
                )
              })

              child.on('exit', (code) => {
                if (code === 0) {
                  resume(Effect.void)
                } else {
                  resume(
                    Effect.fail(
                      new TmuxSessionNotFoundError({
                        message: `Tmux exited with code ${code}. stderr: ${stderr}`,
                        sessionName: name,
                      })
                    )
                  )
                }
              })

              return Effect.sync(() => {
                if (child.exitCode === null && !child.killed) {
                  child.kill()
                }
              })
            })

            yield* Effect.logInfo(
              `Tmux session "${name}" created successfully, waiting 200ms for initialization`
            )

            // Give the session more time to fully initialize
            yield* Effect.sleep(Duration.millis(200))

            // Verify the session exists before attempting attach
            const sessionExists = yield* executeTmuxCommand(
              `tmux has-session -t '${name}' 2>&1`
            ).pipe(
              Effect.map(() => true),
              Effect.catchAll(() => Effect.succeed(false))
            )

            yield* Effect.logInfo(
              `Session existence check: ${sessionExists ? 'EXISTS' : 'NOT FOUND'}`
            )

            if (!sessionExists) {
              // List all sessions for debugging
              const allSessions = yield* executeTmuxCommand(
                'tmux list-sessions -F "#{session_name}"'
              ).pipe(Effect.catchAll(() => Effect.succeed('(no sessions)')))

              yield* Effect.logWarning(
                `Session "${name}" not found after creation! All sessions: ${allSessions}`
              )

              // Try to see if the command failed by checking tmux logs
              yield* Effect.logWarning(
                `Command that was supposed to run: "${command}"${args ? ` with args: ${JSON.stringify(args)}` : ''}`
              )

              return yield* Effect.fail(
                new TmuxSessionNotFoundError({
                  message: `Session "${name}" was created but immediately disappeared. All sessions: ${allSessions}. The command might have exited immediately: "${command}"`,
                  sessionName: name,
                })
              )
            }

            // Attach to the session with retry logic
            const attachWithRetry = (
              attempt: number
            ): Effect.Effect<
              ProcessHandle,
              TmuxSessionNotFoundError
            > =>
              Effect.gen(function* () {
                yield* Effect.logDebug(
                  `Attach attempt ${attempt + 1}/20 for session "${name}"`
                )

                return yield* attachSessionByName(name).pipe(
                  Effect.tap(() =>
                    Effect.logInfo(`Successfully attached to session "${name}"`)
                  ),
                  Effect.catchTags({
                    TmuxSessionNotFoundError: (error) =>
                      attempt < 20
                        ? Effect.gen(function* () {
                            yield* Effect.logDebug(
                              `Retry ${attempt + 1}: Session not found, waiting 200ms...`
                            )
                            yield* Effect.sleep(Duration.millis(200))
                            return yield* attachWithRetry(attempt + 1)
                          })
                        : Effect.gen(function* () {
                            yield* Effect.logError(
                              `Failed to attach after ${attempt + 1} attempts. Error: ${error.message}`
                            )
                            return yield* Effect.fail(error)
                          }),
                    ProcessAttachError: (error) =>
                      Effect.gen(function* () {
                        yield* Effect.logError(
                          `ProcessAttachError during attach: ${error.message}`
                        )
                        return yield* Effect.fail(
                          new TmuxSessionNotFoundError({
                            message: `Failed to attach to session "${name}": ${error.message}`,
                            sessionName: name,
                          })
                        )
                      }),
                    ProcessMonitorError: (error) =>
                      Effect.gen(function* () {
                        yield* Effect.logError(
                          `ProcessMonitorError during pipe: ${error.message}`
                        )
                        return yield* Effect.fail(
                          new TmuxSessionNotFoundError({
                            message: `Failed to pipe session "${name}": ${error.message}`,
                            sessionName: name,
                          })
                        )
                      }),
                  })
                )
              })

            return yield* attachWithRetry(0)
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
