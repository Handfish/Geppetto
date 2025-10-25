/**
 * Minimal Example: Structured Concurrency with Effect.forkScoped
 * 
 * This file demonstrates the core pattern used in the process logger
 * in a simple, easy-to-understand example.
 */

import * as Effect from "effect/Effect"
import * as Ref from "effect/Ref"
import * as Schedule from "effect/Schedule"
import { pipe } from "effect/Function"

// =============================================================================
// Example 1: Simple Background Task
// =============================================================================

const simpleBackgroundTask = Effect.gen(function* () {
  console.log("Main task starting")

  // Background fiber that logs periodically
  const background = pipe(
    Effect.log("Background tick"),
    Effect.repeat(Schedule.spaced("500 millis")),
    Effect.forkScoped // ← Scoped to this Effect's lifetime
  )

  // Start the background fiber
  yield* background

  // Do some work
  yield* Effect.sleep("2 seconds")
  console.log("Main task finishing")

  // Background fiber automatically stops when this Effect completes
}).pipe(Effect.scoped) // ← Creates the scope

// =============================================================================
// Example 2: State Monitoring Pattern (like Activity Tracker)
// =============================================================================

const monitoredService = Effect.gen(function* () {
  // Mutable state
  const counter = yield* Ref.make(0)

  // Background monitor that checks state
  const monitor = pipe(
    Effect.gen(function* () {
      while (true) {
        const value = yield* Ref.get(counter)
        console.log(`Monitor: counter = ${value}`)
        yield* Effect.sleep("1 second")
      }
    }),
    Effect.forkScoped // ← Lives as long as the service
  )

  yield* monitor

  // Simulate work that updates state
  for (let i = 0; i < 5; i++) {
    yield* Ref.update(counter, (n) => n + 1)
    yield* Effect.sleep("800 millis")
  }

  console.log("Service shutting down")
  // Monitor automatically stops here

}).pipe(Effect.scoped)

// =============================================================================
// Example 3: Multiple Workers (like Stream Processing)
// =============================================================================

const workerPool = Effect.gen(function* () {
  const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  const processed = yield* Ref.make<number[]>([])

  // Worker that processes items
  const createWorker = (id: number) =>
    Effect.gen(function* () {
      for (const item of items) {
        console.log(`Worker ${id} processing ${item}`)
        yield* Effect.sleep("200 millis")
        yield* Ref.update(processed, (arr) => [...arr, item])
      }
    })

  // Spawn 3 workers, all scoped
  yield* Effect.all(
    [createWorker(1), createWorker(2), createWorker(3)].map((worker) =>
      pipe(worker, Effect.forkScoped)
    ),
    { concurrency: "unbounded" }
  )

  yield* Effect.sleep("3 seconds")

  const final = yield* Ref.get(processed)
  console.log(`Processed ${final.length} items`)

  // All workers automatically cleaned up here
}).pipe(Effect.scoped)

// =============================================================================
// Example 4: Process Logger Pattern
// =============================================================================

/**
 * Simplified version of the process logger showing the key pattern
 */
const miniProcessLogger = (command: string) =>
  Effect.gen(function* () {
    const isActive = yield* Ref.make(false)

    // Simulate stdout processing (like Stream.runDrain)
    const streamProcessor = pipe(
      Effect.gen(function* () {
        console.log(`Processing output from: ${command}`)
        while (true) {
          yield* Ref.set(isActive, true)
          // Simulate receiving data
          yield* Effect.sleep("1 second")
          console.log("  Received data chunk")
        }
      }),
      Effect.forkScoped // ← Scoped to logger lifetime
    )

    yield* streamProcessor

    // Idle checker (like activity tracker)
    const idleChecker = pipe(
      Effect.gen(function* () {
        while (true) {
          const active = yield* Ref.get(isActive)
          console.log(`  Status: ${active ? "ACTIVE" : "IDLE"}`)
          yield* Effect.sleep("2 seconds")
        }
      }),
      Effect.forkScoped // ← Also scoped to logger lifetime
    )

    yield* idleChecker

    // Return API (like logger.getActivityState, etc.)
    return {
      getState: Ref.get(isActive),
      stop: Effect.log("Logger stopped"),
    }
  }).pipe(Effect.scoped) // ← Creates scope for both fibers

// Usage
const useLogger = Effect.gen(function* () {
  const logger = yield* miniProcessLogger("my-command")

  // Logger fibers are running in background

  yield* Effect.sleep("5 seconds")

  const state = yield* logger.getState
  console.log(`Current state: ${state}`)

  // When this Effect completes, logger scope closes
  // Both streamProcessor and idleChecker are automatically interrupted
})

// =============================================================================
// Example 5: Nested Scopes (User + Logger)
// =============================================================================

const nestedScopesExample = Effect.gen(function* () {
  console.log("Application starting")

  // Logger with its own scope
  const logger = yield* miniProcessLogger("build-process")

  // User's own background task
  const userMonitor = pipe(
    Effect.gen(function* () {
      while (true) {
        console.log("User monitor running")
        yield* Effect.sleep("1.5 seconds")
      }
    }),
    Effect.forkScoped // ← Scoped to application lifetime
  )

  yield* userMonitor

  // Wait for a bit
  yield* Effect.sleep("6 seconds")

  console.log("Application shutting down")

  // Cleanup order:
  // 1. userMonitor interrupted (application scope closing)
  // 2. logger scope closes
  // 3. logger's streamProcessor interrupted
  // 4. logger's idleChecker interrupted
})

// =============================================================================
// Run Examples
// =============================================================================

const examples = {
  simple: simpleBackgroundTask,
  monitor: monitoredService,
  workers: workerPool,
  logger: useLogger,
  nested: nestedScopesExample,
}

const exampleName = (process.argv[2] || "simple") as keyof typeof examples

console.log(`\n=== Running: ${exampleName} ===\n`)

Effect.runPromise(examples[exampleName])
  .then(() => console.log("\n=== Completed ===\n"))
  .catch((error) => console.error("Error:", error))

// =============================================================================
// Key Patterns Summary
// =============================================================================

/**
 * Pattern 1: Single Background Fiber
 * 
 *   Effect.gen(function* () {
 *     const fiber = yield* task.pipe(Effect.forkScoped)
 *     // do work
 *   }).pipe(Effect.scoped)
 * 
 * Pattern 2: State + Monitor
 * 
 *   Effect.gen(function* () {
 *     const state = yield* Ref.make(initialState)
 *     const monitor = yield* monitorLoop.pipe(Effect.forkScoped)
 *     return { getState: Ref.get(state) }
 *   }).pipe(Effect.scoped)
 * 
 * Pattern 3: Multiple Fibers
 * 
 *   Effect.gen(function* () {
 *     yield* Effect.all(
 *       tasks.map(t => pipe(t, Effect.forkScoped)),
 *       { concurrency: "unbounded" }
 *     )
 *   }).pipe(Effect.scoped)
 * 
 * Pattern 4: Nested Scopes
 * 
 *   Effect.gen(function* () {
 *     const service = yield* createService // service has .pipe(Effect.scoped)
 *     const userFiber = yield* task.pipe(Effect.forkScoped)
 *     // service scope is nested in this scope
 *   })
 */
