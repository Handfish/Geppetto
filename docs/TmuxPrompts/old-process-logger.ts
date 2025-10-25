import * as Effect from "effect/Effect"
import * as Stream from "effect/Stream"
import * as Chunk from "effect/Chunk"
import * as Queue from "effect/Queue"
import * as Deferred from "effect/Deferred"
import * as Ref from "effect/Ref"
import * as Schedule from "effect/Schedule"
import * as Scope from "effect/Scope"
import { pipe } from "effect/Function"
import * as Schema from "effect/Schema"
import * as fs from "node:fs"
import * as path from "node:path"
import { spawn } from "node:child_process"

// =============================================================================
// Domain Models with Schema
// =============================================================================

const ProcessOutputSchema = Schema.Struct({
  source: Schema.Literal("stdout", "stderr"),
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

// =============================================================================
// Tagged Errors
// =============================================================================

class FileWriteError extends Schema.TaggedError<FileWriteError>()(
  "FileWriteError",
  {
    path: Schema.String,
    cause: Schema.Unknown,
  }
) {}

class FileRotationError extends Schema.TaggedError<FileRotationError>()(
  "FileRotationError",
  {
    fromPath: Schema.String,
    toPath: Schema.String,
    cause: Schema.Unknown,
  }
) {}

class ProcessSpawnError extends Schema.TaggedError<ProcessSpawnError>()(
  "ProcessSpawnError",
  {
    command: Schema.String,
    cause: Schema.Unknown,
  }
) {}

class SchemaParseError extends Schema.TaggedError<SchemaParseError>()(
  "SchemaParseError",
  {
    data: Schema.Unknown,
    cause: Schema.Unknown,
  }
) {}

// =============================================================================
// Configuration
// =============================================================================

interface LoggerConfig {
  readonly maxFileSize: number // bytes
  readonly outputDir: string
  readonly baseFileName: string
  readonly idleTimeoutMs: number // time without output to consider idle
}

const defaultConfig: LoggerConfig = {
  maxFileSize: 100 * 1024 * 1024, // 100MB
  outputDir: "./logs",
  baseFileName: "process-output",
  idleTimeoutMs: 5000, // 5 seconds
}

// =============================================================================
// File Management Service
// =============================================================================

const makeFileManager = (config: LoggerConfig) => {
  const getCurrentLogPath = (state: LogFileState): string =>
    path.join(config.outputDir, `${config.baseFileName}.log`)

  const getRotatedLogPath = (rotationCount: number): string =>
    path.join(
      config.outputDir,
      `${config.baseFileName}.${rotationCount}.log`
    )

  const ensureDirectory = Effect.tryPromise({
    try: () => fs.promises.mkdir(config.outputDir, { recursive: true }),
    catch: (cause) =>
      new FileWriteError({
        path: config.outputDir,
        cause,
      }),
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
      catch: (cause) =>
        new FileRotationError({
          fromPath,
          toPath,
          cause,
        }),
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

const makeActivityTracker = (config: LoggerConfig) => {
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

    // Background fiber to check idle status - scoped to parent lifecycle
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
// Log Writer with Rolling Files
// =============================================================================

const makeLogWriter = (config: LoggerConfig) => {
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
        const formatted = `[${new Date(output.timestamp).toISOString()}] [${
          output.source
        }] ${output.data}`

        const state = yield* Ref.get(stateRef)
        const currentPath = fileManager.getCurrentLogPath(state)

        // Check if rotation is needed
        if (state.currentSize >= config.maxFileSize) {
          yield* rotate
        }

        // Write to file
        yield* fileManager.writeToFile(currentPath, formatted)

        // Update size
        const newSize = yield* fileManager.getFileSize(currentPath)
        yield* Ref.update(stateRef, (s) => ({ ...s, currentSize: newSize }))
      })

    return { write, getState: Ref.get(stateRef) }
  })
}

// =============================================================================
// Process Stream
// =============================================================================

const spawnProcess = (command: string, args: string[]) =>
  Effect.gen(function* () {
    const outputQueue = yield* Queue.unbounded<ProcessOutput>()
    const exitDeferred = yield* Deferred.make<void>()

    const proc = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] })

    if (!proc.stdout || !proc.stderr) {
      return yield* new ProcessSpawnError({ command, cause: "No stdio" })
    }

    // Parse output using Schema
    const parseOutput = (
      source: "stdout" | "stderr",
      data: Buffer
    ): Effect.Effect<ProcessOutput, SchemaParseError> =>
      pipe(
        {
          source,
          data: data.toString(),
          timestamp: Date.now(),
        },
        Schema.decodeUnknown(ProcessOutputSchema),
        Effect.mapError(
          (cause) => new SchemaParseError({ data, cause: cause.message })
        )
      )

    // Handle stdout
    proc.stdout.on("data", (data: Buffer) => {
      pipe(
        parseOutput("stdout", data),
        Effect.flatMap((output) => Queue.offer(outputQueue, output)),
        Effect.runFork
      )
    })

    // Handle stderr
    proc.stderr.on("data", (data: Buffer) => {
      pipe(
        parseOutput("stderr", data),
        Effect.flatMap((output) => Queue.offer(outputQueue, output)),
        Effect.runFork
      )
    })

    // Handle exit
    proc.on("close", () => {
      pipe(Deferred.succeed(exitDeferred, void 0), Effect.runFork)
    })

    proc.on("error", (error) => {
      pipe(Deferred.fail(exitDeferred, error), Effect.runFork)
    })

    const outputStream = Stream.fromQueue(outputQueue)
    const waitForExit = Deferred.await(exitDeferred)

    return { outputStream, waitForExit, kill: () => proc.kill() }
  })

// =============================================================================
// Main Logger
// =============================================================================

export const createProcessLogger = (
  command: string,
  args: string[],
  config: Partial<LoggerConfig> = {}
) => {
  const fullConfig = { ...defaultConfig, ...config }

  return Effect.gen(function* () {
    const logWriter = yield* makeLogWriter(fullConfig)
    const activityTracker = yield* makeActivityTracker(fullConfig)
    const processHandle = yield* spawnProcess(command, args)

    // Process output stream with concurrency control - scoped fiber
    const processStream = pipe(
      processHandle.outputStream,
      Stream.tap((output) =>
        Effect.all([activityTracker.markActive, logWriter.write(output)], {
          concurrency: "unbounded",
        })
      ),
      Stream.runDrain,
      Effect.forkScoped
    )

    yield* processStream

    const getActivityState = activityTracker.getState
    const getLogState = logWriter.getState

    const waitForCompletion = processHandle.waitForExit

    const stop = Effect.sync(() => processHandle.kill())

    return {
      getActivityState,
      getLogState,
      waitForCompletion,
      stop,
    }
  }).pipe(Effect.scoped)
}

// =============================================================================
// Example Usage
// =============================================================================

const example = Effect.gen(function* () {
  // Logger is now scoped - the scope manages all background fibers
  const logger = yield* createProcessLogger("npm", ["run", "dev"], {
    maxFileSize: 100 * 1024 * 1024, // 100MB
    outputDir: "./logs",
    baseFileName: "npm-output",
    idleTimeoutMs: 5000,
  })

  // Monitor activity in a background fiber - also scoped
  const monitor = pipe(
    Effect.gen(function* () {
      while (true) {
        const state = yield* logger.getActivityState
        const logState = yield* logger.getLogState
        console.log(
          `Activity: ${state}, File: ${logState.currentFile}, Size: ${Math.round(logState.currentSize / 1024)}KB`
        )
        yield* Effect.sleep("2 seconds")
      }
    }),
    Effect.forkScoped
  )

  yield* monitor

  // Wait for process to complete or timeout
  yield* Effect.race(
    logger.waitForCompletion,
    Effect.sleep("1 hour").pipe(Effect.flatMap(() => logger.stop))
  )
})

// Run with proper error handling
// Note: Effect.scoped is already applied in createProcessLogger
if (require.main === module) {
  pipe(
    example,
    Effect.catchAllDefect((defect) =>
      Effect.logError(`Defect: ${defect}`)
    ),
    Effect.catchAll((error) =>
      Effect.logError(`Error: ${JSON.stringify(error, null, 2)}`)
    ),
    Effect.runPromise
  )
}
