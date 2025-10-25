import * as Effect from "effect/Effect"
import { pipe } from "effect/Function"
import {
  createTmuxProcessLogger,
  monitorExistingTmuxSession,
} from "./tmux-logger"

// =============================================================================
// Example 1: Basic - Start and Monitor in Background
// =============================================================================

const basicExample = Effect.gen(function* () {
  console.log("📺 Example 1: Start claude-code in tmux, monitor in background\n")

  const logger = yield* createTmuxProcessLogger(
    "claude-code",
    ["--project", "./my-project"],
    {
      sessionName: "claude-work",
      outputDir: "./logs",
      baseFileName: "claude-work",
    }
  )

  console.log(`\n✨ Session created!`)
  console.log(`   To interact: ${logger.sessionInfo.attachCommand}`)
  console.log(`   To detach: Ctrl+B, then D`)
  console.log(`\nMonitoring in background...\n`)

  // Monitor activity
  const monitor = pipe(
    Effect.gen(function* () {
      while (true) {
        const state = yield* logger.getActivityState
        const logState = yield* logger.getLogState

        console.log(
          `Status: ${state.padEnd(6)} | ` +
            `Log: ${Math.round(logState.currentSize / 1024).toString().padStart(5)}KB`
        )

        yield* Effect.sleep("10 seconds")
      }
    }),
    Effect.forkScoped
  )

  yield* monitor
  yield* logger.waitForCompletion

  console.log("\n✅ Session ended")
})

// =============================================================================
// Example 2: Monitor multiple sessions
// =============================================================================

const multipleSessionsExample = Effect.gen(function* () {
  console.log("📺 Example: Monitor multiple claude-code sessions\n")

  const sessions = yield* Effect.all(
    [
      createTmuxProcessLogger("claude-code", ["--project", "./frontend"], {
        sessionName: "claude-frontend",
        baseFileName: "frontend",
      }),
      createTmuxProcessLogger("claude-code", ["--project", "./backend"], {
        sessionName: "claude-backend",
        baseFileName: "backend",
      }),
    ],
    { concurrency: 2 }
  )

  console.log("\n✅ Started sessions:")
  sessions.forEach((s) => console.log(`   - ${s.sessionInfo.attachCommand}`))

  yield* Effect.all(
    sessions.map((s) => s.waitForCompletion),
    { concurrency: "unbounded" }
  )
})

// =============================================================================
// Run Examples
// =============================================================================

const examples = {
  basic: basicExample,
  multiple: multipleSessionsExample,
}

const exampleName = (process.argv[2] || "basic") as keyof typeof examples

pipe(
  examples[exampleName],
  Effect.catchAll((error) =>
    Effect.logError(`Error: ${JSON.stringify(error, null, 2)}`)
  ),
  Effect.runPromise
)
