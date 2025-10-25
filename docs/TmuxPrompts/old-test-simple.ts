import * as Effect from "effect/Effect"
import { pipe } from "effect/Function"
import { createProcessLogger } from "./process-logger"

/**
 * Simple test that spawns a process generating lots of output
 * to demonstrate rolling file behavior and activity tracking
 */

const testRollingLogs = Effect.gen(function* () {
  console.log("🚀 Starting rolling log test...\n")

  // Create a simple process that generates output
  // Using 'yes' command which repeatedly outputs "y"
  // We'll limit it with head to avoid infinite output
  const logger = yield* createProcessLogger("sh", [
    "-c",
    "for i in {1..1000}; do echo 'Line '$i': This is a test log entry with some data to make it longer and reach the file size limit faster'; sleep 0.01; done",
  ], {
    maxFileSize: 5 * 1024, // 5KB for testing (will rotate quickly)
    outputDir: "./test-logs",
    baseFileName: "test-output",
    idleTimeoutMs: 2000, // 2 seconds
  })

  console.log("📊 Monitoring process...\n")

  // Monitor activity and file rotation - scoped fiber
  const monitor = pipe(
    Effect.gen(function* () {
      let lastState: "idle" | "active" | null = null
      let lastRotation = 0

      while (true) {
        const state = yield* logger.getActivityState
        const logState = yield* logger.getLogState

        // Report state changes
        if (state !== lastState) {
          const emoji = state === "active" ? "🟢" : "🔵"
          console.log(`${emoji} Status: ${state.toUpperCase()}`)
          lastState = state
        }

        // Report rotations
        if (logState.rotationCount > lastRotation) {
          console.log(
            `🔄 Log rotated! (Rotation #${logState.rotationCount}) - File: ${logState.currentFile}`
          )
          lastRotation = logState.rotationCount
        }

        // Show progress every few seconds
        if (logState.rotationCount % 2 === 0) {
          const sizeMB = (logState.currentSize / 1024).toFixed(2)
          console.log(
            `   Current: ${logState.currentFile} (${sizeMB} KB, ${logState.rotationCount} rotations)`
          )
        }

        yield* Effect.sleep("500 millis")
      }
    }),
    Effect.forkScoped
  )

  yield* monitor

  // Wait for completion
  yield* logger.waitForCompletion

  // Final report
  const finalState = yield* logger.getLogState
  console.log("\n✅ Test completed!")
  console.log(`📁 Total rotations: ${finalState.rotationCount}`)
  console.log(`📄 Final file: ${finalState.currentFile}`)
  console.log(`📏 Final size: ${(finalState.currentSize / 1024).toFixed(2)} KB`)
  console.log(
    `\n💡 Check the ./test-logs directory to see all rotated log files!`
  )
})

/**
 * Test that demonstrates idle detection
 */
const testIdleDetection = Effect.gen(function* () {
  console.log("🚀 Testing idle detection...\n")

  // Process that produces output in bursts
  const logger = yield* createProcessLogger("sh", [
    "-c",
    "echo 'Burst 1'; sleep 1; echo 'Still going'; sleep 4; echo 'Burst 2 after idle'; sleep 1; echo 'Done'",
  ], {
    outputDir: "./test-logs",
    baseFileName: "idle-test",
    idleTimeoutMs: 2000, // 2 seconds to go idle
  })

  const monitor = pipe(
    Effect.gen(function* () {
      let lastState: "idle" | "active" | null = null

      while (true) {
        const state = yield* logger.getActivityState

        if (state !== lastState) {
          const timestamp = new Date().toISOString().split("T")[1]
          const emoji = state === "active" ? "🟢" : "🔵"
          console.log(`[${timestamp}] ${emoji} Process is now ${state}`)
          lastState = state
        }

        yield* Effect.sleep("200 millis")
      }
    }),
    Effect.forkScoped
  )

  yield* monitor
  yield* logger.waitForCompletion

  console.log("\n✅ Idle detection test completed!")
})

/**
 * Main test runner
 */
const main = Effect.gen(function* () {
  const testChoice = process.argv[2] || "rolling"

  if (testChoice === "idle") {
    yield* testIdleDetection
  } else {
    yield* testRollingLogs
  }
})

// Run with comprehensive error handling
pipe(
  main,
  Effect.catchTag("FileWriteError", (error) =>
    Effect.gen(function* () {
      yield* Effect.logError(`❌ File write failed: ${error.path}`)
      yield* Effect.logError(`   Cause: ${JSON.stringify(error.cause)}`)
    })
  ),
  Effect.catchTag("ProcessSpawnError", (error) =>
    Effect.gen(function* () {
      yield* Effect.logError(`❌ Process spawn failed: ${error.command}`)
      yield* Effect.logError(`   Cause: ${JSON.stringify(error.cause)}`)
    })
  ),
  Effect.catchAllDefect((defect) =>
    Effect.logError(`❌ Unexpected error: ${defect}`)
  ),
  Effect.runPromise
).catch((error) => {
  console.error("💥 Fatal error:", error)
  process.exit(1)
})

console.log(`
Test Options:
  npm test          - Run rolling log test (default)
  npm test idle     - Run idle detection test
`)
