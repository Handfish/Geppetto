/**
 * Tmux Process Logger - Spawn in Detached Tmux Session
 * 
 * This spawns the process in a tmux session that the user can attach to,
 * while simultaneously monitoring and logging all output through tmux's
 * pipe-pane feature.
 * 
 * The user can:
 * - Attach to the tmux session for interactive use: tmux attach -t <session>
 * - Detach anytime with Ctrl+B, D
 * - We monitor the session and log everything
 * - Session stays alive even if monitoring stops
 */

import * as Effect from "effect/Effect"
import * as Stream from "effect/Stream"
import * as Queue from "effect/Queue"
import * as Deferred from "effect/Deferred"
import * as Ref from "effect/Ref"
import * as Schedule from "effect/Schedule"
import { pipe } from "effect/Function"
import * as Schema from "effect/Schema"
import * as fs from "node:fs"
import * as path from "node:path"
import { spawn, exec } from "node:child_process"
import { promisify } from "node:util"

const execAsync = promisify(exec)

// =============================================================================
// Domain Models
// =============================================================================

const ProcessOutputSchema = Schema.Struct({
  source: Schema.Literal("tmux-output"),
  data: Schema.String,
  timestamp: Schema.Number,
})
type ProcessOutput = Schema.Schema.Type<typeof ProcessOutputSchema>

const ActivityStateSchema = Schema.Literal("idle", "active")
type ActivityState = Schema.Schema.Type<typeof ActivityStateSchema>

const LogFileStateSchema = Schema.Struct({
  currentFile: Schema.String,
  currentSize: Schema.Number,
  rotationCount: Schema.Number,
})
type LogFileState = Schema.Schema.Type<typeof LogFileStateSchema>

const TmuxSessionInfoSchema = Schema.Struct({
  sessionName: Schema.String,
  isRunning: Schema.Boolean,
  attachCommand: Schema.String,
})
type TmuxSessionInfo = Schema.Schema.Type<typeof TmuxSessionInfoSchema>

// =============================================================================
// Tagged Errors
// =============================================================================

class FileWriteError extends Schema.TaggedError<FileWriteError>()(
  "FileWriteError",
  { path: Schema.String, cause: Schema.Unknown }
) {}

class FileRotationError extends Schema.TaggedError<FileRotationError>()(
  "FileRotationError",
  { fromPath: Schema.String, toPath: Schema.String, cause: Schema.Unknown }
) {}

class TmuxError extends Schema.TaggedError<TmuxError>()(
  "TmuxError",
  { message: Schema.String, cause: Schema.Unknown }
) {}

class SchemaParseError extends Schema.TaggedError<SchemaParseError>()(
  "SchemaParseError",
  { data: Schema.Unknown, cause: Schema.Unknown }
) {}

// =============================================================================
// Configuration
// =============================================================================

interface TmuxLoggerConfig {
  readonly maxFileSize: number
  readonly outputDir: string
  readonly baseFileName: string
  readonly idleTimeoutMs: number
  readonly sessionName: string
  readonly autoAttach: boolean // Auto-attach to session after spawn
}

const defaultConfig: TmuxLoggerConfig = {
  maxFileSize: 100 * 1024 * 1024,
  outputDir: "./logs",
  baseFileName: "tmux-output",
  idleTimeoutMs: 5000,
  sessionName: "claude-code-session",
  autoAttach: true,
}

// =============================================================================
// File Management (same as before)
// =============================================================================

const makeFileManager = (config: TmuxLoggerConfig) => {
  const getCurrentLogPath = (state: LogFileState): string =>
    path.join(config.outputDir, `${config.baseFileName}.log`)

  const getRotatedLogPath = (rotationCount: number): string =>
    path.join(config.outputDir, `${config.baseFileName}.${rotationCount}.log`)

  const ensureDirectory = Effect.tryPromise({
    try: () => fs.promises.mkdir(config.outputDir, { recursive: true }),
    catch: (cause) => new FileWriteError({ path: config.outputDir, cause }),
  })

  const writeToFile = (filePath: string, data: string) =>
    Effect.tryPromise({
      try: () => fs.promises.appendFile(filePath, data),
      catch: (cause) => new FileWriteError({ path: filePath, cause }),
    })

  const getFileSize = (filePath: string) =>
    Effect.tryPromise({
      try: async () => {
        try {
          const stats = await fs.promises.stat(filePath)
          return stats.size
        } catch {
          return 0
        }
      },
      catch: (cause) => new FileWriteError({ path: filePath, cause }),
    })

  const rotateFile = (fromPath: string, toPath: string) =>
    Effect.tryPromise({
      try: () => fs.promises.rename(fromPath, toPath),
      catch: (cause) => new FileRotationError({ fromPath, toPath, cause }),
    })

  return {
    ensureDirectory,
    writeToFile,
    getFileSize,
    rotateFile,
    getCurrentLogPath,
    getRotatedLogPath,
  }
}

// =============================================================================
// Activity Tracker
// =============================================================================

const makeActivityTracker = (config: TmuxLoggerConfig) => {
  return Effect.gen(function* () {
    const activityRef = yield* Ref.make<ActivityState>("idle")
    const lastActivityRef = yield* Ref.make(Date.now())

    const markActive = pipe(
      Effect.all([
        Ref.set(activityRef, "active" as ActivityState),
        Ref.set(lastActivityRef, Date.now()),
      ]),
      Effect.asVoid
    )

    const checkIdleStatus = pipe(
      Ref.get(lastActivityRef),
      Effect.flatMap((lastActivity) => {
        const now = Date.now()
        const isIdle = now - lastActivity > config.idleTimeoutMs
        return isIdle
          ? Ref.set(activityRef, "idle" as ActivityState)
          : Effect.void
      })
    )

    const getState = Ref.get(activityRef)

    const idleChecker = pipe(
      checkIdleStatus,
      Effect.repeat(Schedule.spaced("1 second")),
      Effect.forkScoped
    )

    yield* idleChecker

    return { markActive, getState }
  })
}

// =============================================================================
// Log Writer
// =============================================================================

const makeLogWriter = (config: TmuxLoggerConfig) => {
  const fileManager = makeFileManager(config)

  return Effect.gen(function* () {
    const stateRef = yield* Ref.make<LogFileState>({
      currentFile: fileManager.getCurrentLogPath({
        currentFile: "",
        currentSize: 0,
        rotationCount: 0,
      }),
      currentSize: 0,
      rotationCount: 0,
    })

    yield* fileManager.ensureDirectory

    const rotate = Effect.gen(function* () {
      const state = yield* Ref.get(stateRef)
      const currentPath = fileManager.getCurrentLogPath(state)
      const newPath = fileManager.getRotatedLogPath(state.rotationCount)

      yield* fileManager.rotateFile(currentPath, newPath)
      yield* Ref.update(stateRef, (s) => ({
        ...s,
        currentSize: 0,
        rotationCount: s.rotationCount + 1,
      }))

      return newPath
    })

    const write = (output: ProcessOutput) =>
      Effect.gen(function* () {
        const formatted = `[${new Date(output.timestamp).toISOString()}] ${
          output.data
        }`

        const state = yield* Ref.get(stateRef)
        const currentPath = fileManager.getCurrentLogPath(state)

        if (state.currentSize >= config.maxFileSize) {
          yield* rotate
        }

        yield* fileManager.writeToFile(currentPath, formatted)

        const newSize = yield* fileManager.getFileSize(currentPath)
        yield* Ref.update(stateRef, (s) => ({ ...s, currentSize: newSize }))
      })

    return { write, getState: Ref.get(stateRef) }
  })
}

// =============================================================================
// Tmux Utilities
// =============================================================================

const tmuxUtils = {
  /**
   * Check if tmux is installed
   */
  checkTmuxInstalled: Effect.tryPromise({
    try: async () => {
      await execAsync("which tmux")
      return true
    },
    catch: (cause) =>
      new TmuxError({ message: "tmux not installed", cause }),
  }),

  /**
   * Check if a tmux session exists
   */
  sessionExists: (sessionName: string) =>
    Effect.tryPromise({
      try: async () => {
        try {
          await execAsync(`tmux has-session -t ${sessionName} 2>/dev/null`)
          return true
        } catch {
          return false
        }
      },
      catch: (cause) =>
        new TmuxError({ message: "Failed to check session", cause }),
    }),

  /**
   * Create a new tmux session and run command
   */
  createSession: (sessionName: string, command: string, args: string[]) =>
    Effect.tryPromise({
      try: async () => {
        const fullCommand = [command, ...args].join(" ")
        // Create detached session with command
        await execAsync(
          `tmux new-session -d -s ${sessionName} '${fullCommand}'`
        )
        return sessionName
      },
      catch: (cause) =>
        new TmuxError({ message: "Failed to create session", cause }),
    }),

  /**
   * Get the target pane for a session (usually the first pane)
   */
  getSessionPane: (sessionName: string) =>
    Effect.succeed(`${sessionName}:0.0`),

  /**
   * Start capturing output from a tmux pane to a file
   */
  startCapture: (paneTarget: string, outputFile: string) =>
    Effect.tryPromise({
      try: async () => {
        // Use pipe-pane to redirect output to file
        await execAsync(
          `tmux pipe-pane -t ${paneTarget} -o 'cat >> ${outputFile}'`
        )
        return outputFile
      },
      catch: (cause) =>
        new TmuxError({ message: "Failed to start capture", cause }),
    }),

  /**
   * Stop capturing output
   */
  stopCapture: (paneTarget: string) =>
    Effect.tryPromise({
      try: async () => {
        await execAsync(`tmux pipe-pane -t ${paneTarget}`)
      },
      catch: (cause) =>
        new TmuxError({ message: "Failed to stop capture", cause }),
    }),

  /**
   * Kill a tmux session
   */
  killSession: (sessionName: string) =>
    Effect.tryPromise({
      try: async () => {
        await execAsync(`tmux kill-session -t ${sessionName}`)
      },
      catch: (cause) =>
        new TmuxError({ message: "Failed to kill session", cause }),
    }),

  /**
   * Attach to a tmux session (blocking)
   */
  attachSession: (sessionName: string) =>
    Effect.tryPromise({
      try: async () => {
        // This will inherit stdio and block until user detaches
        const child = spawn("tmux", ["attach", "-t", sessionName], {
          stdio: "inherit",
        })

        return new Promise<void>((resolve, reject) => {
          child.on("exit", (code) => {
            if (code === 0) resolve()
            else reject(new Error(`tmux attach exited with code ${code}`))
          })
          child.on("error", reject)
        })
      },
      catch: (cause) =>
        new TmuxError({ message: "Failed to attach to session", cause }),
    }),

  /**
   * Check if a tmux session is still running
   */
  isSessionAlive: (sessionName: string) =>
    Effect.tryPromise({
      try: async () => {
        try {
          const { stdout } = await execAsync(
            `tmux list-sessions -F '#{session_name}' 2>/dev/null || true`
          )
          return stdout.split("\n").includes(sessionName)
        } catch {
          return false
        }
      },
      catch: () => Effect.succeed(false),
    }),
}

// =============================================================================
// Tmux Process Monitor
// =============================================================================

const monitorTmuxSession = (config: TmuxLoggerConfig, paneTarget: string) =>
  Effect.gen(function* () {
    const outputQueue = yield* Queue.unbounded<ProcessOutput>()
    const exitDeferred = yield* Deferred.make<void>()

    // Create a temporary capture file for tmux pipe-pane
    const captureFile = path.join(
      config.outputDir,
      `${config.sessionName}-capture.tmp`
    )

    // Start capturing to temp file
    yield* tmuxUtils.startCapture(paneTarget, captureFile)

    const parseOutput = (data: string): Effect.Effect<ProcessOutput, SchemaParseError> =>
      pipe(
        {
          source: "tmux-output" as const,
          data,
          timestamp: Date.now(),
        },
        Schema.decodeUnknown(ProcessOutputSchema),
        Effect.mapError(
          (cause) => new SchemaParseError({ data, cause: cause.message })
        )
      )

    // Tail the capture file
    const tailProc = spawn("tail", ["-f", "-n", "+1", captureFile])

    tailProc.stdout.on("data", (chunk: Buffer) => {
      pipe(
        parseOutput(chunk.toString()),
        Effect.flatMap((output) => Queue.offer(outputQueue, output)),
        Effect.runFork
      )
    })

    // Poll session status
    const checkSession = pipe(
      tmuxUtils.isSessionAlive(config.sessionName),
      Effect.flatMap((isAlive) =>
        isAlive
          ? Effect.void
          : pipe(
              Deferred.succeed(exitDeferred, void 0),
              Effect.flatMap(() => Effect.fail("Session ended"))
            )
      ),
      Effect.repeat(Schedule.spaced("1 second")),
      Effect.catchAll(() => Effect.void),
      Effect.forkScoped
    )

    yield* checkSession

    const cleanup = Effect.gen(function* () {
      yield* tmuxUtils.stopCapture(paneTarget)
      tailProc.kill()
      yield* Effect.tryPromise({
        try: () => fs.promises.unlink(captureFile),
        catch: () => Effect.void,
      })
    })

    return {
      outputStream: Stream.fromQueue(outputQueue),
      waitForExit: Deferred.await(exitDeferred),
      cleanup,
    }
  })

// =============================================================================
// Main Tmux Logger
// =============================================================================

export const createTmuxProcessLogger = (
  command: string,
  args: string[],
  config: Partial<TmuxLoggerConfig> = {}
) => {
  const fullConfig = { ...defaultConfig, ...config }

  return Effect.gen(function* () {
    // Check tmux is installed
    yield* tmuxUtils.checkTmuxInstalled

    // Check if session already exists
    const exists = yield* tmuxUtils.sessionExists(fullConfig.sessionName)
    if (exists) {
      return yield* new TmuxError({
        message: `Session '${fullConfig.sessionName}' already exists. Kill it first or use a different name.`,
        cause: "Session exists",
      })
    }

    // Create the session
    yield* tmuxUtils.createSession(fullConfig.sessionName, command, args)
    const paneTarget = yield* tmuxUtils.getSessionPane(fullConfig.sessionName)

    console.log(`✅ Created tmux session: ${fullConfig.sessionName}`)
    console.log(`📺 Attach anytime with: tmux attach -t ${fullConfig.sessionName}`)
    console.log(`📝 Monitoring and logging all output...\n`)

    // Setup monitoring
    const logWriter = yield* makeLogWriter(fullConfig)
    const activityTracker = yield* makeActivityTracker(fullConfig)
    const monitor = yield* monitorTmuxSession(fullConfig, paneTarget)

    // Process output stream
    const processStream = pipe(
      monitor.outputStream,
      Stream.tap((output) =>
        Effect.all([activityTracker.markActive, logWriter.write(output)], {
          concurrency: "unbounded",
        })
      ),
      Stream.runDrain,
      Effect.forkScoped
    )

    yield* processStream

    const sessionInfo: TmuxSessionInfo = {
      sessionName: fullConfig.sessionName,
      isRunning: true,
      attachCommand: `tmux attach -t ${fullConfig.sessionName}`,
    }

    return {
      sessionInfo,
      getActivityState: activityTracker.getState,
      getLogState: logWriter.getState,
      waitForCompletion: monitor.waitForExit,
      attachToSession: tmuxUtils.attachSession(fullConfig.sessionName),
      killSession: pipe(
        monitor.cleanup,
        Effect.flatMap(() => tmuxUtils.killSession(fullConfig.sessionName))
      ),
    }
  }).pipe(Effect.scoped)
}

// =============================================================================
// Example: Claude Code in Tmux
// =============================================================================

const claudeCodeInTmux = Effect.gen(function* () {
  console.log("🚀 Starting claude-code in detached tmux session...\n")

  const logger = yield* createTmuxProcessLogger(
    "claude-code",
    ["--project", "./my-project"],
    {
      maxFileSize: 100 * 1024 * 1024,
      outputDir: "./claude-logs",
      baseFileName: "claude-tmux",
      sessionName: "claude-code-work",
      idleTimeoutMs: 10000,
    }
  )

  console.log(`\n📋 Session Info:`)
  console.log(`   Name: ${logger.sessionInfo.sessionName}`)
  console.log(`   Attach: ${logger.sessionInfo.attachCommand}`)
  console.log(`   Detach: Press Ctrl+B then D\n`)

  // Background monitoring
  const monitor = pipe(
    Effect.gen(function* () {
      let lastState: "idle" | "active" = "idle"

      while (true) {
        const currentState = yield* logger.getActivityState
        const logState = yield* logger.getLogState

        if (currentState !== lastState) {
          console.log(
            `[${new Date().toISOString()}] Claude is ${currentState.toUpperCase()} | Log: ${Math.round(logState.currentSize / 1024)}KB`
          )
          lastState = currentState
        }

        yield* Effect.sleep("5 seconds")
      }
    }),
    Effect.forkScoped
  )

  yield* monitor

  // Give user choice to attach or just monitor
  console.log("🤔 What would you like to do?")
  console.log("   1. Attach to session now (you can detach later)")
  console.log("   2. Just monitor in background (you can attach manually later)")
  console.log("   3. Wait for completion\n")

  // For this example, we'll wait for completion
  // In a real app, you'd prompt the user
  console.log("Waiting for session to complete...")
  console.log("(Attach with: tmux attach -t claude-code-work)\n")

  yield* logger.waitForCompletion

  const finalLogState = yield* logger.getLogState
  console.log("\n✅ Session Complete!")
  console.log(`📁 Log: ${finalLogState.currentFile}`)
  console.log(`📏 Size: ${Math.round(finalLogState.currentSize / 1024)}KB`)
})

// =============================================================================
// Example: Auto-attach
// =============================================================================

const autoAttachExample = Effect.gen(function* () {
  console.log("🚀 Starting and auto-attaching to claude-code...\n")

  const logger = yield* createTmuxProcessLogger("claude-code", ["--help"], {
    sessionName: "claude-auto",
    outputDir: "./logs",
  })

  console.log("Attaching in 2 seconds...")
  console.log("(Remember: Ctrl+B then D to detach)\n")

  yield* Effect.sleep("2 seconds")

  // Attach to session (this blocks until user detaches)
  yield* logger.attachToSession

  console.log("\n👋 You detached! Monitoring continues in background...")
  console.log("Re-attach anytime with: tmux attach -t claude-auto\n")

  // Continue monitoring
  yield* logger.waitForCompletion
})

// =============================================================================
// Example: Monitor existing session
// =============================================================================

export const monitorExistingTmuxSession = (
  sessionName: string,
  config: Partial<TmuxLoggerConfig> = {}
) =>
  Effect.gen(function* () {
    const fullConfig = { ...defaultConfig, ...config, sessionName }

    const exists = yield* tmuxUtils.sessionExists(sessionName)
    if (!exists) {
      return yield* new TmuxError({
        message: `Session '${sessionName}' does not exist`,
        cause: "No session",
      })
    }

    console.log(`📺 Monitoring existing session: ${sessionName}`)

    const paneTarget = yield* tmuxUtils.getSessionPane(sessionName)
    const logWriter = yield* makeLogWriter(fullConfig)
    const activityTracker = yield* makeActivityTracker(fullConfig)
    const monitor = yield* monitorTmuxSession(fullConfig, paneTarget)

    const processStream = pipe(
      monitor.outputStream,
      Stream.tap((output) =>
        Effect.all([activityTracker.markActive, logWriter.write(output)], {
          concurrency: "unbounded",
        })
      ),
      Stream.runDrain,
      Effect.forkScoped
    )

    yield* processStream

    return {
      getActivityState: activityTracker.getState,
      getLogState: logWriter.getState,
      waitForCompletion: monitor.waitForExit,
      attachToSession: tmuxUtils.attachSession(sessionName),
    }
  }).pipe(Effect.scoped)

if (require.main === module) {
  const mode = process.argv[2] || "monitor"

  const program =
    mode === "attach" ? autoAttachExample : claudeCodeInTmux

  pipe(
    program,
    Effect.catchAllDefect((defect) => Effect.logError(`Defect: ${defect}`)),
    Effect.catchAll((error) =>
      Effect.logError(`Error: ${JSON.stringify(error, null, 2)}`)
    ),
    Effect.runPromise
  )
}
