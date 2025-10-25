import * as Effect from 'effect/Effect'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import type { ProcessConfig } from './ports'
import type { ProcessHandle, TmuxSession } from './schemas'
import { TmuxSessionNotFoundError, TmuxCommandError } from './errors'
import { ProcessMonitorService } from './process-monitor-service'

const execAsync = promisify(exec)

/**
 * Execute a tmux command and return the output
 */
const executeTmuxCommand = (command: string): Effect.Effect<string, TmuxCommandError> =>
  Effect.tryPromise({
    try: async () => {
      const { stdout } = await execAsync(command)
      return stdout.trim()
    },
    catch: (error) =>
      new TmuxCommandError({
        message: `Failed to execute tmux command: ${command}`,
        command,
        cause: error instanceof Error ? error.message : String(error),
      }),
  })

/**
 * TmuxSessionManager - manages tmux sessions for AI agent monitoring
 *
 * This service provides:
 * - Creating new tmux sessions with AI agents
 * - Attaching to existing tmux sessions
 * - Listing active tmux sessions
 * - Managing session lifecycle
 */
export class TmuxSessionManager extends Effect.Service<TmuxSessionManager>()(
  'TmuxSessionManager',
  {
    dependencies: [ProcessMonitorService.Default],
    effect: Effect.gen(function* () {
      const processMonitor = yield* ProcessMonitorService

      return {
        /**
         * Create a new tmux session and spawn a command in it
         *
         * @param name - Session name
         * @param command - Command to run in the session
         * @param cwd - Working directory for the command
         * @returns ProcessHandle for the spawned session
         */
        createSession: (name: string, command: string, cwd?: string) =>
          Effect.gen(function* () {
            // Build tmux command
            const tmuxArgs = [
              'new-session',
              '-d', // detached
              '-s',
              name, // session name
            ]

            // Add working directory if specified
            if (cwd) {
              tmuxArgs.push('-c', cwd)
            }

            // Add the command to run
            tmuxArgs.push(command)

            const config: ProcessConfig = {
              command: 'tmux',
              args: tmuxArgs,
              env: process.env as Record<string, string>,
            }

            return yield* processMonitor.spawn(config)
          }),

        /**
         * Attach to an existing tmux session by name
         *
         * @param sessionName - Name of the tmux session to attach to
         * @returns ProcessHandle for the attached session
         */
        attachToSession: (sessionName: string) =>
          Effect.gen(function* () {
            // Get tmux session info
            const sessionInfo = yield* executeTmuxCommand(
              `tmux list-sessions -F "#{session_name}:#{session_id}" | grep "^${sessionName}:"`
            ).pipe(
              Effect.catchAll((error) =>
                Effect.fail(
                  new TmuxSessionNotFoundError({
                    message: `Tmux session "${sessionName}" not found`,
                    sessionName,
                  })
                )
              )
            )

            const parts = sessionInfo.split(':')
            if (parts.length < 2) {
              return yield* Effect.fail(
                new TmuxSessionNotFoundError({
                  message: `Invalid tmux session info format for "${sessionName}"`,
                  sessionName,
                })
              )
            }

            const sessionId = parts[1]

            // Get PID of the main pane
            const pidStr = yield* executeTmuxCommand(
              `tmux list-panes -t ${sessionId} -F "#{pane_pid}" | head -n 1`
            ).pipe(
              Effect.catchAll(() =>
                Effect.fail(
                  new TmuxSessionNotFoundError({
                    message: `Could not get PID for tmux session "${sessionName}"`,
                    sessionName,
                  })
                )
              )
            )

            const pid = parseInt(pidStr, 10)
            if (isNaN(pid)) {
              return yield* Effect.fail(
                new TmuxSessionNotFoundError({
                  message: `Invalid PID "${pidStr}" for tmux session "${sessionName}"`,
                  sessionName,
                })
              )
            }

            return yield* processMonitor.attach(pid)
          }),

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

            return lines.map((line) => {
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
            yield* executeTmuxCommand(`tmux kill-session -t ${sessionName}`)
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
