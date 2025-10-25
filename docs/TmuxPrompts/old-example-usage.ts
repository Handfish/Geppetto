import * as Effect from "effect/Effect"
import { pipe } from "effect/Function"
import { createProcessLogger } from "./process-logger"

// =============================================================================
// Real-world Example: Monitor a long-running process
// =============================================================================

const monitorClaudeCodeSession = Effect.gen(function* () {
  console.log("Starting claude-code session with logging...")

  // Create logger for claude-code process (returns scoped Effect)
  const logger = yield* createProcessLogger(
    "claude-code",
    ["--project", "./my-project"],
    {
      maxFileSize: 100 * 1024 * 1024, // 100MB
      outputDir: "./claude-logs",
      baseFileName: "claude-session",
      idleTimeoutMs: 10000, // 10 seconds to consider idle
    }
  )

  // Activity monitoring fiber - scoped to logger's lifecycle
  const activityMonitor = pipe(
    Effect.gen(function* () {
      let lastState: "idle" | "active" = "idle"

      while (true) {
        const currentState = yield* logger.getActivityState
        const logState = yield* logger.getLogState

        // Only log on state changes
        if (currentState !== lastState) {
          const timestamp = new Date().toISOString()
          console.log(
            `[${timestamp}] Claude is now ${currentState.toUpperCase()}`
          )

          if (currentState === "idle") {
            console.log(
              `  Log file: ${logState.currentFile} (${Math.round(logState.currentSize / 1024)}KB)`
            )
          }

          lastState = currentState
        }

        yield* Effect.sleep("1 second")
      }
    }),
    Effect.forkScoped
  )

  yield* activityMonitor

  // File rotation notification - also scoped
  const rotationMonitor = pipe(
    Effect.gen(function* () {
      let lastRotationCount = 0

      while (true) {
        const logState = yield* logger.getLogState

        if (logState.rotationCount > lastRotationCount) {
          console.log(
            `🔄 Log rotated! New file created (rotation #${logState.rotationCount})`
          )
          lastRotationCount = logState.rotationCount
        }

        yield* Effect.sleep("2 seconds")
      }
    }),
    Effect.forkScoped
  )

  yield* rotationMonitor

  // Wait for completion with timeout
  const result = yield* Effect.race(
    logger.waitForCompletion.pipe(
      Effect.tap(() => Effect.log("Process completed naturally"))
    ),
    Effect.sleep("2 hours").pipe(
      Effect.flatMap(() =>
        Effect.gen(function* () {
          console.log("⏱️  Timeout reached, stopping process...")
          yield* logger.stop
          return "timeout"
        })
      )
    )
  )

  const finalLogState = yield* logger.getLogState
  console.log("\n📊 Final Statistics:")
  console.log(`  Total rotations: ${finalLogState.rotationCount}`)
  console.log(
    `  Final file size: ${Math.round(finalLogState.currentSize / 1024)}KB`
  )
  console.log(`  Log location: ${finalLogState.currentFile}`)

  return result
})

// =============================================================================
// Example: Multiple concurrent processes
// =============================================================================

const monitorMultipleProcesses = Effect.gen(function* () {
  console.log("Starting multiple processes with individual loggers...")

  // Create loggers for different processes
  const buildLogger = yield* createProcessLogger("npm", ["run", "build"], {
    outputDir: "./logs",
    baseFileName: "build",
  })

  const testLogger = yield* createProcessLogger("npm", ["run", "test"], {
    outputDir: "./logs",
    baseFileName: "test",
  })

  // Monitor both with proper concurrency
  const result = yield* Effect.all(
    [buildLogger.waitForCompletion, testLogger.waitForCompletion],
    {
      concurrency: "unbounded",
    }
  )

  return result
})

// =============================================================================
// Example: Interactive activity tracking
// =============================================================================

const trackActivityWithCallback = (
  onStateChange: (state: "idle" | "active") => void
) =>
  Effect.gen(function* () {
    const logger = yield* createProcessLogger("your-command", ["args"], {
      idleTimeoutMs: 3000,
    })

    let lastState: "idle" | "active" = "idle"

    // Poll activity state - scoped fiber
    const monitor = pipe(
      Effect.gen(function* () {
        while (true) {
          const currentState = yield* logger.getActivityState

          if (currentState !== lastState) {
            onStateChange(currentState)
            lastState = currentState
          }

          yield* Effect.sleep("500 millis")
        }
      }),
      Effect.forkScoped
    )

    yield* monitor
    yield* logger.waitForCompletion

    return logger
  })

// =============================================================================
// Run examples
// =============================================================================

const main = Effect.gen(function* () {
  console.log("Choose an example:")
  console.log("1. Monitor claude-code (default)")
  console.log("2. Monitor multiple processes")

  // For demo, running the claude-code monitor
  yield* monitorClaudeCodeSession
})

// Execute with comprehensive error handling
pipe(
  main,
  Effect.catchTag("FileWriteError", (error) =>
    Effect.gen(function* () {
      yield* Effect.logError(`Failed to write to ${error.path}`)
      yield* Effect.logError(`Cause: ${error.cause}`)
    })
  ),
  Effect.catchTag("FileRotationError", (error) =>
    Effect.gen(function* () {
      yield* Effect.logError(
        `Failed to rotate ${error.fromPath} -> ${error.toPath}`
      )
      yield* Effect.logError(`Cause: ${error.cause}`)
    })
  ),
  Effect.catchTag("ProcessSpawnError", (error) =>
    Effect.gen(function* () {
      yield* Effect.logError(`Failed to spawn process: ${error.command}`)
      yield* Effect.logError(`Cause: ${error.cause}`)
    })
  ),
  Effect.catchAllDefect((defect) =>
    Effect.logError(`Unexpected defect: ${defect}`)
  ),
  Effect.runPromise
).catch((error) => {
  console.error("Fatal error:", error)
  process.exit(1)
})
